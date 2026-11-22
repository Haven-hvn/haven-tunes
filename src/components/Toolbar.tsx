import type { ViewMode } from '../types';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';
import {
  CoverFlowIcon,
  GridViewIcon,
  ListViewIcon,
  LockIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  UnlockIcon,
  VolumeIcon,
} from './icons';

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

interface ToolbarProps {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  search: string;
  setSearch: (q: string) => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

export function Toolbar({
  viewMode,
  setViewMode,
  search,
  setSearch,
  canBack,
  canForward,
  onBack,
  onForward,
}: ToolbarProps) {
  const haven = useHaven();
  const player = usePlayer();
  const item = player.currentItem;
  const pct = player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;

  return (
    <header className="w2k-toolbar">
      <div className="w2k-tb-left">
        <div className="w2k-nav-group">
          <button className="w2k-btn w2k-nav-btn" disabled={!canBack} onClick={onBack} title="Back">
            ◀
          </button>
          <button className="w2k-btn w2k-nav-btn" disabled={!canForward} onClick={onForward} title="Forward">
            ▶
          </button>
        </div>

        <div className="w2k-transport">
          <button className="w2k-round-btn" onClick={player.prev} title="Previous">
            <PrevIcon />
          </button>
          <button className="w2k-round-btn w2k-play-btn" onClick={player.togglePlay} title="Play / Pause">
            {player.isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
          <button className="w2k-round-btn" onClick={player.next} title="Next">
            <NextIcon />
          </button>
        </div>

        <div className="w2k-volume" title={`Volume ${Math.round(player.volume * 100)}%`}>
          <VolumeIcon size={13} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Classic Windows 2000-era backlit olive-green LCD display */}
      <div className="w2k-lcd">
        {player.isLoading ? (
          <div className="w2k-lcd-idle">
            <div className="w2k-lcd-title">DECRYPTING / BUFFERING…</div>
            <div className="w2k-lcd-sub">{player.loadStatus || 'Contacting Haven-AOL VetKD & IPFS'}</div>
          </div>
        ) : item ? (
          <>
            <div className="w2k-lcd-top">
              <span className="w2k-lcd-title">
                {item.encrypted ? (
                  haven.keyring[item.gate?.gateId || ''] ? (
                    <UnlockIcon size={10} style={{ marginRight: 4 }} />
                  ) : (
                    <LockIcon size={10} style={{ marginRight: 4 }} />
                  )
                ) : null}
                {item.title}
              </span>
              <div className={`w2k-eq ${player.isPlaying ? 'playing' : ''}`} aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="w2k-lcd-sub">
              {item.artist} — {item.album}
              {item.demo ? ' [DEMO SYNTH]' : item.encrypted ? ' [VETKD AES-256]' : ' [FILECOIN/IPFS]'}
            </div>
            <div className="w2k-lcd-scrub">
              <span className="w2k-lcd-time">{fmtTime(player.currentTime)}</span>
              <div
                className="w2k-lcd-track"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  player.seek(ratio * (player.duration || 1));
                }}
              >
                <div className="w2k-lcd-fill" style={{ width: `${pct}%` }} />
                <div className="w2k-lcd-diamond" style={{ left: `${pct}%` }} />
              </div>
              <span className="w2k-lcd-time">-{fmtTime(Math.max(0, player.duration - player.currentTime))}</span>
            </div>
          </>
        ) : (
          <div className="w2k-lcd-idle">
            <div className="w2k-lcd-title">HAVEN TUNES 2000</div>
            <div className="w2k-lcd-sub">
              {haven.scanning
                ? 'Scanning Arkiv OP L3…'
                : `${haven.liveItems.length} Arkiv items · ${haven.daos.length} DataDAOs · Double-click to play`}
            </div>
          </div>
        )}
      </div>

      <div className="w2k-tb-right">
        <div className="w2k-view-seg" role="group" aria-label="View Mode">
          <button
            className={`w2k-seg-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <ListViewIcon />
          </button>
          <button
            className={`w2k-seg-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            <GridViewIcon />
          </button>
          <button
            className={`w2k-seg-btn ${viewMode === 'coverflow' ? 'active' : ''}`}
            onClick={() => setViewMode('coverflow')}
            title="Cover Flow"
          >
            <CoverFlowIcon />
          </button>
        </div>

        <div className="w2k-search-wrap">
          <input
            type="search"
            className="w2k-search"
            placeholder="Search library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          className={`w2k-btn w2k-wallet-btn ${haven.wallet.connected ? 'connected' : ''}`}
          onClick={() => (haven.wallet.connected ? haven.disconnect() : void haven.connect())}
          title={haven.wallet.connected ? 'Click to disconnect wallet' : 'Connect EVM Wallet'}
        >
          {haven.wallet.connected
            ? `${haven.wallet.address!.slice(0, 6)}…${haven.wallet.address!.slice(-4)}`
            : 'Connect Wallet'}
        </button>
      </div>
    </header>
  );
}
