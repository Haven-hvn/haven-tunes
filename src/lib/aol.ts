import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import { DerivedPublicKey, EncryptedVetKey, TransportSecretKey } from '@icp-sdk/vetkeys';
import type { HavenConfig, MediaItem } from '../types';
import { type Eip1193Provider, signTypedDataV4 } from './evm';
import { getHavenOsBridge } from './osBridge';

const AOL_IDL: IDL.InterfaceFactory = ({ IDL: idl }) => {
  const GateKeyArgs = idl.Record({
    chain_id: idl.Nat64,
    token_address: idl.Text,
    threshold: idl.Text,
    epoch: idl.Nat64,
    requester: idl.Text,
    signature: idl.Text,
    transport_public_key: idl.Vec(idl.Nat8),
  });
  const GateKeyResult = idl.Variant({
    Ok: idl.Record({
      encrypted_key: idl.Vec(idl.Nat8),
      public_key: idl.Vec(idl.Nat8),
      identity: idl.Vec(idl.Nat8),
    }),
    Err: idl.Text,
  });
  return idl.Service({
    encrypted_key_for_gate: idl.Func([GateKeyArgs], [GateKeyResult], []),
    vetkd_public_key: idl.Func([], [idl.Variant({ Ok: idl.Vec(idl.Nat8), Err: idl.Text })], []),
  });
};

export interface UnlockedGateKey {
  gateId: string;
  epoch: number;
  rawKeyMaterial: Uint8Array;
  unlockedAt: number;
}

export async function unlockGateViaVetKd(params: {
  config: HavenConfig;
  provider: Eip1193Provider;
  address: string;
  chainId: number;
  tokenAddress: string;
  threshold: string;
  epoch?: number;
  gateId: string;
}): Promise<UnlockedGateKey> {
  const epoch = params.epoch ?? Math.floor(Date.now() / 1000 / 86400);
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      GateRequestV3: [
        { name: 'chainId', type: 'uint256' },
        { name: 'tokenAddress', type: 'address' },
        { name: 'threshold', type: 'string' },
        { name: 'epoch', type: 'uint64' },
        { name: 'requester', type: 'address' },
      ],
    },
    primaryType: 'GateRequestV3',
    domain: {
      name: 'Haven-AOL',
      version: '3',
      chainId: params.chainId,
    },
    message: {
      chainId: params.chainId,
      tokenAddress: params.tokenAddress,
      threshold: params.threshold,
      epoch,
      requester: params.address,
    },
  };

  const signature = await signTypedDataV4(params.provider, params.address, typedData);
  const tsk = TransportSecretKey.random();

  const agent = await HttpAgent.create({ host: params.config.icpHost || 'https://icp-api.io' });
  const actor = Actor.createActor(AOL_IDL, {
    agent,
    canisterId: params.config.aolCanisterId,
  }) as unknown as {
    encrypted_key_for_gate: (args: {
      chain_id: bigint;
      token_address: string;
      threshold: string;
      epoch: bigint;
      requester: string;
      signature: string;
      transport_public_key: number[];
    }) => Promise<
      | { Ok: { encrypted_key: Uint8Array | number[]; public_key: Uint8Array | number[]; identity: Uint8Array | number[] } }
      | { Err: string }
    >;
  };

  const res = await actor.encrypted_key_for_gate({
    chain_id: BigInt(params.chainId),
    token_address: params.tokenAddress.toLowerCase(),
    threshold: params.threshold,
    epoch: BigInt(epoch),
    requester: params.address.toLowerCase(),
    signature,
    transport_public_key: Array.from(tsk.publicKeyBytes()),
  });

  if ('Err' in res) {
    throw new Error(`Haven-AOL rejected unlock: ${res.Err}`);
  }

  const encVetKey = EncryptedVetKey.deserialize(new Uint8Array(res.Ok.encrypted_key));
  const dpk = DerivedPublicKey.deserialize(new Uint8Array(res.Ok.public_key));
  const vetKey = encVetKey.decryptAndVerify(tsk, dpk, new Uint8Array(res.Ok.identity));
  const rawKeyMaterial = await vetKey.deriveSymmetricKey('haven-aes-256-gcm', 32);

  return {
    gateId: params.gateId,
    epoch,
    rawKeyMaterial: new Uint8Array(rawKeyMaterial),
    unlockedAt: Date.now(),
  };
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  const buf = new ArrayBuffer(raw.byteLength);
  new Uint8Array(buf).set(raw);
  return crypto.subtle.importKey('raw', buf, { name: 'AES-GCM' }, false, ['decrypt']);
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/**
 * Supports both Haven HVN1 framed chunks (`HVN1` magic + chunk frames)
 * and standard `[12-byte IV][ciphertext+tag]` AES-GCM blobs.
 */
export async function decryptMediaBytes(
  ciphertext: Uint8Array,
  keyMaterial: Uint8Array,
  gateJson?: Record<string, unknown>,
): Promise<Uint8Array> {
  let contentKeyBytes = keyMaterial;

  // Unwrap per-file AES key if gateJson carries wrappedKey + iv
  if (gateJson && typeof gateJson.wrappedKey === 'string' && typeof gateJson.iv === 'string') {
    try {
      const kek = await importAesKey(keyMaterial);
      const unwrapped = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(gateJson.iv)) },
        kek,
        toArrayBuffer(fromBase64(gateJson.wrappedKey)),
      );
      contentKeyBytes = new Uint8Array(unwrapped);
    } catch {
      // fall back to direct key material
    }
  }

  const aesKey = await importAesKey(contentKeyBytes);

  // Check for HVN1 framed stream: [4B "HVN1"][4B chunkCount][for each: 12B iv + 4B len + ct]
  if (
    ciphertext.byteLength > 12 &&
    ciphertext[0] === 0x48 &&
    ciphertext[1] === 0x56 &&
    ciphertext[2] === 0x4e &&
    ciphertext[3] === 0x31
  ) {
    const view = new DataView(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
    const chunkCount = view.getUint32(4, false);
    let offset = 8;
    const parts: Uint8Array[] = [];
    let total = 0;
    for (let i = 0; i < chunkCount && offset + 16 <= ciphertext.byteLength; i++) {
      const iv = ciphertext.subarray(offset, offset + 12);
      const len = view.getUint32(offset + 12, false);
      offset += 16;
      const chunk = ciphertext.subarray(offset, offset + len);
      offset += len;
      const plain = new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, aesKey, toArrayBuffer(chunk)),
      );
      parts.push(plain);
      total += plain.byteLength;
    }
    const merged = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      merged.set(p, pos);
      pos += p.byteLength;
    }
    return merged;
  }

  // Standard raw [12B IV][ciphertext+tag]
  const iv = ciphertext.subarray(0, 12);
  const body = ciphertext.subarray(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    aesKey,
    toArrayBuffer(body),
  );
  return new Uint8Array(plain);
}

const LOCAL_MEDIA_CACHE_MAX_BYTES = 128 * 1024 * 1024;
const localRawMediaCache = new Map<string, Uint8Array>();
let localRawMediaBytes = 0;

function rememberLocalRaw(key: string, bytes: Uint8Array): void {
  if (bytes.byteLength === 0 || bytes.byteLength > LOCAL_MEDIA_CACHE_MAX_BYTES) return;
  const existing = localRawMediaCache.get(key);
  if (existing) {
    localRawMediaBytes -= existing.byteLength;
    localRawMediaCache.delete(key);
  }
  while (localRawMediaBytes + bytes.byteLength > LOCAL_MEDIA_CACHE_MAX_BYTES && localRawMediaCache.size > 0) {
    const firstKey = localRawMediaCache.keys().next().value as string;
    const evicted = localRawMediaCache.get(firstKey);
    if (evicted) localRawMediaBytes -= evicted.byteLength;
    localRawMediaCache.delete(firstKey);
  }
  localRawMediaCache.set(key, bytes);
  localRawMediaBytes += bytes.byteLength;
}

export async function fetchAndPrepareMediaUrl(
  item: MediaItem,
  unlockedKey?: UnlockedGateKey,
): Promise<{ objectUrl: string; decrypted: boolean; bytes: number }> {
  if (!item.mediaUrl) {
    throw new Error('No IPFS/Filecoin CID or media URL attached to this Arkiv entity.');
  }

  const cacheKey = item.cid
    ? item.encrypted
      ? `piece:${item.cid}`
      : `fcid:${item.cid}`
    : `url:${item.mediaUrl}`;

  const bridge = getHavenOsBridge();
  let raw: Uint8Array | null = null;

  // 1. Check Haven OS shared IndexedDB media cache (shared across all embedded apps)
  if (bridge?.connectedToHost) {
    try {
      const hit = await bridge.mediaCacheGet(cacheKey);
      if (hit?.bytes) {
        raw = new Uint8Array(hit.bytes);
      }
    } catch {
      // Fall through to local cache / network fetch
    }
  }

  // 2. Fall back to in-memory cache (for standalone mode)
  if (!raw) {
    raw = localRawMediaCache.get(cacheKey) ?? null;
  }

  // 3. Fetch over the network on cache miss and persist into shared + local caches
  if (!raw) {
    const transferId = `ht-dl-${item.cid || item.id}`;
    const label = item.title || item.cid || 'Haven media';
    const fromSource = item.encrypted ? 'Filecoin / IPFS (Sealed)' : 'IPFS Gateway';
    bridge?.reportTransfer({
      id: transferId,
      direction: 'download',
      label,
      from: fromSource,
      to: 'Haven Tunes (Haven OS Cache)',
      loaded: 0,
      ...(item.sizeBytes ? { total: item.sizeBytes } : {}),
      status: 'active',
    });
    try {
      const resp = await fetch(item.mediaUrl);
      if (!resp.ok) {
        throw new Error(`Gateway fetch failed (${resp.status}) for ${item.cid || item.mediaUrl}`);
      }
      const headerTotal = Number(resp.headers.get('content-length') || 0);
      const total = headerTotal > 0 ? headerTotal : item.sizeBytes || undefined;

      if (resp.body && bridge?.connectedToHost) {
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        let lastEmit = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            const now = Date.now();
            if (now - lastEmit >= 100) {
              lastEmit = now;
              bridge.reportTransfer({
                id: transferId,
                direction: 'download',
                label,
                from: fromSource,
                to: 'Haven Tunes (Haven OS Cache)',
                loaded,
                ...(total ? { total } : {}),
                status: 'active',
              });
            }
          }
        }
        raw = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          raw.set(chunk, offset);
          offset += chunk.byteLength;
        }
      } else {
        raw = new Uint8Array(await resp.arrayBuffer());
      }

      bridge?.reportTransfer({
        id: transferId,
        direction: 'download',
        label,
        from: fromSource,
        to: 'Haven Tunes (Haven OS Cache)',
        loaded: raw.byteLength,
        total: raw.byteLength,
        status: 'done',
      });
    } catch (err) {
      bridge?.reportTransfer({
        id: transferId,
        direction: 'download',
        label,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    rememberLocalRaw(cacheKey, raw);
    if (bridge?.connectedToHost) {
      void bridge
        .mediaCachePut({
          key: cacheKey,
          bytes: toArrayBuffer(raw),
          mimeType: item.mimeType || 'video/mp4',
          encrypted: Boolean(item.encrypted),
        })
        .catch(() => undefined);
    }
  }

  if (item.encrypted) {
    if (!unlockedKey) {
      throw new Error('Encrypted DataDAO item — unlock this gate via Haven-AOL VetKD first.');
    }
    const plain = await decryptMediaBytes(raw, unlockedKey.rawKeyMaterial, item.gateJson);
    const blob = new Blob([toArrayBuffer(plain)], { type: item.mimeType || 'video/mp4' });
    return { objectUrl: URL.createObjectURL(blob), decrypted: true, bytes: plain.byteLength };
  }

  const blob = new Blob([toArrayBuffer(raw)], { type: item.mimeType || 'video/mp4' });
  return { objectUrl: URL.createObjectURL(blob), decrypted: false, bytes: raw.byteLength };
}
