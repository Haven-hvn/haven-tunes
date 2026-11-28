import { createPublicClient } from '@arkiv-network/sdk';
import { localhost, rabdi } from '@arkiv-network/sdk/chains';
import { asc, startsWith } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import type {
  AttestationInfo,
  DataDaoEntry,
  HavenConfig,
  MediaItem,
  MediaKind,
  TokenGateRef,
} from '../types';
import {
  CHAIN_REGISTRY,
  ENUM_TO_MIME,
  aolVariantFor,
  chainVariantFor,
  makeGateId,
  normalizeChainId,
} from './config';

const ARKIV_CACHE_KEY = 'haven-tunes-2000:arkiv-cache:v2';

function hexStringToUtf8(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function unwrapAttrValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return unwrapAttrValue((v as Record<string, unknown>).value);
  }
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return '';
}

function extractAttributes(entity: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = entity.$attributes ?? entity.attributes ?? entity.rawAttributes;
  if (Array.isArray(attrs)) {
    for (const item of attrs) {
      if (item && typeof item === 'object' && 'key' in item) {
        const k = String((item as { key: unknown }).key);
        if (k === 'payload') continue;
        out[k] = unwrapAttrValue((item as { value: unknown }).value);
      }
    }
  } else if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (k === 'payload') continue;
      out[k] = unwrapAttrValue(v);
    }
  }
  return out;
}

function decodePayload(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  try {
    // Handle @arkiv-network/sdk@1.0.1 tagged bytes object: { type: "bytes", value: "0x7b22..." }
    if (typeof raw === 'object' && !(raw instanceof Uint8Array)) {
      const obj = raw as Record<string, unknown>;
      if (obj.type === 'bytes' && typeof obj.value === 'string') {
        const text = obj.value.startsWith('0x') ? hexStringToUtf8(obj.value) : obj.value;
        return JSON.parse(text) as Record<string, unknown>;
      }
      if (obj.type === 'bytes' && obj.value instanceof Uint8Array) {
        return JSON.parse(new TextDecoder().decode(obj.value)) as Record<string, unknown>;
      }
      if ('value' in obj && typeof obj.value === 'string') {
        const val = obj.value.trim();
        if (val.startsWith('{')) return JSON.parse(val) as Record<string, unknown>;
        if (val.startsWith('0x')) return JSON.parse(hexStringToUtf8(val)) as Record<string, unknown>;
        const bin = atob(val);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
      }
      if (!('type' in obj && 'value' in obj)) {
        return obj;
      }
    }
    if (raw instanceof Uint8Array) {
      return JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) return JSON.parse(trimmed) as Record<string, unknown>;
      if (trimmed.startsWith('0x')) return JSON.parse(hexStringToUtf8(trimmed)) as Record<string, unknown>;
      const bin = atob(trimmed);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function inferMediaKind(grp: string, mime: string): MediaKind {
  if (grp.includes('drip')) return 'drip';
  if (grp.includes('audio') || mime.startsWith('audio/')) return 'audio';
  if (grp.includes('video') || mime.startsWith('video/')) return 'video';
  if (grp.includes('image') || mime.startsWith('image/')) return 'image';
  return 'file';
}

function parseAttestation(payload: Record<string, unknown>): AttestationInfo | undefined {
  const attn = payload.attn as Record<string, unknown> | undefined;
  if (!attn || typeof attn !== 'object') return undefined;
  const sig = typeof attn.sig === 'string' ? attn.sig : typeof attn.signature === 'string' ? attn.signature : '';
  const bal = attn.bal ?? attn.balance ?? attn.balanceAtCheck;
  return {
    verified: sig.length >= 64 || attn.verified === true,
    evmAddress: typeof attn.evmAddress === 'string' ? attn.evmAddress : undefined,
    chain: attn.chain ? String(attn.chain) : undefined,
    token: attn.token ? String(attn.token) : undefined,
    balance: bal != null ? String(bal) : undefined,
    epoch: typeof attn.epoch === 'number' ? attn.epoch : undefined,
    blockNumber: typeof attn.blockNumber === 'number' ? attn.blockNumber : undefined,
  };
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || 'Anonymous';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function buildIpfsUrl(cidOrUrl: string | undefined, gateway: string): string | undefined {
  if (!cidOrUrl) return undefined;
  const trimmed = cidOrUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const cleanCid = trimmed.replace(/^ipfs:\/\//i, '').replace(/^\/ipfs\//i, '');
  const gw = (gateway.trim() || 'https://w3s.link').replace(/\/+$/, '');
  if (gw.endsWith('/ipfs')) {
    return `${gw}/${cleanCid}`;
  }
  return `${gw}/ipfs/${cleanCid}`;
}

export function buildPieceUrl(pieceCid: string | undefined, synapseBaseUrl: string): string | undefined {
  if (!pieceCid) return undefined;
  const trimmed = pieceCid.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const base = (synapseBaseUrl.trim() || 'https://api.synapse.storage').replace(/\/+$/, '');
  return `${base}/piece/${trimmed}`;
}

function resolveMimeType(
  grp: string,
  attrs: Record<string, string>,
  payload: Record<string, unknown>,
  mediaObj?: Record<string, unknown>,
): string {
  const ct = payload.ct ?? payload.mimeType ?? payload.mime_type ?? payload.contentType;
  if (typeof ct === 'string' && ct.includes('/')) return ct;

  const mediaMimeNum = typeof mediaObj?.mime === 'number' ? mediaObj.mime : undefined;
  if (mediaMimeNum && ENUM_TO_MIME[mediaMimeNum]) return ENUM_TO_MIME[mediaMimeNum];

  const attrMime = attrs.mime;
  if (attrMime) {
    if (attrMime.includes('/')) return attrMime;
    const asNum = Number(attrMime);
    if (Number.isFinite(asNum) && ENUM_TO_MIME[asNum]) return ENUM_TO_MIME[asNum];
  }

  if (grp.startsWith('haven.audio')) return 'audio/mpeg';
  if (grp.startsWith('haven.video')) return 'video/mp4';
  if (grp.startsWith('haven.image')) return 'image/png';
  return 'application/octet-stream';
}

export function parseArkivEntityToMedia(
  entity: Record<string, unknown>,
  config: HavenConfig,
): MediaItem | null {
  const attrs = extractAttributes(entity);
  const rawAttrsObj =
    entity.$attributes && !Array.isArray(entity.$attributes)
      ? (entity.$attributes as Record<string, unknown>)
      : undefined;
  const payload = decodePayload(entity.payload ?? rawAttrsObj?.payload);
  const grp = attrs.grp || String(payload.grp || '');
  if (!grp.startsWith('haven.')) return null;

  const mediaObj =
    payload.media && typeof payload.media === 'object'
      ? (payload.media as Record<string, unknown>)
      : undefined;

  const fcid =
    String(
      mediaObj?.fcid ||
        payload.fcid ||
        payload.cid ||
        payload.mediaCid ||
        payload.videoCid ||
        payload.audioCid ||
        attrs.cid ||
        '',
    ).trim() || undefined;

  const pieceCid =
    String(mediaObj?.piece || payload.piece || payload.pieceCid || payload.filecoinCid || '').trim() || undefined;

  const directUrl = typeof payload.url === 'string' && payload.url.trim() ? payload.url.trim() : undefined;

  const isPlayableGroup =
    grp.startsWith('haven.video') ||
    grp.startsWith('haven.audio') ||
    grp.startsWith('haven.image') ||
    grp.startsWith('haven.file') ||
    Boolean(fcid || pieceCid || directUrl);

  // Exclude board definitions or text-only posts that carry no media attachment
  if (!isPlayableGroup || grp === 'haven.board.def') return null;

  const mimeType = resolveMimeType(grp, attrs, payload, mediaObj);
  const kind = inferMediaKind(grp, mimeType);

  // Skip non-media board posts unless they have an actual media locator
  if (grp.startsWith('haven.board') && !fcid && !pieceCid && !directUrl) return null;

  const entityKey = String(entity.$key || entity.key || '');
  const owner = String(entity.$owner || entity.owner || entity.$creator || attrs.creator || '');
  const title = String(
    attrs.subject ||
      attrs.title ||
      payload.title ||
      mediaObj?.name ||
      payload.name ||
      attrs.name ||
      `Haven ${kind.toUpperCase()} ${entityKey.slice(0, 8)}`,
  );
  const creator = String(payload.creator || attrs.creator || owner || 'Unknown');
  const artist = String(payload.artist || payload.author || shortAddr(creator));

  // Gate extraction (supports both canonical Haven attributes & nested payload.gate)
  const payloadGateObj =
    typeof payload.gate === 'object' && payload.gate !== null
      ? (payload.gate as Record<string, unknown>)
      : typeof payload.gate === 'string'
        ? (() => {
            try {
              return JSON.parse(payload.gate) as Record<string, unknown>;
            } catch {
              return undefined;
            }
          })()
        : undefined;

  const gateToken = String(
    attrs.gate_token || attrs.token_address || payloadGateObj?.tokenAddress || payloadGateObj?.token || '',
  ).trim();
  const gateChainRaw = attrs.gate_chain || attrs.chain || (payloadGateObj?.chain as string | number | undefined) || '';
  const gateThreshold = String(
    attrs.gate_threshold || payloadGateObj?.threshold || '1',
  ).trim();
  const gateType = attrs.gate_type != null && attrs.gate_type !== '' ? Number(attrs.gate_type) : undefined;
  const gateEpoch =
    attrs.gate_epoch != null && attrs.gate_epoch !== ''
      ? Number(attrs.gate_epoch)
      : typeof payload.epoch === 'number'
        ? payload.epoch
        : typeof payloadGateObj?.epoch === 'number'
          ? payloadGateObj.epoch
          : undefined;

  let gate: TokenGateRef | undefined;
  if (gateToken && gateToken.startsWith('0x') && gateToken.length >= 40 && gateThreshold !== '0') {
    const chainId = normalizeChainId(gateChainRaw);
    const chain = chainVariantFor(chainId);
    const chainVariant = aolVariantFor(chainId);
    gate = {
      type: gateType ?? 3,
      chain,
      chainVariant,
      chainId,
      tokenAddress: gateToken.toLowerCase(),
      threshold: gateThreshold || '1',
      epoch: gateEpoch,
      gateId: makeGateId(chainId, gateToken, gateThreshold || '1'),
    };
  }

  const gateJsonStr =
    typeof payload.gate === 'string'
      ? payload.gate
      : payloadGateObj
        ? JSON.stringify(payloadGateObj)
        : undefined;

  const sealedMask =
    attrs.sealed != null && attrs.sealed !== ''
      ? Number(attrs.sealed)
      : gate && (pieceCid || gateJsonStr)
        ? 2
        : 0;

  const encrypted = Boolean(
    (sealedMask & 2) !== 0 ||
      (gate && pieceCid && !fcid) ||
      payload.encrypted === true ||
      attrs.encrypted === 'true',
  );

  const cid = fcid || pieceCid;
  const mediaUrl =
    (fcid ? buildIpfsUrl(fcid, config.ipfsGateway) : undefined) ||
    (pieceCid ? buildPieceUrl(pieceCid, config.synapseBaseUrl) : undefined) ||
    buildIpfsUrl(directUrl, config.ipfsGateway);

  const thumbRaw =
    String(payload.thumbnailUrl || payload.thumbnailCid || payload.posterCid || payload.coverCid || '').trim() ||
    undefined;

  const durationSec =
    Number(attrs.dur_s || payload.duration || payload.durationSec || 0) ||
    (kind === 'image' ? 0 : 0);
  const sizeBytes =
    Number(mediaObj?.size || payload.size || payload.sizeBytes || payload.fileSize || 0) || undefined;
  const createdAtBlock = Number(
    entity.$createdAt ||
      entity.createdAt ||
      (entity as unknown as { createdAtBlock?: number | bigint }).createdAtBlock ||
      attrs.$createdAtBlock ||
      0,
  );
  const createdAtMs =
    Number(payload.createdAt || payload.timestamp || 0) ||
    (createdAtBlock > 0 ? Date.now() - Math.max(0, 500_000 - createdAtBlock) * 1000 : Date.now());

  const tags: string[] = [];
  if (Array.isArray(payload.tags)) {
    for (const t of payload.tags) tags.push(String(t));
  }
  if (attrs.tag) tags.push(attrs.tag);
  if (attrs.board) tags.push(`/${attrs.board}/`);
  if (gate) tags.push(CHAIN_REGISTRY[gate.chainId]?.short || gate.chain.toUpperCase());

  let description = String(payload.description || payload.caption || '');
  if (!description && payload.text && typeof payload.text === 'object') {
    const clear = (payload.text as Record<string, unknown>).clear;
    if (typeof clear === 'string') description = clear;
  }

  const album = String(
    payload.album ||
      payload.seriesTitle ||
      payload.collection ||
      (attrs.board ? `/${attrs.board}/` : '') ||
      (gate ? `DAO ${shortAddr(gate.tokenAddress)}` : 'Public Commons'),
  );

  return {
    id: entityKey || `${grp}:${title}:${createdAtBlock}`,
    entityKey,
    grp,
    kind,
    title,
    artist,
    album,
    creator: creator.toLowerCase(),
    description,
    mimeType,
    durationSec,
    sizeBytes,
    createdAtBlock,
    createdAtMs,
    cid,
    fcid,
    pieceCid,
    mediaUrl,
    thumbnailUrl: buildIpfsUrl(thumbRaw, config.ipfsGateway),
    encrypted,
    sealedMask,
    gate,
    gateJsonStr,
    gateJson: (payloadGateObj || payload.gateJson || payload.aol || payload.enc || payload.vetkd) as
      | Record<string, unknown>
      | undefined,
    epoch: gateEpoch,
    board: attrs.board || undefined,
    dripId: attrs.drip_id || undefined,
    dripIdx: attrs.drip_idx != null && attrs.drip_idx !== '' ? Number(attrs.drip_idx) : undefined,
    seriesRef: attrs.series_ref || undefined,
    mcapUsd: attrs.mcap_usd != null && attrs.mcap_usd !== '' ? Number(attrs.mcap_usd) : undefined,
    attestation: parseAttestation(payload),
    tags,
    rating: 0,
    plays: 0,
    demo: false,
    rawPayload: payload,
  };
}

/**
 * Converts a pre-parsed `HavenEntity` received from the Haven OS Bridge (`haven_getEntities`)
 * into a Haven Tunes `MediaItem`.
 */
export function parseBridgeEntityToMedia(
  ent: Record<string, unknown>,
  config: HavenConfig,
): MediaItem | null {
  const grp = String(ent.grp || '');
  if (!grp.startsWith('haven.') || grp === 'haven.board.def') return null;

  const media = ent.media as Record<string, unknown> | undefined;
  const payload = (ent.payload && typeof ent.payload === 'object'
    ? (ent.payload as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const fcid = typeof media?.fcid === 'string' && media.fcid ? media.fcid : undefined;
  const pieceCid = typeof media?.piece === 'string' && media.piece ? media.piece : undefined;

  const isPlayableGroup =
    grp.startsWith('haven.video') ||
    grp.startsWith('haven.audio') ||
    grp.startsWith('haven.image') ||
    grp.startsWith('haven.file') ||
    Boolean(fcid || pieceCid);

  if (!isPlayableGroup) return null;
  if (grp.startsWith('haven.board') && !fcid && !pieceCid) return null;

  const mimeType = String(ent.mimeType || 'application/octet-stream');
  const kind = inferMediaKind(grp, mimeType);
  const key = String(ent.key || '');
  const creator = String(ent.creator || ent.owner || 'Unknown').toLowerCase();
  const title = String(ent.title || media?.name || `Haven ${kind.toUpperCase()} ${key.slice(0, 8)}`);

  const rawGate = ent.gate as Record<string, unknown> | undefined;
  let gate: TokenGateRef | undefined;
  if (rawGate && typeof rawGate.tokenAddress === 'string' && String(rawGate.threshold ?? '1') !== '0') {
    const chainId = normalizeChainId(rawGate.chainId as number | string | undefined);
    const threshold = String(rawGate.threshold ?? '1');
    const tokenAddress = rawGate.tokenAddress.toLowerCase();
    gate = {
      type: typeof rawGate.type === 'number' ? rawGate.type : 3,
      chain: chainVariantFor(chainId),
      chainVariant: aolVariantFor(chainId),
      chainId,
      tokenAddress,
      threshold,
      epoch: typeof rawGate.epoch === 'number' ? rawGate.epoch : undefined,
      gateId: makeGateId(chainId, tokenAddress, threshold),
    };
  }

  const gateJsonStr = typeof ent.gateJson === 'string' ? ent.gateJson : undefined;
  let gateJson: Record<string, unknown> | undefined;
  if (gateJsonStr) {
    try {
      gateJson = JSON.parse(gateJsonStr) as Record<string, unknown>;
    } catch {
      // ignore
    }
  }

  const sealedMask = typeof ent.sealedMask === 'number' ? ent.sealedMask : 0;
  const encrypted = Boolean((sealedMask & 2) !== 0 || (gate && pieceCid && !fcid));
  const cid = fcid || pieceCid;
  const mediaUrl =
    (fcid ? buildIpfsUrl(fcid, config.ipfsGateway) : undefined) ||
    (pieceCid ? buildPieceUrl(pieceCid, config.synapseBaseUrl) : undefined);

  const rawAttn = ent.attestation as Record<string, unknown> | undefined;
  const attestation: AttestationInfo | undefined = rawAttn
    ? {
        verified: Boolean(rawAttn.hasSignature),
        evmAddress: typeof rawAttn.evmAddress === 'string' ? rawAttn.evmAddress : undefined,
        balance: typeof rawAttn.balance === 'string' ? rawAttn.balance : undefined,
        epoch: typeof rawAttn.epoch === 'number' ? rawAttn.epoch : undefined,
      }
    : undefined;

  const board = typeof ent.board === 'string' ? ent.board : undefined;
  const tags: string[] = [];
  if (Array.isArray(payload.tags)) {
    for (const t of payload.tags) tags.push(String(t));
  }
  if (board) tags.push(`/${board}/`);
  if (gate) tags.push(CHAIN_REGISTRY[gate.chainId]?.short || gate.chain.toUpperCase());

  const createdAtBlock = Number(ent.createdAt || 0);
  const createdAtMs =
    Number(payload.createdAt || payload.timestamp || 0) ||
    (createdAtBlock > 0 ? Date.now() - Math.max(0, 500_000 - createdAtBlock) * 1000 : Date.now());

  return {
    id: key || `${grp}:${title}:${createdAtBlock}`,
    entityKey: key,
    grp,
    kind,
    title,
    artist: String(payload.artist || payload.author || shortAddr(creator)),
    album: String(
      payload.album ||
        payload.seriesTitle ||
        (board ? `/${board}/` : '') ||
        (gate ? `DAO ${shortAddr(gate.tokenAddress)}` : 'Public Commons'),
    ),
    creator,
    description: String(ent.clearText || payload.description || payload.caption || ''),
    mimeType,
    durationSec: Number(ent.durS || payload.duration || payload.durationSec || 0) || 0,
    sizeBytes: typeof media?.size === 'number' ? media.size : undefined,
    createdAtBlock,
    createdAtMs,
    cid,
    fcid,
    pieceCid,
    mediaUrl,
    thumbnailUrl: buildIpfsUrl(
      String(payload.thumbnailUrl || payload.thumbnailCid || payload.posterCid || payload.coverCid || '').trim() ||
        undefined,
      config.ipfsGateway,
    ),
    encrypted,
    sealedMask,
    gate,
    gateJsonStr,
    gateJson,
    epoch: gate?.epoch,
    board,
    dripId: typeof ent.dripId === 'string' ? ent.dripId : undefined,
    dripIdx: typeof ent.dripIdx === 'number' ? ent.dripIdx : undefined,
    seriesRef: typeof ent.seriesRef === 'string' ? ent.seriesRef : undefined,
    mcapUsd: typeof ent.mcapUsd === 'number' ? ent.mcapUsd : undefined,
    attestation,
    tags,
    rating: 0,
    plays: 0,
    demo: false,
    rawPayload: payload,
  };
}

export interface ArkivScanResult {
  items: MediaItem[];
  blockNumber: number | null;
  rpcUrl: string;
  elapsedMs: number;
  fromCache?: boolean;
  error?: string;
}

export function loadCachedMediaLibrary(rpcUrl: string): MediaItem[] {
  try {
    const raw = localStorage.getItem(ARKIV_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { rpcUrl: string; items: MediaItem[] };
    if (parsed.rpcUrl !== rpcUrl || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch {
    return [];
  }
}

function saveCachedMediaLibrary(rpcUrl: string, items: MediaItem[]): void {
  try {
    localStorage.setItem(ARKIV_CACHE_KEY, JSON.stringify({ rpcUrl, items }));
  } catch {
    // ignore storage quota errors
  }
}

export async function fetchHavenMediaLibrary(config: HavenConfig): Promise<ArkivScanResult> {
  const started = performance.now();
  const rpcUrl = config.arkivRpcUrl.trim() || 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
  const isLocal = /localhost|127\.0\.0\.1/.test(rpcUrl);
  const baseChain = isLocal ? localhost : rabdi({ accessKey: config.arkivAccessKey || '' });
  const chain =
    config.arkivPreset === 'rabdi' || isLocal
      ? baseChain
      : {
          ...baseChain,
          rpcUrls: { default: { http: [rpcUrl] } },
        };

  try {
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, {
        retryCount: 0,
        fetchFn: (url, init) => {
          const headers = new Headers(init?.headers);
          if (config.arkivAccessKey) headers.set('X-API-KEY', config.arkivAccessKey);
          return fetch(url, { ...init, headers });
        },
      }),
    });

    const blockPromise = client.getBlockNumber().catch(() => null);
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    const pageSize = 100;
    const maxRecords = 200;
    let offset = 0;

    while (items.length < maxRecords) {
      const page = await client
        .select({
          $key: true,
          $owner: true,
          $creator: true,
          $createdAt: true,
          $expiresAt: true,
          $attributes: true,
          payload: true,
        })
        .where(startsWith('grp', 'haven.'))
        .orderBy(asc('$key'))
        .limit(pageSize)
        .offset(offset)
        .fetch();

      const entities = ((page as unknown as { entities?: Record<string, unknown>[] }).entities ??
        (Array.isArray(page) ? page : [])) as Record<string, unknown>[];

      for (const ent of entities) {
        const parsed = parseArkivEntityToMedia(ent, config);
        if (parsed && !seen.has(parsed.id)) {
          seen.add(parsed.id);
          items.push(parsed);
        }
      }
      if (entities.length < pageSize) break;
      offset += entities.length;
    }

    const blockNumber = await blockPromise;
    items.sort((a, b) => b.createdAtBlock - a.createdAtBlock || b.createdAtMs - a.createdAtMs);
    saveCachedMediaLibrary(rpcUrl, items);

    return {
      items,
      blockNumber: blockNumber != null ? Number(blockNumber) : null,
      rpcUrl,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const cached = loadCachedMediaLibrary(rpcUrl);
    return {
      items: cached,
      blockNumber: null,
      rpcUrl,
      elapsedMs: Math.round(performance.now() - started),
      fromCache: cached.length > 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildDataDaoDirectory(items: MediaItem[]): DataDaoEntry[] {
  const map = new Map<string, { entry: DataDaoEntry; creators: Set<string> }>();
  for (const item of items) {
    if (!item.gate) continue;
    const key = item.gate.gateId;
    const existing = map.get(key);
    if (existing) {
      existing.entry.itemCount += 1;
      if (item.creator) existing.creators.add(item.creator);
      existing.entry.memberCount = existing.creators.size;
    } else {
      const chainMeta = CHAIN_REGISTRY[item.gate.chainId];
      const creators = new Set<string>();
      if (item.creator) creators.add(item.creator);
      map.set(key, {
        creators,
        entry: {
          gateId: key,
          chain: item.gate.chain,
          chainVariant: item.gate.chainVariant,
          chainId: item.gate.chainId,
          tokenAddress: item.gate.tokenAddress,
          threshold: item.gate.threshold,
          name: `${chainMeta?.short || item.gate.chain.toUpperCase()} DAO ${item.gate.tokenAddress.slice(0, 6)}…${item.gate.tokenAddress.slice(-4)}`,
          symbol: chainMeta?.short || 'TOKEN',
          decimals: 18,
          itemCount: 1,
          memberCount: creators.size,
          standing: 'unchecked',
        },
      });
    }
  }
  return Array.from(map.values())
    .map((v) => v.entry)
    .sort((a, b) => b.itemCount - a.itemCount);
}
