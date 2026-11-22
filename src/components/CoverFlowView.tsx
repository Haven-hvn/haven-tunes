import { useEffect, useState } from 'react';
import type { MediaItem } from '../types';
import { getCoverArtDataUrl } from '../lib/coverArt';
import { usePlayer } from '../state/PlayerContext';
import { ListView } from './ListView';

interface CoverFlowViewProps {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CoverFlowView({ items, selectedId, onSelect }: CoverFlowViewProps) {
  const player = usePlayer();
  const [activeIdx, setActiveIdx] = useState(0);

  const safeIdx = Math.min(activeIdx, Math.max(0, items.length - 1));
  const focused = items[safeIdx];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') setActiveIdx((i) => Math.min(items.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setActiveIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'Enter' && focused) void player.playItem(focused, items);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, items, player]);

  return (
    <div className="w2k-cf-shell">
      <div className="w2k-cf-stage">
        <div className="w2k-cf-carousel">
          {items.map((item, idx) => {
            const offset = idx - safeIdx;
            if (Math.abs(offset) > 5) return null;
            const tx = offset === 0 ? 0 : offset * 76 + (offset > 0 ? 64 : -64);
            const tz = offset === 0 ? 70 : -110 - Math.abs(offset) * 24;
            const ry = offset === 0 ? 0 : offset > 0 ? -56 : 56;
            const cover =
              item.thumbnailUrl ||
              getCoverArtDataUrl(item.album || item.title, item.artist, item.kind === 'video');

            return (
              <div
                key={item.id}
                className={`w2k-cf-item ${offset === 0 ? 'center' : ''}`}
                style={{
                  transform: `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg)`,
                  zIndex: 20 - Math.abs(offset),
                  opacity: Math.max(0.25, 1 - Math.abs(offset) * 0.16),
                }}
                onClick={() => {
                  if (offset === 0) void player.playItem(item, items);
                  else {
                    setActiveIdx(idx);
                    onSelect(item.id);
                  }
                }}
              >
                <img src={cover} alt={item.title} />
                <div className="w2k-cf-reflection">
                  <img src={cover} alt="" aria-hidden />
                </div>
              </div>
            );
          })}
        </div>

        {focused && (
          <div className="w2k-cf-caption">
            <div className="w2k-cf-title">{focused.title}</div>
            <div className="w2k-cf-sub">
              {focused.artist} — {focused.album}
            </div>
          </div>
        )}

        {items.length > 1 && (
          <input
            type="range"
            className="w2k-cf-slider"
            min={0}
            max={items.length - 1}
            value={safeIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              setActiveIdx(i);
              if (items[i]) onSelect(items[i].id);
            }}
          />
        )}
      </div>

      <div className="w2k-cf-list">
        <ListView items={items} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  );
}
