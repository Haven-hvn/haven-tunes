import type { HavenConfig } from '../types';

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
  { id: number; variant: string; name: string; short: string; rpcUrl: string }
> = {
  1: {
    id: 1,
    variant: 'ethereum',
    name: 'Ethereum Mainnet',
    short: 'ETH',
    rpcUrl: 'https://ethereum.publicnode.com',
  },
  8453: {
    id: 8453,
    variant: 'base',
    name: 'Base',
    short: 'BASE',
    rpcUrl: 'https://base-rpc.publicnode.com',
  },
  42161: {
    id: 42161,
    variant: 'arbitrum',
    name: 'Arbitrum One',
    short: 'ARB',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
  },
  10: {
    id: 10,
    variant: 'optimism',
    name: 'Optimism',
    short: 'OP',
    rpcUrl: 'https://optimism-rpc.publicnode.com',
  },
  11155111: {
    id: 11155111,
    variant: 'sepolia',
    name: 'Ethereum Sepolia',
    short: 'SEP',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  314159: {
    id: 314159,
    variant: 'calibration',
    name: 'Filecoin Calibration',
    short: 'tFIL',
    rpcUrl: 'https://api.calibration.node.glif.io/rpc/v1',
  },
};

export const VARIANT_TO_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  mainnet: 1,
  eth: 1,
  'eip155:1': 1,
  base: 8453,
  'eip155:8453': 8453,
  arbitrum: 42161,
  arb: 42161,
  'eip155:42161': 42161,
  optimism: 10,
  op: 10,
  'eip155:10': 10,
  sepolia: 11155111,
  'eip155:11155111': 11155111,
  calibration: 314159,
  filecoin: 314159,
  'eip155:314159': 314159,
};

export const DEFAULT_CONFIG: HavenConfig = {
  arkivPreset: 'rabdi',
  arkivRpcUrl: ARKIV_PRESETS.rabdi.rpcUrl,
  arkivAccessKey: '',
  ipfsGateway: 'https://ipfs.io/ipfs/',
  aolCanisterId: '3gzy3-kaaaa-aaaan-q6y6q-cai',
  icpHost: 'https://icp-api.io',
  showDemoTracks: true,
};

const STORAGE_KEY = 'haven-tunes-2000:config:v1';

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

export function normalizeChainId(chainRaw: string | number | undefined): number {
  if (typeof chainRaw === 'number' && Number.isFinite(chainRaw)) return chainRaw;
  if (!chainRaw) return 8453;
  const s = String(chainRaw).trim().toLowerCase();
  if (VARIANT_TO_CHAIN_ID[s]) return VARIANT_TO_CHAIN_ID[s];
  const n = Number(s.replace(/^eip155:/, ''));
  return Number.isFinite(n) && n > 0 ? n : 8453;
}

export function chainVariantFor(chainRaw: string | number | undefined): string {
  const id = normalizeChainId(chainRaw);
  return CHAIN_REGISTRY[id]?.variant ?? `eip155:${id}`;
}
