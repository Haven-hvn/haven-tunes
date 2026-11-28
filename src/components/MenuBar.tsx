import { useEffect, useRef, useState } from 'react';
import type { SourceId, ViewMode } from '../types';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';

interface MenuBarProps {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  setSource: (s: SourceId) => void;
  onCreatePlaylist: () => void;
  showInspector: boolean;
  onToggleInspector: () => void;
}

export function MenuBar({
  viewMode,
  setViewMode,
  setSource,
  onCreatePlaylist,
  showInspector,
  onToggleInspector,
}: MenuBarProps) {
  const haven = useHaven();
  const player = usePlayer();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, []);

  const act = (fn: () => void) => {
    fn();
    setOpenMenu(null);
  };

  return (
    <div className="win2k-menubar" ref={barRef}>
      <div className="win2k-menu-wrap">
        <button
          className={`win2k-menu-btn ${openMenu === 'file' ? 'open' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
        >
          <u>F</u>ile
        </button>
        {openMenu === 'file' && (
          <div className="win2k-dropdown">
            <button onClick={() => act(onCreatePlaylist)}>New Playlist…</button>
            <button
              onClick={() =>
                act(() =>
                  haven.showToast('Use The Haven Bay app on your desktop to upload & seed new files.', 'info'),
                )
              }
            >
              Upload via The Haven Bay…
            </button>
            <div className="win2k-sep" />
            <button onClick={() => act(() => void haven.refreshLibrary(true))}>Rescan Arkiv L3 Library</button>
            <button onClick={() => act(() => setSource('settings'))}>Preferences &amp; RPC Settings…</button>
          </div>
        )}
      </div>

      <div className="win2k-menu-wrap">
        <button
          className={`win2k-menu-btn ${openMenu === 'controls' ? 'open' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'controls' ? null : 'controls')}
        >
          <u>C</u>ontrols
        </button>
        {openMenu === 'controls' && (
          <div className="win2k-dropdown">
            <button onClick={() => act(player.togglePlay)}>{player.isPlaying ? 'Pause' : 'Play'}</button>
            <button onClick={() => act(player.next)}>Next Track</button>
            <button onClick={() => act(player.prev)}>Previous Track</button>
            <div className="win2k-sep" />
            <button onClick={() => act(player.toggleShuffle)}>
              {player.shuffle ? '✓ ' : ''}Shuffle
            </button>
            <button onClick={() => act(player.cycleRepeat)}>
              Repeat: {player.repeat.toUpperCase()}
            </button>
          </div>
        )}
      </div>

      <div className="win2k-menu-wrap">
        <button
          className={`win2k-menu-btn ${openMenu === 'view' ? 'open' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}
        >
          <u>V</u>iew
        </button>
        {openMenu === 'view' && (
          <div className="win2k-dropdown">
            <button onClick={() => act(() => setViewMode('list'))}>
              {viewMode === 'list' ? '✓ ' : ''}as List
            </button>
            <button onClick={() => act(() => setViewMode('grid'))}>
              {viewMode === 'grid' ? '✓ ' : ''}as Grid
            </button>
            <button onClick={() => act(() => setViewMode('coverflow'))}>
              {viewMode === 'coverflow' ? '✓ ' : ''}as Cover Flow
            </button>
            <div className="win2k-sep" />
            <button onClick={() => act(onToggleInspector)}>
              {showInspector ? '✓ ' : ''}Track Inspector Bar
            </button>
            <button
              onClick={() =>
                act(() => haven.updateConfig({ showDemoTracks: !haven.config.showDemoTracks }))
              }
            >
              {haven.config.showDemoTracks ? '✓ ' : ''}Show Demo Synth Tracks
            </button>
          </div>
        )}
      </div>

      <div className="win2k-menu-wrap">
        <button
          className={`win2k-menu-btn ${openMenu === 'dao' ? 'open' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'dao' ? null : 'dao')}
        >
          <u>D</u>ataDAOs
        </button>
        {openMenu === 'dao' && (
          <div className="win2k-dropdown">
            {haven.wallet.connected ? (
              <button onClick={() => act(haven.disconnect)}>
                Disconnect Wallet ({haven.wallet.address?.slice(0, 6)}…{haven.wallet.address?.slice(-4)})
              </button>
            ) : (
              <button onClick={() => act(() => void haven.connect())}>Connect EVM Wallet…</button>
            )}
            <button onClick={() => act(haven.clearKeyring)}>
              Lock All VetKD Gate Keys ({Object.keys(haven.keyring).length})
            </button>
            <div className="win2k-sep" />
            <button onClick={() => act(() => setSource('community'))}>Browse Community Feed</button>
          </div>
        )}
      </div>

      <div className="win2k-menu-wrap">
        <button
          className={`win2k-menu-btn ${openMenu === 'help' ? 'open' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
        >
          <u>H</u>elp
        </button>
        {openMenu === 'help' && (
          <div className="win2k-dropdown">
            <button
              onClick={() =>
                act(() =>
                  haven.showToast(
                    'Haven Tunes 2000 — Arkiv OP L3 + Filecoin Synapse/IPFS + ICP Haven-AOL VetKD v3',
                    'info',
                  ),
                )
              }
            >
              About Haven Tunes 2000
            </button>
          </div>
        )}
      </div>

      <div className="win2k-menubar-right">
        {haven.osBridgeActive && (
          <span
            className="win2k-net-pill"
            title={`Connected to Haven OS cross-site bridge (${haven.osBridgeOrigin || 'parent'})`}
          >
            <span className="win2k-led ok" />
            OS BRIDGE
          </span>
        )}
        <span className="win2k-net-pill" title={haven.config.arkivRpcUrl}>
          <span className={`win2k-led ${haven.scanError ? 'err' : haven.scanning ? 'busy' : 'ok'}`} />
          {haven.config.arkivPreset.toUpperCase()}
          {haven.blockNumber ? ` #${haven.blockNumber}` : ''}
        </span>
      </div>
    </div>
  );
}
