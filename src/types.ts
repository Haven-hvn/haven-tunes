export type MediaKind = 'audio' | 'video' | 'drip' | 'file';

export type ViewMode = 'list' | 'grid' | 'coverflow';

export type GridGroup = 'dao' | 'creator' | 'kind' | 'all';

export type RepeatMode = 'off' | 'all' | 'one';

export type GateStanding = 'public' | 'member' | 'locked' | 'unchecked';

export type SourceId =
  | 'all'
  | 'music'
  | 'videos'
  | 'drips'
  | 'my-uploads'
  | 'community'
  | 'settings'
  | 'smart-unlocked'
  | 'smart-recent'
  | 'smart-attested'
  | 'smart-top'
  | 'genius'
  | `dao:${string}`
  | `pl:${string}`;

export interface TokenGateRef {
  chain: string;
  chainId: number;
  tokenAddress: string;
  threshold: string;
  gateId: string;
}

export interface AttestationInfo {
  verified: boolean;
  chain?: string;
  token?: string;
  balance?: string;
  blockNumber?: number;
}

export interface MediaItem {
  id: string;
  entityKey: string;
  grp: string;
  kind: MediaKind;
  title: string;
  artist: string;
  album: string;
  creator: string;
  description: string;
  mimeType: string;
  durationSec: number;
  sizeBytes?: number;
  createdAtBlock: number;
  createdAtMs: number;
  cid?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  encrypted: boolean;
  gate?: TokenGateRef;
  gateJson?: Record<string, unknown>;
  epoch?: number;
  attestation?: AttestationInfo;
  tags: string[];
  rating: number; // 0..5
  plays: number;
  demo?: boolean;
  rawPayload?: Record<string, unknown>;
}

export interface DataDaoEntry {
  gateId: string;
  chain: string;
  chainId: number;
  tokenAddress: string;
  threshold: string;
  name: string;
  symbol: string;
  decimals: number;
  itemCount: number;
  memberCount: number;
  standing: GateStanding;
  balanceFormatted?: string;
  balanceRaw?: bigint;
  unlockedEpoch?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface HavenConfig {
  arkivPreset: 'rabdi' | 'localhost' | 'custom';
  arkivRpcUrl: string;
  arkivAccessKey: string;
  ipfsGateway: string;
  aolCanisterId: string;
  icpHost: string;
  showDemoTracks: boolean;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
  providerName: string | null;
}

export interface ToastMessage {
  id: number;
  text: string;
  tone?: 'info' | 'ok' | 'warn' | 'err';
}
