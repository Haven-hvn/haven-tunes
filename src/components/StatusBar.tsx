import type { MediaItem } from '../types';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';
import { GeniusIcon } from './icons';

function fmtTotal(items: MediaItem[]): string {
  const total = items.reduce((acc, i) => acc + (i.durationSec || 0), 0);
  const mins = Math.floor(total / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ${mins % 60} min`;
}

interface StatusBarProps {
  items: MediaItem[];
  onCreatePlaylist: () => void;
  onGenius: () => void;
}

export function StatusBar({ items, onCreatePlaylist, onGenius }: StatusBarProps) {
  const haven = useHaven();
  const player = usePlayer();

  return (
    <footer className="w2k-statusbar">
      <div className="w2k-sb-controls">
        <button className="w2k-btn w2k-btn-xs" onClick={onCreatePlaylist} title="New Playlist">
          +
        </button>
        <button
          className={`w2k-btn w2k-btn-xs ${player.shuffle ? 'pressed' : ''}`}
          onClick={player.toggleShuffle}
          title="Shuffle"
        >
          🔀
        </button>
        <button
          className={`w2k-btn w2k-btn-xs ${player.repeat !== 'off' ? 'pressed' : ''}`}
          onClick={player.cycleRepeat}
          title={`Repeat: ${player.repeat}`}
        >
          {player.repeat === 'one' ? '🔂' : '🔁'}
        </button>
        <button className="w2k-btn w2k-btn-xs" onClick={onGenius} title="Build Genius Mix from selected track">
          <GeniusIcon size={11} /> Genius
        </button>
      </div>

      <div className="w2k-sb-center">
        {items.length} item{items.length === 1 ? '' : 's'}, {fmtTotal(items)}
        {haven.lastScanMs != null ? ` · Arkiv ${haven.lastScanMs}ms` : ''}
      </div>

      <div className="w2k-sb-right">
        <button className="w2k-btn w2k-btn-xs" onClick={() => void haven.refreshLibrary()}>
          {haven.scanning ? 'Scanning…' : '↻ Sync'}
        </button>
      </div>
    </footer>
  );
}
