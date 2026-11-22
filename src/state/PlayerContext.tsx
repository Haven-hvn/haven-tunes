import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MediaItem, RepeatMode } from '../types';
import { fetchAndPrepareMediaUrl } from '../lib/aol';
import { RetroSynthEngine } from '../lib/synth';
import { useHaven } from './HavenContext';

interface PlayerContextValue {
  currentItem: MediaItem | null;
  queue: MediaItem[];
  isPlaying: boolean;
  isLoading: boolean;
  loadStatus: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  activeVideoUrl: string | null;
  theaterOpen: boolean;
  setTheaterOpen: (open: boolean) => void;
  playItem: (item: MediaItem, queue?: MediaItem[]) => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  videoElRef: React.RefObject<HTMLVideoElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const haven = useHaven();
  const [currentItem, setCurrentItem] = useState<MediaItem | null>(null);
  const [queue, setQueue] = useState<MediaItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.75);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const synthRef = useRef<RetroSynthEngine | null>(null);
  const synthTimerRef = useRef<number | null>(null);
  const blobUrlCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;
    synthRef.current = new RetroSynthEngine();
    return () => {
      audio.pause();
      synthRef.current?.stop();
      if (synthTimerRef.current) clearInterval(synthTimerRef.current);
      for (const u of blobUrlCache.current.values()) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    videoElRef.current?.pause();
    synthRef.current?.stop();
    if (synthTimerRef.current) {
      clearInterval(synthTimerRef.current);
      synthTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playItem = useCallback(
    async (item: MediaItem, nextQueue?: MediaItem[]) => {
      stopAll();
      setCurrentItem(item);
      if (nextQueue) setQueue(nextQueue);
      setCurrentTime(0);
      setDuration(item.durationSec || 180);

      // Demo synth track
      if (item.demo && !item.mediaUrl) {
        setActiveVideoUrl(null);
        setTheaterOpen(false);
        synthRef.current?.configure(item.id);
        synthRef.current?.setVolume(volume);
        synthRef.current?.start();
        setIsPlaying(true);
        haven.recordPlay(item.id);
        synthTimerRef.current = window.setInterval(() => {
          setCurrentTime((t) => {
            if (t + 0.5 >= (item.durationSec || 180)) {
              return 0;
            }
            return t + 0.5;
          });
        }, 500);
        return;
      }

      // Real Haven Arkiv + Filecoin/IPFS media (audio or video)
      setIsLoading(true);
      setLoadStatus(item.encrypted ? 'Checking Haven-AOL VetKD gate key…' : 'Fetching from Filecoin/IPFS gateway…');
      try {
        let unlockedKey = item.gate ? haven.keyring[item.gate.gateId] : undefined;
        if (item.encrypted && item.gate && !unlockedKey) {
          setLoadStatus('Requesting EIP-712 GateRequestV3 signature…');
          unlockedKey = (await haven.unlockGate(item.gate.gateId, item.epoch)) ?? undefined;
          if (!unlockedKey) {
            setIsLoading(false);
            setLoadStatus(null);
            return;
          }
        }

        let objectUrl = blobUrlCache.current.get(item.id);
        if (!objectUrl) {
          setLoadStatus(item.encrypted ? 'Fetching & decrypting AES-256-GCM media…' : 'Buffering media stream…');
          const prepared = await fetchAndPrepareMediaUrl(item, unlockedKey);
          objectUrl = prepared.objectUrl;
          blobUrlCache.current.set(item.id, objectUrl);
        }

        if (item.kind === 'video' || item.kind === 'drip' || item.mimeType.startsWith('video/')) {
          setActiveVideoUrl(objectUrl);
          setTheaterOpen(true);
          setIsPlaying(true);
          haven.recordPlay(item.id);
          window.setTimeout(() => {
            const vid = videoElRef.current;
            if (vid) {
              vid.volume = volume;
              void vid.play().catch(() => {});
            }
          }, 60);
        } else {
          setActiveVideoUrl(null);
          setTheaterOpen(false);
          const audio = audioRef.current;
          if (audio) {
            audio.src = objectUrl;
            audio.volume = volume;
            audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
            audio.onloadedmetadata = () => setDuration(audio.duration || item.durationSec || 180);
            audio.onended = () => setIsPlaying(false);
            await audio.play();
            setIsPlaying(true);
            haven.recordPlay(item.id);
          }
        }
      } catch (err) {
        haven.showToast(err instanceof Error ? err.message : 'Playback failed', 'err');
        // Fallback to synth preview if it's a demo or unreachable gateway
        setIsPlaying(false);
      } finally {
        setIsLoading(false);
        setLoadStatus(null);
      }
    },
    [haven, stopAll, volume],
  );

  const togglePlay = useCallback(() => {
    if (!currentItem) {
      if (haven.allItems.length > 0) {
        void playItem(haven.allItems[0], haven.allItems);
      }
      return;
    }
    if (currentItem.demo && !currentItem.mediaUrl) {
      if (isPlaying) {
        synthRef.current?.stop();
        if (synthTimerRef.current) clearInterval(synthTimerRef.current);
        setIsPlaying(false);
      } else {
        synthRef.current?.start();
        setIsPlaying(true);
        synthTimerRef.current = window.setInterval(() => {
          setCurrentTime((t) => (t + 0.5 >= duration ? 0 : t + 0.5));
        }, 500);
      }
      return;
    }
    if (activeVideoUrl && videoElRef.current) {
      if (isPlaying) {
        videoElRef.current.pause();
        setIsPlaying(false);
      } else {
        void videoElRef.current.play();
        setIsPlaying(true);
      }
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        void audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [activeVideoUrl, currentItem, duration, haven.allItems, isPlaying, playItem]);

  const next = useCallback(() => {
    if (queue.length === 0 || !currentItem) return;
    if (repeat === 'one') {
      void playItem(currentItem, queue);
      return;
    }
    const idx = queue.findIndex((x) => x.id === currentItem.id);
    const nextIdx = shuffle
      ? Math.floor(Math.random() * queue.length)
      : idx + 1 < queue.length
        ? idx + 1
        : repeat === 'all'
          ? 0
          : -1;
    if (nextIdx >= 0 && queue[nextIdx]) {
      void playItem(queue[nextIdx], queue);
    }
  }, [currentItem, playItem, queue, repeat, shuffle]);

  const prev = useCallback(() => {
    if (queue.length === 0 || !currentItem) return;
    if (currentTime > 4) {
      seek(0);
      return;
    }
    const idx = queue.findIndex((x) => x.id === currentItem.id);
    const prevIdx = idx > 0 ? idx - 1 : queue.length - 1;
    if (queue[prevIdx]) {
      void playItem(queue[prevIdx], queue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem, currentTime, playItem, queue]);

  const seek = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(duration || 1, sec));
      setCurrentTime(clamped);
      if (activeVideoUrl && videoElRef.current) {
        videoElRef.current.currentTime = clamped;
      } else if (audioRef.current && !currentItem?.demo) {
        audioRef.current.currentTime = clamped;
      }
    },
    [activeVideoUrl, currentItem?.demo, duration],
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    if (videoElRef.current) videoElRef.current.volume = clamped;
    synthRef.current?.setVolume(clamped);
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  );

  return (
    <PlayerContext.Provider
      value={{
        currentItem,
        queue,
        isPlaying,
        isLoading,
        loadStatus,
        currentTime,
        duration,
        volume,
        shuffle,
        repeat,
        activeVideoUrl,
        theaterOpen,
        setTheaterOpen,
        playItem,
        togglePlay,
        next,
        prev,
        seek,
        setVolume,
        toggleShuffle,
        cycleRepeat,
        videoElRef,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
