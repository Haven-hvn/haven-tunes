import { useMemo, useState } from 'react';
import type { GridGroup, MediaItem } from '../types';
import { getCoverArtDataUrl } from '../lib/coverArt';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';
import { LockIcon, UnlockIcon } from './icons';

interface GridViewProps {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function GridView({ items, selectedId, onSelect }: GridViewProps) {
  const haven = useHaven();
  const player = usePlayer();
  const [groupBy, setGroupBy] = useState<GridGroup>('all');

  const cards = useMemo(() => {
    if (groupBy === 'all') {
      return items.map((item) => ({
        key: item.id,
        title: item.title,
        sub: item.artist,
        badge: item.kind.toUpperCase(),
        cover:
          item.thumbnailUrl ||
          getCoverArtDataUrl(item.album || item.title, item.artist, item.kind === 'video'),
        lead: item,
        tracks: items,
        count: 1,
      }));
    }
    const groups = new Map<string, MediaItem[]>();
    for (const it of items) {
      const k =
        groupBy === 'dao'
          ? it.album
          : groupBy === 'creator'
            ? it.artist
            : it.kind.toUpperCase();
      const arr = groups.get(k) ?? [];
      arr.push(it);
      groups.set(k, arr);
    }
    return Array.from(groups.entries()).map(([k, list]) => ({
      key: k,
      title: k,
      sub: `${list.length} item${list.length === 1 ? '' : 's'}`,
      badge: list[0].gate ? list[0].gate.chain.toUpperCase() : 'PUBLIC',
      cover:
        list[0].thumbnailUrl ||
        getCoverArtDataUrl(k, list[0].artist, list[0].kind === 'video'),
      lead: list[0],
      tracks: list,
      count: list.length,
    }));
  }, [groupBy, items]);

  return (
    <div className="w2k-grid-shell">
      <div className="w2k-subbar">
        <span>Group by:</span>
        {(['all', 'dao', 'creator', 'kind'] as GridGroup[]).map((g) => (
          <button
            key={g}
            className={`w2k-subtab ${groupBy === g ? 'active' : ''}`}
            onClick={() => setGroupBy(g)}
          >
            {g === 'all' ? 'All Items' : g === 'dao' ? 'DataDAOs / Albums' : g === 'creator' ? 'Creators' : 'Media Type'}
          </button>
        ))}
      </div>

      <div className="w2k-grid">
        {cards.map((c) => {
          const standing = haven.standingFor(c.lead);
          const isSel = selectedId === c.lead.id;
          return (
            <div
              key={c.key}
              className={`w2k-card ${isSel ? 'selected' : ''}`}
              onClick={() => onSelect(c.lead.id)}
              onDoubleClick={() => void player.playItem(c.lead, c.tracks)}
            >
              <div className="w2k-jewel">
                <img src={c.cover} alt={c.title} />
                <span className="w2k-jewel-badge">
                  {c.lead.gate ? (
                    standing === 'member' ? (
                      <UnlockIcon size={10} />
                    ) : (
                      <LockIcon size={10} />
                    )
                  ) : null}
                  {c.badge}
                </span>
              </div>
              <div className="w2k-card-title" title={c.title}>
                {c.title}
              </div>
              <div className="w2k-card-sub">{c.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
