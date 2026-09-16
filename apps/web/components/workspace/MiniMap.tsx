'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, ChevronDown } from 'lucide-react';
import { useWorkspacePresence } from '../../contexts/WorkspaceDomains';

// Drawing surface (CSS px). Kept small + unobtrusive in the corner.
const W = 184;
const H = 136;
const PAD = 6;

type MiniPlayer = { userId: string; x: number; y: number; name: string; self: boolean };
type Bounds = { width: number; height: number };
type NwHooks = {
  __nwGetPlayers?: () => MiniPlayer[];
  __nwGetWorldBounds?: () => Bounds;
  __nwMoveTo?: (x: number, y: number) => void;
  __nwPreviewAt?: (x: number, y: number) => void;
  __nwEndPreview?: () => void;
};

type Frame = { players: MiniPlayer[]; scale: number; offX: number; offY: number };

// The peer whose dot a click/hover would snap to (teleport next to them), or
// null to fall back to walking to the raw point. Shared by the click handler and
// the hover preview so both resolve the destination identically.
function nearestPeerAt(cx: number, cy: number, f: Frame): MiniPlayer | null {
  let nearest: MiniPlayer | null = null;
  let best = 9;
  for (const p of f.players) {
    if (p.self) continue;
    const d = Math.hypot(f.offX + p.x * f.scale - cx, f.offY + p.y * f.scale - cy);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return nearest;
}

// A live top-down minimap: rooms + everyone's position. Click to walk there,
// or click a peer's dot to teleport next to them. Hovering previews the landing spot.
export function MiniMap() {
  const { rooms, goToUser, desks } = useWorkspacePresence();
  const desksRef = useRef(desks);
  desksRef.current = desks;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(true);
  // Latest frame data, so the click handler maps screen → world the same way draw did.
  const lastRef = useRef<Frame>({
    players: [],
    scale: 1,
    offX: PAD,
    offY: PAD,
  });
  // Cursor position over the minimap (canvas px), or null when not hovering — the
  // draw loop paints a "you'll land here" marker there.
  const hoverRef = useRef<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    // Fit the ROOMS' bounding box (the green area) centred in the panel. The
    // world bounds carry an asymmetric margin, so centring on them left the
    // green off-centre — centre on the rooms instead. This geometry depends only
    // on `rooms` (in the deps), so compute it ONCE per effect run instead of
    // re-spreading four Math.min/max over the rooms on every animation frame.
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    if (rooms.length) {
      minX = Math.min(...rooms.map((r) => r.posX));
      minY = Math.min(...rooms.map((r) => r.posY));
      maxX = Math.max(...rooms.map((r) => r.posX + r.width));
      maxY = Math.max(...rooms.map((r) => r.posY + r.height));
    } else {
      const b = (window as unknown as NwHooks).__nwGetWorldBounds?.() ?? { width: 800, height: 600 };
      maxX = b.width || 800;
      maxY = b.height || 600;
    }
    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const scale = Math.min((W - PAD * 2) / cw, (H - PAD * 2) / ch);
    const offX = (W - cw * scale) / 2 - minX * scale;
    const offY = (H - ch * scale) / 2 - minY * scale;

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 20; // a corner minimap reads fine at ~20fps, not 60
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < FRAME_MS) return; // throttle: skip frames between redraws
      last = t;
      const cv = canvasRef.current;
      const nw = window as unknown as NwHooks;
      const ctx = cv?.getContext('2d');
      if (cv && ctx && nw.__nwGetPlayers) {
        const players = nw.__nwGetPlayers();
        lastRef.current = { players, scale, offX, offY };

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#f3eee6';
        ctx.fillRect(0, 0, W, H);
        // Rooms
        for (const r of rooms) {
          ctx.fillStyle = 'rgba(80,232,142,0.14)';
          ctx.strokeStyle = 'rgba(80,232,142,0.55)';
          ctx.lineWidth = 1;
          const rx = offX + r.posX * scale;
          const ry = offY + r.posY * scale;
          ctx.fillRect(rx, ry, r.width * scale, r.height * scale);
          ctx.strokeRect(rx, ry, r.width * scale, r.height * scale);
        }
        // Claimed desks (small amber squares).
        for (const d of desksRef.current) {
          ctx.fillStyle = '#f7a000';
          ctx.fillRect(offX + d.x * scale - 2, offY + d.y * scale - 2, 4, 4);
        }
        // Players
        for (const p of players) {
          const px = offX + p.x * scale;
          const py = offY + p.y * scale;
          ctx.beginPath();
          ctx.arc(px, py, p.self ? 4 : 3, 0, Math.PI * 2);
          ctx.fillStyle = p.self ? '#ffc500' : '#1c1915';
          ctx.fill();
          if (p.self) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#1c1915';
            ctx.stroke();
          }
        }
        // Hover preview: where a click would drop you (a peer's side if near a
        // dot, else the raw point). Pulsing amber dashed ring so it reads as a
        // target, not a player.
        const hov = hoverRef.current;
        if (hov) {
          const peer = nearestPeerAt(hov.cx, hov.cy, lastRef.current);
          const tx = peer ? offX + peer.x * scale : hov.cx;
          const ty = peer ? offY + peer.y * scale + 5 : hov.cy;
          const pulse = 4.5 + Math.sin(performance.now() / 180) * 1.5;
          ctx.save();
          ctx.beginPath();
          ctx.arc(tx, ty, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = '#f7a000';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(tx, ty, 1.3, 0, Math.PI * 2);
          ctx.fillStyle = '#f7a000';
          ctx.fill();
          ctx.restore();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, rooms]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (W / rect.width);
    const cy = (e.clientY - rect.top) * (H / rect.height);
    const { scale, offX, offY } = lastRef.current;
    // Near a peer's dot → teleport next to them; otherwise walk to that point.
    const nearest = nearestPeerAt(cx, cy, lastRef.current);
    if (nearest) {
      goToUser(nearest.userId);
      return;
    }
    const nw = window as unknown as NwHooks;
    nw.__nwMoveTo?.((cx - offX) / scale, (cy - offY) / scale);
  };

  const handleHover = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (W / rect.width);
    const cy = (e.clientY - rect.top) * (H / rect.height);
    hoverRef.current = { cx, cy };
    // Scrub the camera to the world point under the cursor (a peer's spot if
    // near their dot, else the raw point) so you preview where you'd land.
    const { scale, offX, offY } = lastRef.current;
    const peer = nearestPeerAt(cx, cy, lastRef.current);
    const wx = peer ? peer.x : (cx - offX) / scale;
    const wy = peer ? peer.y : (cy - offY) / scale;
    (window as unknown as NwHooks).__nwPreviewAt?.(wx, wy);
  };

  const endHover = () => {
    hoverRef.current = null;
    (window as unknown as NwHooks).__nwEndPreview?.();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Afficher la mini-carte"
        aria-label="Afficher la mini-carte"
        className="absolute bottom-3 right-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] text-[var(--color-text-secondary)] shadow-lg hover:text-[var(--color-text-primary)]"
      >
        <MapIcon size={16} />
      </button>
    );
  }

  return (
    <div className="absolute bottom-3 right-3 z-30 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-lg">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          <MapIcon size={12} /> Carte
        </span>
        <button
          onClick={() => setOpen(false)}
          title="Masquer la mini-carte"
          aria-label="Masquer la mini-carte"
          className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        onMouseMove={handleHover}
        onMouseLeave={endHover}
        style={{ width: W, height: H, cursor: 'pointer', display: 'block' }}
      />
    </div>
  );
}
