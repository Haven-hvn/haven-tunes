import { useMemo, useState } from 'react';
import type { MediaItem } from '../types';
import { useHaven } from '../state/HavenContext';
import { usePlayer } from '../state/PlayerContext';
import { LockIcon, PlayIcon, UnlockIcon } from './icons';

type SortKey = 'title' | 'durationSec' | 'artist' | 'album' | 'kind' | 'rating' | 'plays';

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

interface ListViewProps {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ListView({ items, selectedId, onSelect }: ListViewProps) {
  const haven = useHaven();
  const player = usePlayer();
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [items, sortDir, sortKey]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('asc');
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="w2k-empty-pane">
        <p>No media items match this view.</p>
        <button className="w2k-btn" onClick={() => void haven.refreshLibrary()}>
          Rescan Arkiv L3
        </button>
      </div>
    );
  }

  return (
    <div className="w2k-list-wrap">
      <table className="w2k-table">
        <thead>
          <tr>
            <th style={{ width: 28 }} />
            <th onClick={() => toggleSort('title')}>
              Name {sortKey === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th style={{ width: 64 }} onClick={() => toggleSort('durationSec')}>
              Time {sortKey === 'durationSec' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => toggleSort('artist')}>
              Creator / Artist {sortKey === 'artist' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th onClick={() => toggleSort('album')}>
              DataDAO / Album {sortKey === 'album' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th style={{ width: 72 }} onClick={() => toggleSort('kind')}>
              Type
            </th>
            <th style={{ width: 132 }}>Access / Gate</th>
            <th style={{ width: 88 }} onClick={() => toggleSort('rating')}>
              Rating
            </th>
            <th style={{ width: 54 }} onClick={() => toggleSort('plays')}>
              Plays
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => {
            const isSel = selectedId === item.id;
            const isNow = player.currentItem?.id === item.id;
            const standing = haven.standingFor(item);
            const isUnlocking = item.gate && haven.unlockingGateId === item.gate.gateId;

            return (
              <tr
                key={item.id}
                className={`${idx % 2 === 1 ? 'odd' : ''} ${isSel ? 'selected' : ''} ${isNow ? 'now' : ''}`}
                onClick={() => onSelect(item.id)}
                onDoubleClick={() => void player.playItem(item, sorted)}
              >
                <td className="w2k-col-play">
                  <button
                    className="w2k-row-play"
                    title="Play"
                    onClick={(e) => {
                      e.stopPropagation();
                      void player.playItem(item, sorted);
                    }}
                  >
                    {isNow && player.isPlaying ? '🔊' : <PlayIcon size={10} />}
                  </button>
                </td>
                <td className="w2k-col-title">
                  <span>{item.title}</span>
                  {item.demo && <span className="w2k-chip demo">DEMO</span>}
                  {item.attestation?.verified && (
                    <span className="w2k-chip attn" title="Cryptographic holder attestation verified">
                      ✓ Holder
                    </span>
                  )}
                </td>
                <td className="w2k-col-num">{fmtDur(item.durationSec)}</td>
                <td>{item.artist}</td>
                <td>{item.album}</td>
                <td className="w2k-col-kind">{item.kind.toUpperCase()}</td>
                <td>
                  {!item.gate ? (
                    <span className="w2k-gate-pill pub">Public Commons</span>
                  ) : standing === 'member' ? (
                    <span className="w2k-gate-pill ok">
                      <UnlockIcon size={10} /> Unlocked
                    </span>
                  ) : (
                    <button
                      className="w2k-gate-btn"
                      disabled={Boolean(isUnlocking)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.gate) void haven.unlockGate(item.gate.gateId, item.epoch);
                      }}
                    >
                      <LockIcon size={10} /> {isUnlocking ? 'Signing…' : 'Unlock VetKD'}
                    </button>
                  )}
                </td>
                <td>
                  <span className="w2k-stars" onClick={(e) => e.stopPropagation()}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={`w2k-star ${n <= item.rating ? 'on' : ''}`}
                        onClick={() => haven.setRating(item.id, n === item.rating ? 0 : n)}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                </td>
                <td className="w2k-col-num">{item.plays}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
