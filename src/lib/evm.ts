import { createPublicClient, formatUnits, http, type Address } from 'viem';
import type { DataDaoEntry } from '../types';
import { CHAIN_REGISTRY } from './config';

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

interface Eip6963ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

const discoveredProviders = new Map<string, Eip6963ProviderDetail>();

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', ((ev: CustomEvent<Eip6963ProviderDetail>) => {
    if (ev.detail?.info?.uuid && ev.detail?.provider) {
      discoveredProviders.set(ev.detail.info.uuid, ev.detail);
    }
  }) as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function getBestInjectedProvider(): { provider: Eip1193Provider; name: string } | null {
  if (discoveredProviders.size > 0) {
    const first = Array.from(discoveredProviders.values())[0];
    return { provider: first.provider, name: first.info.name };
  }
  const win = window as unknown as { ethereum?: Eip1193Provider };
  if (win.ethereum) {
    return { provider: win.ethereum, name: 'Browser Wallet' };
  }
  return null;
}

export async function connectWallet(): Promise<{
  address: string;
  chainId: number;
  providerName: string;
  provider: Eip1193Provider;
}> {
  const found = getBestInjectedProvider();
  if (!found) {
    throw new Error('No EVM wallet detected (install MetaMask, Rabby, or connect via Haven OS).');
  }
  const accounts = (await found.provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet connection was cancelled.');
  }
  const chainHex = (await found.provider.request({ method: 'eth_chainId' })) as string;
  return {
    address: accounts[0].toLowerCase(),
    chainId: parseInt(chainHex, 16) || 1,
    providerName: found.name,
    provider: found.provider,
  };
}

export async function signTypedDataV4(
  provider: Eip1193Provider,
  address: string,
  typedData: Record<string, unknown>,
): Promise<string> {
  const sig = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [address, JSON.stringify(typedData)],
  });
  return String(sig);
}

const ERC20_ABI = [
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export async function inspectDaoGateStanding(
  dao: DataDaoEntry,
  walletAddress: string | null,
): Promise<DataDaoEntry> {
  const chainMeta = CHAIN_REGISTRY[dao.chainId];
  if (!chainMeta) return dao;

  try {
    const client = createPublicClient({ transport: http(chainMeta.rpcUrl) });
    const addr = dao.tokenAddress as Address;

    const [name, symbol, decimals, balanceRaw] = await Promise.all([
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'name' }).catch(() => null),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => null),
      client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
      walletAddress
        ? client
            .readContract({
              address: addr,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [walletAddress as Address],
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const dec = typeof decimals === 'number' ? decimals : 18;
    let standing = dao.standing;
    let balanceFormatted: string | undefined;

    if (walletAddress && balanceRaw != null) {
      balanceFormatted = formatUnits(balanceRaw, dec);
      let thresholdWei = 1n;
      try {
        thresholdWei = BigInt(dao.threshold);
      } catch {
        thresholdWei = 1n;
      }
      standing = balanceRaw >= thresholdWei ? 'member' : 'locked';
    }

    return {
      ...dao,
      name: typeof name === 'string' && name.trim() ? name.trim() : dao.name,
      symbol: typeof symbol === 'string' && symbol.trim() ? symbol.trim() : dao.symbol,
      decimals: dec,
      standing,
      balanceRaw: balanceRaw ?? undefined,
      balanceFormatted,
    };
  } catch {
    return dao;
  }
}
