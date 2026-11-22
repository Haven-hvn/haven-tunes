import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function PlayIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M4 2.5L13.5 8L4 13.5Z" />
    </svg>
  );
}

export function PauseIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="3.5" y="2.5" width="3.5" height="11" />
      <rect x="9" y="2.5" width="3.5" height="11" />
    </svg>
  );
}

export function PrevIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="2" y="3" width="2" height="10" />
      <path d="M9 3L4 8L9 13Z" />
      <path d="M14 3L9 8L14 13Z" />
    </svg>
  );
}

export function NextIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M2 3L7 8L2 13Z" />
      <path d="M7 3L12 8L7 13Z" />
      <rect x="12" y="3" width="2" height="10" />
    </svg>
  );
}

export function ListViewIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="2" y="3" width="12" height="2" />
      <rect x="2" y="7" width="12" height="2" />
      <rect x="2" y="11" width="12" height="2" />
    </svg>
  );
}

export function GridViewIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
  );
}

export function CoverFlowIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <rect x="1.5" y="4" width="2.5" height="8" opacity="0.6" />
      <rect x="5" y="2.5" width="6" height="11" />
      <rect x="12" y="4" width="2.5" height="8" opacity="0.6" />
    </svg>
  );
}

export function LockIcon({ size = 12, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M5 7V5a3 3 0 0 1 6 0v2h1.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5H5zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2z" />
    </svg>
  );
}

export function UnlockIcon({ size = 12, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M10.5 7V5a1.5 1.5 0 0 0-3 0H6a3 3 0 0 1 6 0v2h.5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-6a.5.5 0 0 1 .5-.5h7z" />
    </svg>
  );
}

export function VolumeIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M2 6h3l4-3.5v11L5 10H2V6zm9.5 2a2.5 2.5 0 0 0-1-2v4a2.5 2.5 0 0 0 1-2z" />
    </svg>
  );
}

export function MusicNoteIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M6 12.5a2 2 0 1 1-1-1.73V4l8-1.5v7.77a2 2 0 1 1-1-1.73V4.6L6 5.7v6.8z" />
    </svg>
  );
}

export function FilmIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M2 3h12v10H2V3zm2 1.5v2h2v-2H4zm0 5v2h2v-2H4zm6-5v2h2v-2h-2zm0 5v2h2v-2h-2z" />
    </svg>
  );
}

export function FolderDaoIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M1.5 3h4.5l1.5 1.5h7v8.5h-13V3z" />
    </svg>
  );
}

export function GeniusIcon({ size = 13, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.6" />
    </svg>
  );
}
