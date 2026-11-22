import { useCallback, useMemo, useState } from 'react';
import type { SourceId, ViewMode } from './types';
import { HavenProvider, useHaven } from './state/HavenContext';
import { PlayerProvider } from './state/PlayerContext';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { VideoTheater } from './components/VideoTheater';
import { ListView } from './components/ListView';
import { GridView } from './components/GridView';
import { CoverFlowView } from './components/CoverFlowView';
import { SettingsView } from './components/SettingsView';
import { StatusBar } from './components/StatusBar';

function HavenTunesShell() {
  const haven = useHaven();
  const [source, setSource] = useState<SourceId>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const sourceItems = useMemo(() => haven.itemsForSource(source), [haven, source]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sourceItems;
    return sourceItems.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.artist.toLowerCase().includes(q) ||
        i.album.toLowerCase().includes(q) ||
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

  return (
    <div className="w2k-app">
      <MenuBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        setSource={selectSource}
        onCreatePlaylist={handleCreatePlaylist}
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

          <VideoTheater />

          {source === 'settings' ? (
            <SettingsView />
          ) : viewMode === 'list' ? (
            <ListView items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
          ) : viewMode === 'grid' ? (
            <GridView items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <CoverFlowView items={visibleItems} selectedId={selectedId} onSelect={setSelectedId} />
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
