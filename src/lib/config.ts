import type { HavenAolChainVariant, HavenConfig } from '../types';

export const EPOCH_LENGTH_SECONDS = 2_592_000; // 30 days (canonical Haven-AOL v3 epoch)

export function currentEpochNow(): number {
  return Math.floor(Date.now() / 1000 / EPOCH_LENGTH_SECONDS);
}

export const ENUM_TO_MIME: Readonly<Record<number, string>> = {
  1: 'video/mp4',
  2: 'video/webm',
  3: 'video/quicktime',
  4: 'audio/mpeg',
  5: 'audio/wav',
  6: 'audio/ogg',
  7: 'image/png',
  8: 'image/jpeg',
  9: 'image/webp',
  10: 'image/gif',
  11: 'image/svg+xml',
  12: 'text/plain',
  13: 'text/markdown',
  14: 'application/pdf',
  15: 'application/vnd.comicbook+zip',
  16: 'application/vnd.comicbook-rar',
};

export const ARKIV_PRESETS: Record<'rabdi' | 'localhost', { label: string; rpcUrl: string }> = {
  rabdi: {
    label: 'Arkiv Rabdi Testnet (Default)',
    rpcUrl: 'https://rpc.rabdi.db-chain.testnet.arkiv.network',
  },
  localhost: {
    label: 'Local Arkiv Node (127.0.0.1:8545)',
    rpcUrl: 'http://127.0.0.1:8545',
  },
};

export const CHAIN_REGISTRY: Record<
  number,
  {
    id: number;
    variant: string;
    aolVariant: HavenAolChainVariant;
    name: string;
    short: string;
    rpcUrl: string;
  }
> = {
  1: {
    id: 1,
    variant: 'ethereum',
    aolVariant: 'EthMainnet',
    name: 'Ethereum Mainnet',
    short: 'ETH',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
  },
  8453: {
    id: 8453,
    variant: 'base',
    aolVariant: 'BaseMainnet',
    name: 'Base',
    short: 'BASE',
    rpcUrl: 'https://mainnet.base.org',
  },
  42161: {
    id: 42161,
    variant: 'arbitrum',
    aolVariant: 'ArbitrumOne',
    name: 'Arbitrum One',
    short: 'ARB',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  },
  10: {
    id: 10,
    variant: 'optimism',
    aolVariant: 'OptimismMainnet',
    name: 'Optimism',
    short: 'OP',
    rpcUrl: 'https://mainnet.optimism.io',
  },
  11155111: {
    id: 11155111,
    variant: 'sepolia',
    aolVariant: 'EthSepolia',
    name: 'Ethereum Sepolia',
    short: 'SEP',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  314159: {
    id: 314159,
    variant: 'calibration',
    aolVariant: 'EthSepolia',
    name: 'Filecoin Calibration',
    short: 'tFIL',
    rpcUrl: 'https://api.calibration.node.glif.io/rpc/v1',
  },
};

export const VARIANT_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  ethmainnet: 1,
  'eip155:1': 1,
  base: 8453,
  basemainnet: 8453,
  'eip155:8453': 8453,
  arbitrum: 42161,
  arbitrumone: 42161,
  arb: 42161,
  'eip155:42161': 42161,
  optimism: 10,
  optimismmainnet: 10,
  op: 10,
  'eip155:10': 10,
  sepolia: 11155111,
  ethsepolia: 11155111,
  'eip155:11155111': 11155111,
  calibration: 314159,
  filecoin: 314159,
  'eip155:314159': 314159,
};

export const DEFAULT_CONFIG: HavenConfig = {
  arkivPreset: 'rabdi',
  arkivRpcUrl: ARKIV_PRESETS.rabdi.rpcUrl,
  arkivAccessKey: (import.meta.env.VITE_ARKIV_API_KEY as string | undefined) ?? '',
  ipfsGateway: 'https://w3s.link',
  synapseBaseUrl: 'https://api.synapse.storage',
  synapseApiKey: '',
  aolCanisterId: '3gzy3-kaaaa-aaaan-q6y6q-cai',
  aolVerifyingContract: '0x0000000000000000000000000000000000000000',
  eip712ChainId: 1,
  icpHost: 'https://icp-api.io',
  showDemoTracks: false,
};

const STORAGE_KEY = 'haven-tunes-2000:config:v2';

export function loadConfig(): HavenConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<HavenConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: HavenConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage quota errors
  }
}

export function normalizeChainId(chainRaw: string | number | bigint | undefined): number {
  if (typeof chainRaw === 'number' && Number.isFinite(chainRaw) && chainRaw > 0) return chainRaw;
  if (typeof chainRaw === 'bigint' && chainRaw > 0n) return Number(chainRaw);
  if (!chainRaw) return 8453;
  const s = String(chainRaw).trim().toLowerCase();
  if (VARIANT_TO_CHAIN_ID[s]) return VARIANT_TO_CHAIN_ID[s];
  const n = Number(s.replace(/^eip155:/, ''));
  return Number.isFinite(n) && n > 0 ? n : 8453;
}

export function chainVariantFor(chainRaw: string | number | bigint | undefined): string {
  const id = normalizeChainId(chainRaw);
  return CHAIN_REGISTRY[id]?.variant ?? `eip155:${id}`;
}

export function aolVariantFor(chainRaw: string | number | bigint | undefined): HavenAolChainVariant {
  const id = normalizeChainId(chainRaw);
  return CHAIN_REGISTRY[id]?.aolVariant ?? 'EthMainnet';
}

export function makeGateId(chainId: number, tokenAddress: string, threshold: string): string {
  return `gate:${chainId}:${tokenAddress.toLowerCase()}:${threshold || '1'}`;
}
