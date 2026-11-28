export type MediaKind = 'audio' | 'video' | 'image' | 'drip' | 'file';

export type HavenAolChainVariant =
  | 'EthMainnet'
  | 'EthSepolia'
  | 'ArbitrumOne'
  | 'BaseMainnet'
  | 'OptimismMainnet';

export type ViewMode = 'list' | 'grid' | 'coverflow';

export type GridGroup = 'dao' | 'creator' | 'kind' | 'all';

export type RepeatMode = 'off' | 'all' | 'one';

export type GateStanding = 'public' | 'member' | 'locked' | 'unchecked';

export type SourceId =
  | 'all'
  | 'music'
  | 'videos'
  | 'images'
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
  type?: number; // 1 = per-file, 3 = per-epoch, 4 = marketcap drip
  chain: string;
  chainVariant: HavenAolChainVariant;
  chainId: number;
  tokenAddress: string;
  threshold: string;
  epoch?: number;
  /** Canonical gate key matching Haven OS (`gate:<chainId>:<token>:<threshold>`). */
  gateId: string;
}

export interface AttestationInfo {
  verified: boolean;
  evmAddress?: string;
  chain?: string;
  token?: string;
  balance?: string;
  epoch?: number;
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
  /** Primary CID (`fcid` for clear IPFS/Filecoin or `pieceCid` for sealed Filecoin piece). */
  cid?: string;
  /** Clear IPFS/Filecoin CID when unencrypted. */
  fcid?: string;
  /** Filecoin Synapse piece CID when sealed/encrypted. */
  pieceCid?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  encrypted: boolean;
  sealedMask?: number;
  gate?: TokenGateRef;
  gateJsonStr?: string;
  gateJson?: Record<string, unknown>;
  epoch?: number;
  board?: string;
  dripId?: string;
  dripIdx?: number;
  seriesRef?: string;
  mcapUsd?: number;
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
  chainVariant: HavenAolChainVariant;
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
  synapseBaseUrl: string;
  synapseApiKey: string;
  aolCanisterId: string;
  aolVerifyingContract: string;
  eip712ChainId: number;
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
