import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SourceId, ViewMode } from './types';
import { HavenProvider, useHaven } from './state/HavenContext';
import { PlayerProvider, usePlayer } from './state/PlayerContext';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { VideoTheater } from './components/VideoTheater';
import { ListView } from './components/ListView';
import { GridView } from './components/GridView';
import { CoverFlowView } from './components/CoverFlowView';
import { SettingsView } from './components/SettingsView';
import { StatusBar } from './components/StatusBar';

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function HavenTunesShell() {
  const haven = useHaven();
  const player = usePlayer();
  const [source, setSource] = useState<SourceId>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [nav, setNav] = useState<{ back: SourceId[]; forward: SourceId[] }>({ back: [], forward: [] });

  const selectSource = useCallback((next: SourceId) => {
    setSource((cur) => {
      if (cur !== next) {
        setNav((n) => ({ back: [...n.back, cur], forward: [] }));
        setSelectedId(null);
      }
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    if (nav.back.length === 0) return;
    const prev = nav.back[nav.back.length - 1];
    setNav({ back: nav.back.slice(0, -1), forward: [source, ...nav.forward] });
    setSource(prev);
  }, [nav, source]);

  const goForward = useCallback(() => {
    if (nav.forward.length === 0) return;
    const next = nav.forward[0];
    setNav({ back: [...nav.back, source], forward: nav.forward.slice(1) });
    setSource(next);
  }, [nav, source]);

  // Handle Haven OS Gate Explorer "Open in Haven Tunes" bridge event
  useEffect(() => {
    if (!haven.pendingOpenEntityKey) return;
    const match = haven.allItems.find(
      (i) => i.entityKey === haven.pendingOpenEntityKey || i.id === haven.pendingOpenEntityKey,
    );
    if (match) {
      setSource('all');
      setSelectedId(match.id);
      haven.clearPendingOpenEntity();
      void player.playItem(match, haven.allItems);
    }
  }, [haven, player]);

  const sourceItems = useMemo(() => haven.itemsForSource(source), [haven, source]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sourceItems;
    return sourceItems.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.artist.toLowerCase().includes(q) ||
        i.album.toLowerCase().includes(q) ||
        i.grp.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q)) ||
        (i.cid && i.cid.toLowerCase().includes(q)),
    );
  }, [search, sourceItems]);

  const handleCreatePlaylist = () => {
    const pl = haven.createPlaylist();
    selectSource(pl.id as SourceId);
    haven.showToast(`Created "${pl.name}".`, 'ok');
  };

  const handleGenius = () => {
    const seed =
      haven.allItems.find((i) => i.id === selectedId) ?? visibleItems[0] ?? haven.allItems[0];
    if (!seed) {
      haven.showToast('Select a track first to build a Genius Mix.', 'warn');
      return;
    }
    haven.runGenius(seed);
    selectSource('genius');
  };

  const activeDao = source.startsWith('dao:')
    ? haven.daos.find((d) => d.gateId === source.slice(4))
    : null;

  const activePlaylist = source.startsWith('pl:')
    ? haven.playlists.find((p) => p.id === source) ?? null
    : null;

  const inspectedItem = useMemo(
    () => haven.allItems.find((i) => i.id === selectedId) ?? player.currentItem ?? null,
    [haven.allItems, player.currentItem, selectedId],
  );

  return (
    <div className="w2k-app">
      <MenuBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        setSource={selectSource}
        onCreatePlaylist={handleCreatePlaylist}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector((s) => !s)}
      />

      <Toolbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        search={search}
        setSearch={setSearch}
        canBack={nav.back.length > 0}
        canForward={nav.forward.length > 0}
        onBack={goBack}
        onForward={goForward}
      />

      <div className="w2k-body">
        <Sidebar source={source} onSelect={selectSource} />

        <main className="w2k-main">
          {activeDao && (
            <div className="w2k-dao-banner">
              <div>
                <strong>{activeDao.name}</strong> ({activeDao.symbol}) ·{' '}
                <code className="w2k-mono">
                  {activeDao.chain}:{activeDao.tokenAddress.slice(0, 8)}…{activeDao.tokenAddress.slice(-6)}
                </code>
                {activeDao.balanceFormatted != null && (
                  <span> · Your balance: {activeDao.balanceFormatted}</span>
                )}
              </div>
              <button
                className="w2k-btn w2k-btn-xs"
                onClick={() => void haven.unlockGate(activeDao.gateId)}
                disabled={haven.unlockingGateId === activeDao.gateId}
              >
                {haven.keyring[activeDao.gateId]
                  ? `✓ Unlocked (Epoch ${haven.keyring[activeDao.gateId].epoch})`
                  : haven.unlockingGateId === activeDao.gateId
                    ? 'Signing VetKD…'
                    : 'Unlock DataDAO (VetKD)'}
              </button>
            </div>
          )}

          {activePlaylist && (
            <div className="w2k-dao-banner">
              <div>
                <strong>♫ {activePlaylist.name}</strong> · {activePlaylist.trackIds.length} item
                {activePlaylist.trackIds.length === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="w2k-btn w2k-btn-xs"
                  onClick={() => {
                    const nextName = window.prompt('Rename playlist:', activePlaylist.name);
                    if (nextName) haven.renamePlaylist(activePlaylist.id, nextName);
                  }}
                >
                  Rename
                </button>
                <button
                  className="w2k-btn w2k-btn-xs"
                  onClick={() => {
                    haven.deletePlaylist(activePlaylist.id);
                    selectSource('all');
                  }}
                >
                  Delete Playlist
                </button>
              </div>
            </div>
          )}

          <VideoTheater />

          {source === 'settings' ? (
            <SettingsView />
          ) : viewMode === 'list' ? (
            <ListView
              items={visibleItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              activePlaylistId={activePlaylist?.id ?? null}
            />
          ) : viewMode === 'grid' ? (
            <GridView items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <CoverFlowView items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
          )}

          {showInspector && inspectedItem && source !== 'settings' && (
            <div className="w2k-inspector">
              <div className="w2k-inspector-meta">
                <strong>{inspectedItem.title}</strong>
                <span className="w2k-inspector-sep">·</span>
                <code className="w2k-mono">{inspectedItem.grp}</code>
                <span className="w2k-inspector-sep">·</span>
                <span>{inspectedItem.mimeType}</span>
                {inspectedItem.sizeBytes ? (
                  <>
                    <span className="w2k-inspector-sep">·</span>
                    <span>{formatSize(inspectedItem.sizeBytes)}</span>
                  </>
                ) : null}
                {inspectedItem.cid ? (
                  <>
                    <span className="w2k-inspector-sep">·</span>
                    <code className="w2k-mono" title={inspectedItem.cid}>
                      {inspectedItem.pieceCid ? 'Piece: ' : 'CID: '}
                      {inspectedItem.cid.slice(0, 14)}…
                    </code>
                  </>
                ) : null}
              </div>
              <div className="w2k-inspector-actions">
                <button
                  className="w2k-btn w2k-btn-xs"
                  onClick={() => void player.playItem(inspectedItem, visibleItems)}
                >
                  ▶ Play
                </button>
                {haven.playlists.length > 0 && (
                  <select
                    className="w2k-input w2k-inspector-select"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        haven.addToPlaylist(e.target.value, inspectedItem.id);
                      }
                    }}
                  >
                    <option value="">+ Add to Playlist…</option>
                    {haven.playlists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                )}
                {inspectedItem.cid && (
                  <button
                    className="w2k-btn w2k-btn-xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(inspectedItem.cid!);
                      haven.showToast('Copied CID to clipboard.', 'ok');
                    }}
                  >
                    Copy CID
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar items={visibleItems} onCreatePlaylist={handleCreatePlaylist} onGenius={handleGenius} />

      {haven.toast && (
        <div className={`w2k-toast ${haven.toast.tone || 'info'}`}>{haven.toast.text}</div>
      )}
    </div>
  );
}

export function App() {
  return (
    <HavenProvider>
      <PlayerProvider>
        <HavenTunesShell />
      </PlayerProvider>
    </HavenProvider>
  );
}

export default App;
