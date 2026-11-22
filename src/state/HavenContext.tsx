import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DataDaoEntry,
  GateStanding,
  HavenConfig,
  MediaItem,
  Playlist,
  SourceId,
  ToastMessage,
  WalletState,
} from '../types';
import { loadConfig, saveConfig } from '../lib/config';
import { buildDataDaoDirectory, fetchHavenMediaLibrary } from '../lib/arkiv';
import { connectWallet, inspectDaoGateStanding, type Eip1193Provider } from '../lib/evm';
import { unlockGateViaVetKd, type UnlockedGateKey } from '../lib/aol';
import {
  registerHavenOsBridge,
  type HavenOsBridgeClient,
  type HavenOsBridgeConfig,
} from '../lib/osBridge';
import { DEMO_MEDIA_ITEMS } from '../data/demoLibrary';

const PLAYLISTS_KEY = 'haven-tunes-2000:playlists:v1';
const META_KEY = 'haven-tunes-2000:meta:v1';

interface LocalMeta {
  ratings: Record<string, number>;
  plays: Record<string, number>;
}

function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Playlist[];
  } catch {
    return [];
  }
}

function loadLocalMeta(): LocalMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ratings: {}, plays: {} };
    return JSON.parse(raw) as LocalMeta;
  } catch {
    return { ratings: {}, plays: {} };
  }
}

interface HavenContextValue {
  config: HavenConfig;
  updateConfig: (patch: Partial<HavenConfig>) => void;
  wallet: WalletState;
  osBridgeActive: boolean;
  osBridgeOrigin: string | null;
  providerRef: React.MutableRefObject<Eip1193Provider | null>;
  connect: () => Promise<void>;
  disconnect: () => void;
  scanning: boolean;
  scanError: string | null;
  blockNumber: number | null;
  lastScanMs: number | null;
  refreshLibrary: () => Promise<void>;
  liveItems: MediaItem[];
  allItems: MediaItem[];
  daos: DataDaoEntry[];
  keyring: Record<string, UnlockedGateKey>;
  unlockingGateId: string | null;
  unlockGate: (gateId: string, epoch?: number) => Promise<UnlockedGateKey | null>;
  clearKeyring: () => void;
  standingFor: (item: MediaItem) => GateStanding;
  playlists: Playlist[];
  createPlaylist: (name?: string, trackIds?: string[]) => Playlist;
  addToPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  setRating: (id: string, rating: number) => void;
  recordPlay: (id: string) => void;
  addLocalPublishedItem: (item: MediaItem) => void;
  geniusSeedId: string | null;
  geniusIds: string[];
  runGenius: (seedItem: MediaItem) => void;
  itemsForSource: (source: SourceId) => MediaItem[];
  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
}

const HavenContext = createContext<HavenContextValue | null>(null);

let toastSeq = 0;

export function HavenProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<HavenConfig>(() => loadConfig());
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    chainId: null,
    providerName: null,
  });
  const [osBridgeActive, setOsBridgeActive] = useState(false);
  const [osBridgeOrigin, setOsBridgeOrigin] = useState<string | null>(null);
  const bridgeRef = useRef<HavenOsBridgeClient | null>(null);
  const providerRef = useRef<Eip1193Provider | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [lastScanMs, setLastScanMs] = useState<number | null>(null);
  const [liveItems, setLiveItems] = useState<MediaItem[]>([]);
  const [localPublished, setLocalPublished] = useState<MediaItem[]>([]);
  const [daos, setDaos] = useState<DataDaoEntry[]>([]);
  const [keyring, setKeyring] = useState<Record<string, UnlockedGateKey>>({});
  const [unlockingGateId, setUnlockingGateId] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists());
  const [localMeta, setLocalMeta] = useState<LocalMeta>(() => loadLocalMeta());
  const [geniusSeedId, setGeniusSeedId] = useState<string | null>(null);
  const [geniusIds, setGeniusIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    toastSeq += 1;
    const id = toastSeq;
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 3400);
  }, []);

  const updateConfig = useCallback((patch: Partial<HavenConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      saveConfig(next);
      return next;
    });
  }, []);

  // Cross-site Haven OS Bridge (haven-os:v1) handshake & live sync
  useEffect(() => {
    const bridge = registerHavenOsBridge({ appId: 'haven-tunes' });
    if (!bridge) return;
    bridgeRef.current = bridge;

    let cancelled = false;
    void bridge.waitForWelcome(2000).then((welcome) => {
      if (cancelled || !welcome) return;
      setOsBridgeActive(true);
      setOsBridgeOrigin(bridge.hostOrigin);
      providerRef.current = bridge.provider as unknown as Eip1193Provider;

      // Sync active Control Panel config from Haven OS
      if (welcome.config) {
        updateConfig({
          arkivPreset: welcome.config.arkivRpcUrl.includes('127.0.0.1')
            ? 'localhost'
            : welcome.config.arkivRpcUrl.includes('rabdi')
              ? 'rabdi'
              : 'custom',
          arkivRpcUrl: welcome.config.arkivRpcUrl,
          ipfsGateway: welcome.config.ipfsGateway,
          aolCanisterId: welcome.config.havenAolCanisterId,
          icpHost: welcome.config.icpHost,
        });
      }

      // Auto-attach Haven OS shared wallet if already connected
      if (welcome.wallet?.address) {
        setWallet({
          connected: true,
          address: welcome.wallet.address.toLowerCase(),
          chainId: welcome.wallet.chainId ?? 1,
          providerName: welcome.wallet.walletName
            ? `${welcome.wallet.walletName} (Haven OS)`
            : 'Haven OS Shared Wallet',
        });
        showToast(
          `Attached to Haven OS Shared Wallet (${welcome.wallet.address.slice(0, 6)}…${welcome.wallet.address.slice(-4)})`,
          'ok',
        );
      }
    });

    const offAccounts = bridge.onEvent('accountsChanged', (data) => {
      const accounts = Array.isArray(data) ? (data as string[]) : [];
      if (accounts.length > 0 && accounts[0]) {
        providerRef.current = bridge.provider as unknown as Eip1193Provider;
        setWallet((prev) => ({
          connected: true,
          address: accounts[0].toLowerCase(),
          chainId: prev.chainId ?? 1,
          providerName: 'Haven OS Shared Wallet',
        }));
      } else {
        setWallet({ connected: false, address: null, chainId: null, providerName: null });
      }
    });

    const offChain = bridge.onEvent('chainChanged', (data) => {
      const hex = String(data || '0x1');
      const id = parseInt(hex, 16) || 1;
      setWallet((prev) => (prev.connected ? { ...prev, chainId: id } : prev));
    });

    const offConfig = bridge.onEvent('configChanged', (data) => {
      const c = data as Partial<HavenOsBridgeConfig> | null;
      if (!c) return;
      updateConfig({
        ...(c.arkivRpcUrl ? { arkivRpcUrl: c.arkivRpcUrl } : {}),
        ...(c.ipfsGateway ? { ipfsGateway: c.ipfsGateway } : {}),
        ...(c.havenAolCanisterId ? { aolCanisterId: c.havenAolCanisterId } : {}),
        ...(c.icpHost ? { icpHost: c.icpHost } : {}),
      });
    });

    return () => {
      cancelled = true;
      offAccounts();
      offChain();
      offConfig();
    };
  }, [showToast, updateConfig]);

  const refreshLibrary = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    const res = await fetchHavenMediaLibrary(config);
    setScanning(false);
    setBlockNumber(res.blockNumber);
    setLastScanMs(res.elapsedMs);
    if (res.error) {
      setScanError(res.error);
    }
    setLiveItems(res.items);
    const directory = buildDataDaoDirectory(res.items);
    setDaos(directory);
  }, [config]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  // Inspect on-chain ERC-20/721 metadata & balanceOf whenever DAOs or wallet changes
  useEffect(() => {
    if (daos.length === 0) return;
    let cancelled = false;
    void (async () => {
      const inspected = await Promise.all(
        daos.slice(0, 24).map((d) => inspectDaoGateStanding(d, wallet.address)),
      );
      if (!cancelled) {
        setDaos((prev) => {
          const map = new Map(inspected.map((d) => [d.gateId, d]));
          return prev.map((d) => map.get(d.gateId) ?? d);
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address, liveItems]);

  const connect = useCallback(async () => {
    try {
      // If attached to Haven OS bridge, delegate eth_requestAccounts to the OS host
      if (bridgeRef.current?.connectedToHost) {
        const accounts = (await bridgeRef.current.provider.request({
          method: 'eth_requestAccounts',
        })) as string[];
        if (!accounts || accounts.length === 0) {
          throw new Error('Wallet connection cancelled in Haven OS.');
        }
        const chainHex = (await bridgeRef.current.provider.request({
          method: 'eth_chainId',
        })) as string;
        providerRef.current = bridgeRef.current.provider as unknown as Eip1193Provider;
        setWallet({
          connected: true,
          address: accounts[0].toLowerCase(),
          chainId: parseInt(chainHex, 16) || 1,
          providerName: 'Haven OS Shared Wallet',
        });
        showToast(
          `Connected via Haven OS Bridge (${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)})`,
          'ok',
        );
        return;
      }

      const res = await connectWallet();
      providerRef.current = res.provider;
      setWallet({
        connected: true,
        address: res.address,
        chainId: res.chainId,
        providerName: res.providerName,
      });
      showToast(`Connected ${res.providerName} (${res.address.slice(0, 6)}…${res.address.slice(-4)})`, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Wallet connection failed', 'err');
    }
  }, [showToast]);

  const disconnect = useCallback(() => {
    providerRef.current = null;
    setWallet({ connected: false, address: null, chainId: null, providerName: null });
    showToast('Wallet disconnected.', 'info');
  }, [showToast]);

  const unlockGate = useCallback(
    async (gateId: string, epoch?: number): Promise<UnlockedGateKey | null> => {
      if (keyring[gateId]) return keyring[gateId];
      const dao = daos.find((d) => d.gateId === gateId);
      if (!dao) {
        showToast('Gate not found in DataDAO directory.', 'err');
        return null;
      }
      if (!wallet.connected || !wallet.address || !providerRef.current) {
        showToast('Connect your wallet first to sign Haven-AOL GateRequestV3.', 'warn');
        return null;
      }
      setUnlockingGateId(gateId);
      try {
        let key: UnlockedGateKey;

        // Exercise Haven OS shared VetKD keyring first when embedded
        if (bridgeRef.current?.connectedToHost) {
          const cached = await bridgeRef.current.getGateKey(gateId, epoch);
          const resolved =
            cached ??
            (await bridgeRef.current.unlockGate({
              gateId,
              chainId: dao.chainId,
              tokenAddress: dao.tokenAddress,
              threshold: dao.threshold,
              epoch,
            }));
          const bin = atob(resolved.rawKeyBase64);
          const rawKeyMaterial = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) rawKeyMaterial[i] = bin.charCodeAt(i);
          key = {
            gateId,
            epoch: resolved.epoch,
            rawKeyMaterial,
            unlockedAt: Date.now(),
          };
        } else {
          key = await unlockGateViaVetKd({
            config,
            provider: providerRef.current,
            address: wallet.address,
            chainId: dao.chainId,
            tokenAddress: dao.tokenAddress,
            threshold: dao.threshold,
            epoch,
            gateId,
          });
        }
        setKeyring((prev) => ({ ...prev, [gateId]: key }));
        setDaos((prev) =>
          prev.map((d) =>
            d.gateId === gateId ? { ...d, standing: 'member', unlockedEpoch: key.epoch } : d,
          ),
        );
        showToast(`Unlocked ${dao.symbol} DataDAO via Haven-AOL VetKD (epoch ${key.epoch}).`, 'ok');
        return key;
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'VetKD unlock failed', 'err');
        return null;
      } finally {
        setUnlockingGateId(null);
      }
    },
    [config, daos, keyring, showToast, wallet.address, wallet.connected],
  );

  const clearKeyring = useCallback(() => {
    setKeyring({});
    showToast('Cleared all cached VetKD gate keys from memory.', 'info');
  }, [showToast]);

  const allItems = useMemo(() => {
    const merged = [
      ...localPublished,
      ...liveItems,
      ...(config.showDemoTracks ? DEMO_MEDIA_ITEMS : []),
    ];
    return merged.map((item) => ({
      ...item,
      rating: localMeta.ratings[item.id] ?? item.rating,
      plays: (localMeta.plays[item.id] ?? 0) + item.plays,
    }));
  }, [config.showDemoTracks, liveItems, localMeta, localPublished]);

  const standingFor = useCallback(
    (item: MediaItem): GateStanding => {
      if (!item.gate) return 'public';
      if (keyring[item.gate.gateId]) return 'member';
      const dao = daos.find((d) => d.gateId === item.gate!.gateId);
      return dao?.standing ?? 'unchecked';
    },
    [daos, keyring],
  );

  const createPlaylist = useCallback(
    (name?: string, trackIds: string[] = []): Playlist => {
      const pl: Playlist = {
        id: `pl:${Date.now().toString(36)}`,
        name: name?.trim() || `Untitled Playlist ${playlists.length + 1}`,
        trackIds,
        createdAt: Date.now(),
      };
      setPlaylists((prev) => {
        const next = [...prev, pl];
        localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(next));
        return next;
      });
      return pl;
    },
    [playlists.length],
  );

  const addToPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      setPlaylists((prev) => {
        const next = prev.map((p) =>
          p.id === playlistId && !p.trackIds.includes(trackId)
            ? { ...p, trackIds: [...p.trackIds, trackId] }
            : p,
        );
        localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(next));
        return next;
      });
      showToast('Added item to playlist.', 'ok');
    },
    [showToast],
  );

  const deletePlaylist = useCallback((playlistId: string) => {
    setPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== playlistId);
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setRating = useCallback((id: string, rating: number) => {
    setLocalMeta((prev) => {
      const next = { ...prev, ratings: { ...prev.ratings, [id]: rating } };
      localStorage.setItem(META_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const recordPlay = useCallback((id: string) => {
    setLocalMeta((prev) => {
      const next = { ...prev, plays: { ...prev.plays, [id]: (prev.plays[id] ?? 0) + 1 } };
      localStorage.setItem(META_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addLocalPublishedItem = useCallback((item: MediaItem) => {
    setLocalPublished((prev) => [item, ...prev]);
  }, []);

  const runGenius = useCallback(
    (seedItem: MediaItem) => {
      const scored = allItems
        .filter((it) => it.id !== seedItem.id)
        .map((it) => {
          let score = 0;
          if (it.kind === seedItem.kind) score += 3;
          if (it.gate?.gateId && it.gate.gateId === seedItem.gate?.gateId) score += 5;
          if (it.creator === seedItem.creator) score += 4;
          if (it.album === seedItem.album) score += 2;
          for (const t of it.tags) {
            if (seedItem.tags.includes(t)) score += 2;
          }
          return { it, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((x) => x.it.id);
      setGeniusSeedId(seedItem.id);
      setGeniusIds([seedItem.id, ...scored]);
      showToast(`Genius Mix built from "${seedItem.title}" (${scored.length + 1} items).`, 'ok');
    },
    [allItems, showToast],
  );

  const itemsForSource = useCallback(
    (source: SourceId): MediaItem[] => {
      if (source === 'all' || source === 'community') return allItems;
      if (source === 'music') return allItems.filter((i) => i.kind === 'audio');
      if (source === 'videos') return allItems.filter((i) => i.kind === 'video');
      if (source === 'drips') return allItems.filter((i) => i.kind === 'drip');
      if (source === 'my-uploads') {
        if (!wallet.address) return localPublished;
        return allItems.filter((i) => i.creator === wallet.address || localPublished.some((l) => l.id === i.id));
      }
      if (source === 'smart-unlocked') {
        return allItems.filter((i) => {
          const st = standingFor(i);
          return st === 'public' || st === 'member';
        });
      }
      if (source === 'smart-recent') {
        return [...allItems].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 30);
      }
      if (source === 'smart-attested') {
        return allItems.filter((i) => i.attestation?.verified);
      }
      if (source === 'smart-top') {
        return [...allItems].sort((a, b) => b.plays - a.plays || b.rating - a.rating).slice(0, 25);
      }
      if (source === 'genius') {
        const set = new Set(geniusIds);
        return geniusIds
          .map((id) => allItems.find((i) => i.id === id))
          .filter((x): x is MediaItem => Boolean(x) && set.has(x!.id));
      }
      if (source.startsWith('dao:')) {
        const gateId = source.slice(4);
        return allItems.filter((i) => i.gate?.gateId === gateId);
      }
      if (source.startsWith('pl:')) {
        const pl = playlists.find((p) => p.id === source);
        if (!pl) return [];
        return pl.trackIds
          .map((id) => allItems.find((i) => i.id === id))
          .filter((x): x is MediaItem => Boolean(x));
      }
      return allItems;
    },
    [allItems, geniusIds, localPublished, playlists, standingFor, wallet.address],
  );

  return (
    <HavenContext.Provider
      value={{
        config,
        updateConfig,
        wallet,
        osBridgeActive,
        osBridgeOrigin,
        providerRef,
        connect,
        disconnect,
        scanning,
        scanError,
        blockNumber,
        lastScanMs,
        refreshLibrary,
        liveItems,
        allItems,
        daos,
        keyring,
        unlockingGateId,
        unlockGate,
        clearKeyring,
        standingFor,
        playlists,
        createPlaylist,
        addToPlaylist,
        deletePlaylist,
        setRating,
        recordPlay,
        addLocalPublishedItem,
        geniusSeedId,
        geniusIds,
        runGenius,
        itemsForSource,
        toast,
        showToast,
      }}
    >
      {children}
    </HavenContext.Provider>
  );
}

export function useHaven(): HavenContextValue {
  const ctx = useContext(HavenContext);
  if (!ctx) throw new Error('useHaven must be used within HavenProvider');
  return ctx;
}
