import type { SourceId } from '../types';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';
import { getCoverArtDataUrl } from '../lib/coverArt';
import { FilmIcon, FolderDaoIcon, GeniusIcon, LockIcon, MusicNoteIcon, UnlockIcon } from './icons';

interface SidebarProps {
  source: SourceId;
  onSelect: (s: SourceId) => void;
}

export function Sidebar({ source, onSelect }: SidebarProps) {
  const haven = useHaven();
  const player = usePlayer();
  const current = player.currentItem;

  const musicCount = haven.allItems.filter((i) => i.kind === 'audio').length;
  const videoCount = haven.allItems.filter((i) => i.kind === 'video').length;
  const imageCount = haven.allItems.filter((i) => i.kind === 'image').length;
  const dripCount = haven.allItems.filter((i) => i.kind === 'drip').length;

  return (
    <aside className="w2k-sidebar">
      <div className="w2k-sidebar-scroll">
        <div className="w2k-sb-section">LIBRARY</div>
        <button className={`w2k-sb-item ${source === 'all' ? 'active' : ''}`} onClick={() => onSelect('all')}>
          <MusicNoteIcon />
          <span>All Media</span>
          <em className="w2k-sb-count">{haven.allItems.length}</em>
        </button>
        <button className={`w2k-sb-item ${source === 'music' ? 'active' : ''}`} onClick={() => onSelect('music')}>
          <MusicNoteIcon />
          <span>Music</span>
          <em className="w2k-sb-count">{musicCount}</em>
        </button>
        <button className={`w2k-sb-item ${source === 'videos' ? 'active' : ''}`} onClick={() => onSelect('videos')}>
          <FilmIcon />
          <span>Videos</span>
          <em className="w2k-sb-count">{videoCount}</em>
        </button>
        <button className={`w2k-sb-item ${source === 'images' ? 'active' : ''}`} onClick={() => onSelect('images')}>
          <span>🖼</span>
          <span>Images</span>
          <em className="w2k-sb-count">{imageCount}</em>
        </button>
        <button className={`w2k-sb-item ${source === 'drips' ? 'active' : ''}`} onClick={() => onSelect('drips')}>
          <FilmIcon />
          <span>Drip Series</span>
          <em className="w2k-sb-count">{dripCount}</em>
        </button>
        <button
          className={`w2k-sb-item ${source === 'my-uploads' ? 'active' : ''}`}
          onClick={() => onSelect('my-uploads')}
        >
          <FolderDaoIcon />
          <span>My Uploads</span>
        </button>

        <div className="w2k-sb-section">SHARED DATADAOS</div>
        {haven.daos.length === 0 ? (
          <div className="w2k-sb-empty">
            {haven.scanning ? 'Discovering gates…' : 'No gated DataDAOs found on RPC'}
          </div>
        ) : (
          haven.daos.map((dao) => {
            const id: SourceId = `dao:${dao.gateId}`;
            const unlocked = Boolean(haven.keyring[dao.gateId]);
            return (
              <button
                key={dao.gateId}
                className={`w2k-sb-item ${source === id ? 'active' : ''}`}
                onClick={() => onSelect(id)}
                title={`${dao.name} (${dao.chain}:${dao.tokenAddress})`}
              >
                {unlocked || dao.standing === 'member' ? (
                  <UnlockIcon style={{ color: source === id ? '#fff' : '#1b7a3d' }} />
                ) : (
                  <LockIcon style={{ color: source === id ? '#fff' : '#8b4513' }} />
                )}
                <span className="w2k-truncate">{dao.name}</span>
                <em className="w2k-sb-count">{dao.itemCount}</em>
              </button>
            );
          })
        )}

        <div className="w2k-sb-section">HAVEN NETWORK</div>
        <button
          className={`w2k-sb-item ${source === 'community' ? 'active' : ''}`}
          onClick={() => onSelect('community')}
        >
          <span>◎</span>
          <span>Community Feed</span>
        </button>
        <button
          className={`w2k-sb-item ${source === 'settings' ? 'active' : ''}`}
          onClick={() => onSelect('settings')}
        >
          <span>⚙</span>
          <span>Network &amp; Keyring</span>
        </button>

        <div className="w2k-sb-section">PLAYLISTS</div>
        <button
          className={`w2k-sb-item ${source === 'genius' ? 'active' : ''}`}
          onClick={() => onSelect('genius')}
        >
          <GeniusIcon />
          <span>Genius Mix</span>
        </button>
        <button
          className={`w2k-sb-item ${source === 'smart-unlocked' ? 'active' : ''}`}
          onClick={() => onSelect('smart-unlocked')}
        >
          <span>✦</span>
          <span>Unlocked &amp; Public</span>
        </button>
        <button
          className={`w2k-sb-item ${source === 'smart-attested' ? 'active' : ''}`}
          onClick={() => onSelect('smart-attested')}
        >
          <span>✓</span>
          <span>Holder Attested</span>
        </button>
        <button
          className={`w2k-sb-item ${source === 'smart-recent' ? 'active' : ''}`}
          onClick={() => onSelect('smart-recent')}
        >
          <span>◷</span>
          <span>Recently Added</span>
        </button>
        <button
          className={`w2k-sb-item ${source === 'smart-top' ? 'active' : ''}`}
          onClick={() => onSelect('smart-top')}
        >
          <span>★</span>
          <span>Top 25 Most Played</span>
        </button>

        {haven.playlists.map((pl) => (
          <button
            key={pl.id}
            className={`w2k-sb-item ${source === pl.id ? 'active' : ''}`}
            onClick={() => onSelect(pl.id as SourceId)}
          >
            <span>♫</span>
            <span className="w2k-truncate">{pl.name}</span>
            <em className="w2k-sb-count">{pl.trackIds.length}</em>
          </button>
        ))}
      </div>

      {/* Classic bottom-left Now Playing Artwork Box */}
      <div className="w2k-sb-artbox">
        <div className="w2k-sb-artbar">Now Playing</div>
        <div className="w2k-sb-artframe">
          {current ? (
            <img
              src={
                player.activeImageUrl ||
                current.thumbnailUrl ||
                getCoverArtDataUrl(current.album || current.title, current.artist, current.kind === 'video')
              }
              alt={current.title}
            />
          ) : (
            <div className="w2k-sb-artempty">Select a track, video, or image</div>
          )}
        </div>
      </div>
    </aside>
  );
}
