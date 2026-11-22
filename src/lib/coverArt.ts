// Deterministic retro Windows 2000 / CD jewel-case SVG cover art generator.

const PALETTES: Array<[string, string, string]> = [
  ['#1b3b6f', '#065a82', '#9eb3c2'],
  ['#2d4739', '#09814a', '#e5c687'],
  ['#4a1942', '#893168', '#eaeaea'],
  ['#5c2c16', '#b85d19', '#f2d0a4'],
  ['#1f2421', '#216869', '#9cc5a1'],
  ['#2b2d42', '#8d99ae', '#ef233c'],
  ['#0f4c5c', '#e36414', '#fb8b24'],
  ['#3d405b', '#e07a5f', '#f2cc8f'],
];

function hashStr(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const cache = new Map<string, string>();

export function getCoverArtDataUrl(seed: string, subtitle?: string, isVideo?: boolean): string {
  const key = `${seed}|${subtitle || ''}|${isVideo ? 'v' : 'a'}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const h = hashStr(seed || 'haven');
  const [c1, c2, c3] = PALETTES[h % PALETTES.length];
  const pattern = h % 4;
  const label = (seed || 'HAVEN').slice(0, 18).replace(/[<>&"']/g, '');
  const sub = (subtitle || (isVideo ? 'HAVEN VIDEO' : 'HAVEN AUDIO')).slice(0, 22).replace(/[<>&"']/g, '');

  let motif = '';
  if (pattern === 0) {
    motif = `<circle cx="110" cy="92" r="56" fill="${c2}" opacity="0.72"/>
             <circle cx="110" cy="92" r="22" fill="${c1}"/>
             <circle cx="110" cy="92" r="7" fill="${c3}"/>`;
  } else if (pattern === 1) {
    motif = `<rect x="24" y="28" width="172" height="22" fill="${c2}" opacity="0.8"/>
             <rect x="24" y="60" width="136" height="22" fill="${c3}" opacity="0.85"/>
             <rect x="24" y="92" width="160" height="22" fill="${c2}" opacity="0.55"/>`;
  } else if (pattern === 2) {
    motif = `<polygon points="110,24 186,138 34,138" fill="${c2}" opacity="0.78"/>
             <polygon points="110,48 158,124 62,124" fill="${c3}" opacity="0.72"/>`;
  } else {
    motif = `<rect x="30" y="26" width="70" height="70" fill="${c2}" opacity="0.85"/>
             <rect x="112" y="26" width="70" height="70" fill="${c3}" opacity="0.78"/>
             <rect x="70" y="66" width="80" height="72" fill="${c1}" opacity="0.72"/>`;
  }

  const badge = isVideo
    ? `<rect x="150" y="12" width="56" height="18" rx="2" fill="#0a246a" stroke="#fff" stroke-width="1"/>
       <text x="178" y="24" font-family="Tahoma,sans-serif" font-size="9" font-weight="bold" fill="#fff" text-anchor="middle">VIDEO</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="#0d1117"/>
      </linearGradient>
    </defs>
    <rect width="220" height="220" fill="url(#g)"/>
    ${motif}
    ${badge}
    <rect x="0" y="156" width="220" height="64" fill="rgba(0,0,0,0.52)"/>
    <text x="14" y="182" font-family="Tahoma,Segoe UI,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">${label}</text>
    <text x="14" y="202" font-family="Tahoma,Segoe UI,sans-serif" font-size="10" fill="${c3}">${sub}</text>
  </svg>`;

  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}
