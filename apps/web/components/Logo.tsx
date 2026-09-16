'use client';

// NestWork hexagonal mark + wordmark (Bee theme DA) — "tech alveoli" version:
// a honey hexagon containing a small connected honeycomb (cells + nodes).

import { useId } from 'react';

// Pointy-top hexagon path centered at (cx, cy) with circumradius r.
function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

// Three alveoli (cells) forming a small cluster inside the mark.
// y values centre the cluster's bounding box on the hexagon's middle (cy=30).
const CELLS: Array<[number, number]> = [
  [20.5, 25.4],
  [31.5, 25.4],
  [26, 34.6],
];
const CELL_R = 6.4;

export function HexMark({ size = 36 }: { size?: number }) {
  // Stable id across SSR/CSR (a module counter desynced server vs client → hydration warning).
  const id = `nw-hex-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={(size * 60) / 52} viewBox="0 0 52 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer hex */}
      <path d="M26 0L52 15V45L26 60L0 45V15L26 0Z" fill={`url(#${id})`} />
      {/* Circuit links between cell centers */}
      <path
        d={`M${CELLS[0][0]} ${CELLS[0][1]}L${CELLS[1][0]} ${CELLS[1][1]}L${CELLS[2][0]} ${CELLS[2][1]}Z`}
        stroke="white"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
        opacity="0.5"
      />
      {/* Alveoli (cells) */}
      {CELLS.map(([cx, cy], i) => (
        <path key={i} d={hexPath(cx, cy, CELL_R)} stroke="white" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      ))}
      {/* Nodes */}
      {CELLS.map(([cx, cy], i) => (
        <circle key={`n${i}`} cx={cx} cy={cy} r="1.5" fill="white" />
      ))}
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC500" />
          <stop offset="1" stopColor="#F77F00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <HexMark size={size} />
      <span
        className="font-display font-extrabold tracking-tight text-[var(--color-text-primary)]"
        style={{ fontSize: size * 0.62 }}
      >
        NestWork
      </span>
    </div>
  );
}
