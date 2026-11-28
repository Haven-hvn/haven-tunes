import { usePlayer } from '../state/PlayerContext';

export function VideoTheater() {
  const player = usePlayer();
  const item = player.currentItem;

  if (!player.theaterOpen || (!player.activeVideoUrl && !player.activeImageUrl) || !item) {
    return null;
  }

  const isImage = Boolean(player.activeImageUrl && !player.activeVideoUrl);
  const downloadUrl = player.activeVideoUrl || player.activeImageUrl;

  return (
    <div className="w2k-theater">
      <div className="w2k-theater-bar">
        <span>
          <strong>{isImage ? 'Image Viewer:' : 'Video Theater:'}</strong> {item.title} — {item.artist}
          {item.dripIdx != null ? ` [Drip #${item.dripIdx}]` : ''}
          {item.encrypted ? ' [Decrypted via Haven-AOL VetKD]' : ' [Filecoin/IPFS Stream]'}
        </span>
        <div className="w2k-theater-actions">
          {item.cid && <code className="w2k-mono">{item.cid.slice(0, 14)}…</code>}
          {downloadUrl && (
            <a
              className="w2k-btn w2k-btn-xs"
              href={downloadUrl}
              download={item.title || 'haven-media'}
              style={{ textDecoration: 'none' }}
            >
              Save
            </a>
          )}
          <button className="w2k-btn w2k-btn-xs" onClick={() => player.setTheaterOpen(false)}>
            Hide
          </button>
        </div>
      </div>
      <div className="w2k-theater-stage">
        {isImage && player.activeImageUrl ? (
          <img
            src={player.activeImageUrl}
            alt={item.title}
            className="w2k-image-el"
          />
        ) : player.activeVideoUrl ? (
          <video
            ref={player.videoElRef}
            src={player.activeVideoUrl}
            controls
            playsInline
            className="w2k-video-el"
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              player.onVideoTimeUpdate(el.currentTime, el.duration);
            }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              player.onVideoTimeUpdate(el.currentTime, el.duration);
            }}
            onPlay={() => player.onVideoPlayingChange(true)}
            onPause={() => player.onVideoPlayingChange(false)}
            onEnded={() => player.onVideoEnded()}
          />
        ) : null}
      </div>
    </div>
  );
}
