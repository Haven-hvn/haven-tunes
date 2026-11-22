import { usePlayer } from '../state/PlayerContext';

export function VideoTheater() {
  const player = usePlayer();
  const item = player.currentItem;

  if (!player.theaterOpen || !player.activeVideoUrl || !item) return null;

  return (
    <div className="w2k-theater">
      <div className="w2k-theater-bar">
        <span>
          <strong>Video Theater:</strong> {item.title} — {item.artist}
          {item.encrypted ? ' [Decrypted via Haven-AOL VetKD]' : ' [Filecoin/IPFS Stream]'}
        </span>
        <div className="w2k-theater-actions">
          {item.cid && <code className="w2k-mono">{item.cid.slice(0, 14)}…</code>}
          <button className="w2k-btn w2k-btn-xs" onClick={() => player.setTheaterOpen(false)}>
            Hide Theater
          </button>
        </div>
      </div>
      <div className="w2k-theater-stage">
        <video
          ref={player.videoElRef}
          src={player.activeVideoUrl}
          controls
          playsInline
          className="w2k-video-el"
        />
      </div>
    </div>
  );
}
