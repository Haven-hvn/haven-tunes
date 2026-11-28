import { Actor, AnonymousIdentity, HttpAgent } from '@icp-sdk/core/agent';
import { IDL } from '@icp-sdk/core/candid';
import {
  DerivedPublicKey,
  EncryptedVetKey,
  IbeCiphertext,
  TransportSecretKey,
  VetKey,
} from '@icp-sdk/vetkeys';
import type { HavenAolChainVariant, HavenConfig, MediaItem } from '../types';
import { aolVariantFor, currentEpochNow } from './config';
import { type Eip1193Provider, signTypedDataV4 } from './evm';
import { getHavenOsBridge } from './osBridge';

const ChainVariantIdl = IDL.Variant({
  EthMainnet: IDL.Null,
  EthSepolia: IDL.Null,
  ArbitrumOne: IDL.Null,
  BaseMainnet: IDL.Null,
  OptimismMainnet: IDL.Null,
});

const GateRequestV3Idl = IDL.Record({
  chain: ChainVariantIdl,
  tokenAddress: IDL.Text,
  threshold: IDL.Nat,
  epoch: IDL.Nat,
  evmAddress: IDL.Text,
  transportPublicKey: IDL.Vec(IDL.Nat8),
  nonce: IDL.Nat,
  signature: IDL.Vec(IDL.Nat8),
  eip712ChainId: IDL.Nat,
  eip712VerifyingContract: IDL.Text,
});

const GateErrorIdl = IDL.Variant({
  InsufficientBalance: IDL.Record({ required: IDL.Nat, actual: IDL.Nat }),
  InvalidAddress: IDL.Text,
  InvalidThreshold: IDL.Null,
  InvalidEpoch: IDL.Text,
  EvmRpcError: IDL.Text,
  VetKDError: IDL.Text,
  InvalidSignature: IDL.Text,
  NonceAlreadyUsed: IDL.Null,
});

const GateResultIdl = IDL.Variant({
  ok: IDL.Record({
    encrypted_key: IDL.Vec(IDL.Nat8),
    verification_key: IDL.Vec(IDL.Nat8),
  }),
  err: GateErrorIdl,
});

const AOL_V3_IDL: IDL.InterfaceFactory = () =>
  IDL.Service({
    requestDecryptionKeyV3: IDL.Func([GateRequestV3Idl], [GateResultIdl], []),
    getCurrentEpoch: IDL.Func([], [IDL.Nat], ['query']),
    getAttestationPublicKey: IDL.Func([], [IDL.Vec(IDL.Nat8)], ['query']),
  });

export interface UnlockedGateKey {
  gateId: string;
  epoch: number;
  rawKeyMaterial: Uint8Array;
  vetKey?: VetKey;
  unlockedAt: number;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = '0x';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out as `0x${string}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function computeDerivationInputV3(
  chainVariant: HavenAolChainVariant,
  tokenAddress: string,
  threshold: string,
  epoch: number,
): Promise<Uint8Array> {
  const effectiveEpoch = threshold === '0' ? 0 : epoch;
  const preimage = `accessol_v3:${chainVariant}:${tokenAddress.toLowerCase()}:${threshold}:${effectiveEpoch}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(preimage));
  return new Uint8Array(digest);
}

/**
 * Restores a `VetKey` from the base64 representation returned by Haven OS Bridge (`haven_getGateKey` / `haven_unlockGate`).
 */
export function deserializeBridgeVetKey(vetKeyBase64?: string): VetKey | undefined {
  if (!vetKeyBase64) return undefined;
  try {
    return VetKey.deserialize(fromBase64(vetKeyBase64));
  } catch {
    return undefined;
  }
}

/**
 * Performs a real Haven-AOL v3 epoch unlock (EIP-712 GateRequestV3 -> ICP VetKD canister -> VetKey recovery).
 */
export async function unlockGateViaVetKd(params: {
  config: HavenConfig;
  provider: Eip1193Provider;
  address: string;
  chainId: number;
  chainVariant?: HavenAolChainVariant;
  tokenAddress: string;
  threshold: string;
  epoch?: number;
  gateId: string;
}): Promise<UnlockedGateKey> {
  const epoch = params.epoch ?? currentEpochNow();
  const chainVariant = params.chainVariant ?? aolVariantFor(params.chainId);
  const tsk = TransportSecretKey.random();
  const transportPublicKey = tsk.publicKeyBytes();

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = BigInt(bytesToHex(nonceBytes));

  const typedData = {
    domain: {
      name: 'HavenAOL',
      chainId: params.config.eip712ChainId || 1,
      verifyingContract: params.config.aolVerifyingContract || '0x0000000000000000000000000000000000000000',
    },
    primaryType: 'GateRequestV3',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      GateRequestV3: [
        { name: 'evmAddress', type: 'address' },
        { name: 'transportPublicKey', type: 'bytes' },
        { name: 'epoch', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    message: {
      evmAddress: params.address,
      transportPublicKey: bytesToHex(transportPublicKey),
      epoch: String(epoch),
      nonce: nonce.toString(),
    },
  };

  const sigHex = await signTypedDataV4(params.provider, params.address, typedData);
  const sigBytes = hexToBytes(sigHex);
  if (sigBytes.length !== 65) {
    throw new Error(`Expected 65-byte EIP-712 signature, got ${sigBytes.length}`);
  }

  const agent = await HttpAgent.create({
    host: params.config.icpHost || 'https://icp-api.io',
    identity: new AnonymousIdentity(),
    verifyQuerySignatures: false,
  });

  const actor = Actor.createActor(AOL_V3_IDL, {
    agent,
    canisterId: params.config.aolCanisterId,
  }) as unknown as {
    requestDecryptionKeyV3: (args: Record<string, unknown>) => Promise<
      | { ok: { encrypted_key: Uint8Array | number[]; verification_key: Uint8Array | number[] } }
      | { err: Record<string, unknown> }
    >;
  };

  const res = await actor.requestDecryptionKeyV3({
    chain: { [chainVariant]: null },
    tokenAddress: params.tokenAddress.toLowerCase(),
    threshold: BigInt(params.threshold || '0'),
    epoch: BigInt(epoch),
    evmAddress: params.address,
    transportPublicKey: Array.from(transportPublicKey),
    nonce,
    signature: Array.from(sigBytes),
    eip712ChainId: BigInt(params.config.eip712ChainId || 1),
    eip712VerifyingContract:
      params.config.aolVerifyingContract || '0x0000000000000000000000000000000000000000',
  });

  if ('err' in res) {
    const errTag = Object.keys(res.err)[0] ?? 'UnknownError';
    const errVal = res.err[errTag];
    if (errTag === 'InsufficientBalance' && errVal && typeof errVal === 'object') {
      const b = errVal as { required?: bigint; actual?: bigint };
      throw new Error(
        `Insufficient token balance: need ${b.required?.toString()}, wallet has ${b.actual?.toString()}`,
      );
    }
    throw new Error(`Haven-AOL rejected unlock (${errTag}): ${String(errVal ?? '')}`);
  }

  const derivationInput = await computeDerivationInputV3(
    chainVariant,
    params.tokenAddress,
    params.threshold || '0',
    epoch,
  );
  const encVetKey = EncryptedVetKey.deserialize(new Uint8Array(res.ok.encrypted_key));
  const dpk = DerivedPublicKey.deserialize(new Uint8Array(res.ok.verification_key));
  const vetKey = encVetKey.decryptAndVerify(tsk, dpk, derivationInput);
  const rawKeyMaterial = await vetKey.deriveSymmetricKey('haven-aes-256-gcm', 32);

  return {
    gateId: params.gateId,
    epoch,
    rawKeyMaterial: new Uint8Array(rawKeyMaterial),
    vetKey,
    unlockedAt: Date.now(),
  };
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['decrypt']);
}

function unwrapIbeAesKey(
  vetKey: VetKey,
  gateJsonStr?: string,
  gateJson?: Record<string, unknown>,
): Uint8Array | null {
  let obj = gateJson;
  if (!obj && gateJsonStr) {
    try {
      obj = JSON.parse(gateJsonStr) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const ctB64 =
    (typeof obj?.encryptedAesKey === 'string' && obj.encryptedAesKey) ||
    (typeof obj?.ibeCiphertext === 'string' && obj.ibeCiphertext) ||
    null;
  if (!ctB64) return null;
  const ibeCt = IbeCiphertext.deserialize(fromBase64(ctB64));
  return ibeCt.decrypt(vetKey);
}

/**
 * Decrypts Haven's canonical framed AES-GCM layout:
 *   1. `[12-byte base IV][u32LE idx][u32LE len][ct+16 tag]*` (chunk IV = baseIV XOR BE64(idx) in bytes 4..12)
 *   2. Legacy HVN1 framed stream `[4B "HVN1"][4B chunkCount][12B iv + 4B len + ct]*`
 *   3. Single-frame `[12-byte IV][ciphertext+tag]`
 */
export async function decryptMediaBytes(
  ciphertext: Uint8Array,
  unlockedKey: UnlockedGateKey,
  gateJsonStr?: string,
  gateJson?: Record<string, unknown>,
): Promise<Uint8Array> {
  if (ciphertext.byteLength <= 28) {
    throw new Error('Sealed media payload is too short to decrypt.');
  }

  let contentKeyBytes = unlockedKey.rawKeyMaterial;

  // 1. Canonical Haven-AOL IBE unwrap using VetKey
  if (unlockedKey.vetKey) {
    try {
      const unwrapped = unwrapIbeAesKey(unlockedKey.vetKey, gateJsonStr, gateJson);
      if (unwrapped && (unwrapped.byteLength === 32 || unwrapped.byteLength === 16)) {
        contentKeyBytes = unwrapped;
      }
    } catch {
      // Fall through to legacy wrappedKey / direct key material
    }
  }

  // 2. Fallback: AES-GCM wrappedKey in gateJson
  if (
    contentKeyBytes === unlockedKey.rawKeyMaterial &&
    gateJson &&
    typeof gateJson.wrappedKey === 'string' &&
    typeof gateJson.iv === 'string'
  ) {
    try {
      const kek = await importAesKey(unlockedKey.rawKeyMaterial);
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

  // Format A: HVN1 magic framed stream
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

  // Format B: Canonical Haven framed AES-GCM `[12B baseIV][u32LE idx][u32LE len][ct+tag]*`
  const baseIv = ciphertext.subarray(0, 12);
  try {
    const view = new DataView(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
    let offset = 12;
    const chunks: Uint8Array[] = [];
    let expectedIdx = 0;

    while (offset + 8 <= ciphertext.byteLength) {
      const idx = view.getUint32(offset, true);
      const len = view.getUint32(offset + 4, true);
      offset += 8;
      if (idx !== expectedIdx || len < 16 || offset + len > ciphertext.byteLength) {
        throw new Error('Not framed');
      }
      const chunkCt = ciphertext.subarray(offset, offset + len);
      offset += len;

      const iv = new Uint8Array(baseIv);
      const idxBig = BigInt(idx);
      for (let b = 0; b < 8; b++) {
        iv[11 - b] ^= Number((idxBig >> BigInt(b * 8)) & 0xffn);
      }

      const pt = new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, aesKey, toArrayBuffer(chunkCt)),
      );
      chunks.push(pt);
      expectedIdx += 1;
    }

    if (offset === ciphertext.byteLength && chunks.length > 0) {
      const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
      const out = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) {
        out.set(c, pos);
        pos += c.byteLength;
      }
      return out;
    }
  } catch {
    // Fall back to single-frame [12B IV][ciphertext+tag]
  }

  // Format C: Single-frame `[12B IV][ciphertext+tag]`
  const body = ciphertext.subarray(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(baseIv) },
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

function buildCandidateUrls(item: MediaItem, config: HavenConfig): Array<{ url: string; isSynapse: boolean }> {
  const candidates: Array<{ url: string; isSynapse: boolean }> = [];
  const seen = new Set<string>();
  const add = (url: string | undefined, isSynapse = false) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, isSynapse });
  };

  const gw = (config.ipfsGateway.trim() || 'https://w3s.link').replace(/\/+$/, '');
  const gwIpfs = gw.endsWith('/ipfs') ? gw : `${gw}/ipfs`;
  const synapseBase = (config.synapseBaseUrl.trim() || 'https://api.synapse.storage').replace(/\/+$/, '');

  if (item.pieceCid) {
    add(`${synapseBase}/piece/${item.pieceCid}`, true);
    add(`${gwIpfs}/${item.pieceCid}`);
    add(`https://w3s.link/ipfs/${item.pieceCid}`);
    add(`https://ipfs.io/ipfs/${item.pieceCid}`);
  }
  if (item.fcid) {
    add(`${gwIpfs}/${item.fcid}`);
    add(`https://w3s.link/ipfs/${item.fcid}`);
    add(`https://dweb.link/ipfs/${item.fcid}`);
    add(`https://ipfs.io/ipfs/${item.fcid}`);
  }
  if (item.mediaUrl) {
    add(item.mediaUrl, item.mediaUrl.startsWith(synapseBase));
  }
  return candidates;
}

export async function fetchAndPrepareMediaUrl(
  item: MediaItem,
  config: HavenConfig,
  unlockedKey?: UnlockedGateKey,
): Promise<{ objectUrl: string; decrypted: boolean; bytes: number }> {
  const candidates = buildCandidateUrls(item, config);
  if (candidates.length === 0) {
    throw new Error('No IPFS/Filecoin CID or media URL attached to this Arkiv entity.');
  }

  const cacheKey = item.pieceCid
    ? `piece:${item.pieceCid}`
    : item.fcid
      ? `fcid:${item.fcid}`
      : `url:${candidates[0].url}`;

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

  // 3. Fetch across candidate gateways (Synapse + IPFS fallbacks) on cache miss
  if (!raw) {
    const transferId = `ht-dl-${item.cid || item.id}`;
    const label = item.title || item.cid || 'Haven media';
    const fromSource = item.pieceCid ? 'Filecoin Synapse (Sealed)' : 'IPFS Gateway';
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

    let lastErr = 'All gateways failed';
    try {
      for (const candidate of candidates) {
        try {
          const headers: Record<string, string> = {};
          if (candidate.isSynapse && config.synapseApiKey) {
            headers['X-API-KEY'] = config.synapseApiKey;
          }
          const resp = await fetch(candidate.url, { headers });
          if (!resp.ok) {
            lastErr = `HTTP ${resp.status} from ${new URL(candidate.url).host}`;
            continue;
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
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
      }

      if (!raw) {
        throw new Error(`Could not fetch ${item.cid || item.title} (${lastErr})`);
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
          mimeType: item.mimeType || 'application/octet-stream',
          encrypted: Boolean(item.encrypted),
        })
        .catch(() => undefined);
    }
  }

  if (item.encrypted) {
    if (!unlockedKey) {
      throw new Error('Encrypted DataDAO item — unlock this gate via Haven-AOL VetKD first.');
    }
    const plain = await decryptMediaBytes(raw, unlockedKey, item.gateJsonStr, item.gateJson);
    const blob = new Blob([toArrayBuffer(plain)], { type: item.mimeType || 'video/mp4' });
    return { objectUrl: URL.createObjectURL(blob), decrypted: true, bytes: plain.byteLength };
  }

  const blob = new Blob([toArrayBuffer(raw)], { type: item.mimeType || 'video/mp4' });
  return { objectUrl: URL.createObjectURL(blob), decrypted: false, bytes: raw.byteLength };
}
