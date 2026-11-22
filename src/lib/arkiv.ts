import { createPublicClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { startsWith } from '@arkiv-network/sdk/query';
import { http } from 'viem';
import type {
  AttestationInfo,
  DataDaoEntry,
  HavenConfig,
  MediaItem,
  MediaKind,
  TokenGateRef,
} from '../types';
import { CHAIN_REGISTRY, chainVariantFor, normalizeChainId } from './config';

export const MEDIA_GROUPS = [
  'haven.video.full',
  'haven.audio.full',
  'haven.video.drip.series',
  'haven.video.drip.part',
  'haven.file.full',
] as const;

function unwrapAttrValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).value ?? '');
  }
  return String(v);
}

function extractAttributes(entity: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = entity.$attributes ?? entity.attributes;
  if (Array.isArray(attrs)) {
    for (const item of attrs) {
      if (item && typeof item === 'object' && 'key' in item) {
        const k = String((item as { key: unknown }).key);
        out[k] = unwrapAttrValue((item as { value: unknown }).value);
      }
    }
  } else if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      out[k] = unwrapAttrValue(v);
    }
  }
  return out;
}

function decodePayload(entity: Record<string, unknown>): Record<string, unknown> {
  const raw = entity.payload;
  if (!raw) return {};
  try {
    if (raw instanceof Uint8Array) {
      const text = new TextDecoder().decode(raw);
      return JSON.parse(text) as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{')) {
        return JSON.parse(trimmed) as Record<string, unknown>;
      }
      const bin = atob(trimmed);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text) as Record<string, unknown>;
    }
    if (typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      const val = (raw as { value: unknown }).value;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('{')) return JSON.parse(trimmed) as Record<string, unknown>;
        return JSON.parse(atob(trimmed)) as Record<string, unknown>;
      }
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
  return 'file';
}

function parseAttestation(payload: Record<string, unknown>): AttestationInfo | undefined {
  const attn = payload.attn as Record<string, unknown> | undefined;
  if (!attn || typeof attn !== 'object') return undefined;
  return {
    verified: Boolean(attn.sig || attn.signature || attn.verified !== false),
    chain: attn.chain ? String(attn.chain) : undefined,
    token: attn.token ? String(attn.token) : undefined,
    balance: attn.balance ? String(attn.balance) : undefined,
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
  const base = gateway.endsWith('/') ? gateway : `${gateway}/`;
  return `${base}${cleanCid}`;
}

export function parseArkivEntityToMedia(
  entity: Record<string, unknown>,
  config: HavenConfig,
): MediaItem | null {
  const attrs = extractAttributes(entity);
  const payload = decodePayload(entity);
  const grp = attrs.grp || String(payload.grp || '');
  if (!grp.startsWith('haven.')) return null;

  // Focus on media & file entities for Haven Tunes
  const isMediaGroup =
    grp.startsWith('haven.video') ||
    grp.startsWith('haven.audio') ||
    grp.startsWith('haven.file') ||
    Boolean(payload.cid || payload.pieceCid || payload.mediaCid || payload.videoCid || payload.audioCid);
  if (!isMediaGroup) return null;

  const entityKey = String(entity.$key || entity.key || '');
  const owner = String(entity.$owner || entity.owner || entity.$creator || attrs.creator || '');
  const mimeType = String(
    payload.mimeType || payload.mime_type || payload.contentType || attrs.mime ||
      (grp.includes('audio') ? 'audio/mpeg' : 'video/mp4'),
  );
  const kind = inferMediaKind(grp, mimeType);

  const title = String(
    payload.title || payload.name || attrs.title || attrs.name || `Haven ${kind.toUpperCase()} ${entityKey.slice(0, 8)}`,
  );
  const creator = String(payload.creator || attrs.creator || owner || 'Unknown');
  const artist = String(payload.artist || payload.author || shortAddr(creator));

  const gateToken =
    attrs.gate_token ||
    attrs.token_address ||
    String((payload.gate as Record<string, unknown> | undefined)?.tokenAddress ||
      (payload.gate as Record<string, unknown> | undefined)?.token || '');
  const gateChainRaw =
    attrs.gate_chain ||
    attrs.chain ||
    String((payload.gate as Record<string, unknown> | undefined)?.chain || '');
  const gateThreshold =
    attrs.gate_threshold ||
    String((payload.gate as Record<string, unknown> | undefined)?.threshold || '1');

  let gate: TokenGateRef | undefined;
  if (gateToken && gateToken.startsWith('0x') && gateToken.length >= 40) {
    const chainId = normalizeChainId(gateChainRaw);
    const chain = chainVariantFor(chainId);
    gate = {
      chain,
      chainId,
      tokenAddress: gateToken.toLowerCase(),
      threshold: gateThreshold || '1',
      gateId: `${chain}:${gateToken.toLowerCase()}`,
    };
  }

  const cid = String(
    payload.cid ||
      payload.mediaCid ||
      payload.videoCid ||
      payload.audioCid ||
      payload.pieceCid ||
      payload.filecoinCid ||
      attrs.cid ||
      '',
  ) || undefined;

  const thumbRaw = String(
    payload.thumbnailUrl || payload.thumbnailCid || payload.posterCid || payload.coverCid || '',
  ) || undefined;

  const encrypted = Boolean(
    gate ||
      payload.encrypted ||
      payload.enc ||
      payload.vetkd ||
      payload.aol ||
      attrs.encrypted === 'true',
  );

  const durationSec = Number(payload.duration || payload.durationSec || 0) || 180;
  const sizeBytes = Number(payload.size || payload.sizeBytes || payload.fileSize || 0) || undefined;
  const createdAtBlock = Number(
    (entity as unknown as { createdAtBlock?: number | bigint }).createdAtBlock ||
      attrs.$createdAtBlock ||
      0,
  );
  const createdAtMs =
    Number(payload.createdAt || payload.timestamp || 0) ||
    (createdAtBlock > 0 ? Date.now() - Math.max(0, 500000 - createdAtBlock) * 1000 : Date.now());

  const tags: string[] = [];
  if (Array.isArray(payload.tags)) {
    for (const t of payload.tags) tags.push(String(t));
  }
  if (attrs.tag) tags.push(attrs.tag);
  if (gate) tags.push(CHAIN_REGISTRY[gate.chainId]?.short || gate.chain);

  const album = String(
    payload.album ||
      payload.seriesTitle ||
      payload.collection ||
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
    description: String(payload.description || payload.caption || ''),
    mimeType,
    durationSec,
    sizeBytes,
    createdAtBlock,
    createdAtMs,
    cid,
    mediaUrl: buildIpfsUrl(cid || (payload.url ? String(payload.url) : undefined), config.ipfsGateway),
    thumbnailUrl: buildIpfsUrl(thumbRaw, config.ipfsGateway),
    encrypted,
    gate,
    gateJson: (payload.gateJson || payload.aol || payload.enc || payload.vetkd) as
      | Record<string, unknown>
      | undefined,
    epoch: typeof payload.epoch === 'number' ? payload.epoch : undefined,
    attestation: parseAttestation(payload),
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
  error?: string;
}

export async function fetchHavenMediaLibrary(config: HavenConfig): Promise<ArkivScanResult> {
  const started = performance.now();
  const rpcUrl = config.arkivRpcUrl.trim() || 'https://rpc.rabdi.db-chain.testnet.arkiv.network';
  const baseChain = rabdi({ accessKey: config.arkivAccessKey || '' });
  const chain =
    config.arkivPreset === 'rabdi'
      ? baseChain
      : {
          ...baseChain,
          rpcUrls: { default: { http: [rpcUrl] } },
        };

  try {
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const blockPromise = client.getBlockNumber().catch(() => null);

    const page = await client
      .select({
        $key: true,
        $owner: true,
        $creator: true,
        $createdAt: true,
        $attributes: true,
        payload: true,
      })
      .where(startsWith('grp', 'haven.'))
      .limit(120)
      .fetch();

    const entities = ((page as unknown as { entities?: Record<string, unknown>[] }).entities ??
      (Array.isArray(page) ? page : [])) as Record<string, unknown>[];

    const blockNumber = await blockPromise;
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    for (const ent of entities) {
      const parsed = parseArkivEntityToMedia(ent, config);
      if (parsed && !seen.has(parsed.id)) {
        seen.add(parsed.id);
        items.push(parsed);
      }
    }
    items.sort((a, b) => b.createdAtBlock - a.createdAtBlock || b.createdAtMs - a.createdAtMs);

    return {
      items,
      blockNumber: blockNumber != null ? Number(blockNumber) : null,
      rpcUrl,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      items: [],
      blockNumber: null,
      rpcUrl,
      elapsedMs: Math.round(performance.now() - started),
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
