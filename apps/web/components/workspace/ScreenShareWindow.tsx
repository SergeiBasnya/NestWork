'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Minus, X, MonitorUp, Maximize2 } from 'lucide-react';
import { useMedia } from '../../contexts/MediaContext';

// A floating, draggable + resizable window that shows a screen share full-size
// (yours, or a nearby peer's). Screen shares no longer go in the tiny bubble.
export function ScreenShareWindow() {
  const { screenOn, localScreenStream, remotePeers, toggleScreen } = useMedia();
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, (window.innerWidth - 680) / 2) : 200,
    y: 84,
  }));
  const [size, setSize] = useState({ w: 680, h: 430 });
  const [min, setMin] = useState(false);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);

  // Remote screens take priority, with stable id ordering and an explicit
  // selector when several nearby peers share simultaneously; local is fallback.
  const remoteScreens = remotePeers.filter((peer) => peer.screenStream).sort((a, b) => a.id.localeCompare(b.id));
  const selectedRemote = remoteScreens.find((peer) => peer.id === selectedPeerId) ?? remoteScreens[0] ?? null;
  const selfActive = screenOn && !!localScreenStream;
  const active = selectedRemote
    ? { stream: selectedRemote.screenStream as MediaStream, title: `Écran de ${selectedRemote.name}`, mine: false }
    : selfActive
      ? { stream: localScreenStream as MediaStream, title: 'Votre écran', mine: true }
      : null;

  useEffect(() => {
    if (selectedPeerId && !remoteScreens.some((peer) => peer.id === selectedPeerId)) setSelectedPeerId(null);
  }, [remoteScreens, selectedPeerId]);

  // Attach the stream via a callback ref rather than an effect: the <video> is
  // unmounted whenever the window is minimized, so on restore React mounts a
  // fresh element. A ref callback fires on every (re)mount AND when the stream
  // changes, so srcObject is always reattached — an effect keyed on the stream
  // alone would skip the remount and leave the restored video black.
  const attachVideo = useCallback(
    (v: HTMLVideoElement | null) => {
      vidRef.current = v;
      if (v && active && v.srcObject !== active.stream) {
        v.srcObject = active.stream;
        v.play().catch(() => {});
      }
    },
    [active?.stream], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const goFullscreen = () => {
    vidRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (!active) return null;

  const onDragDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // let header buttons click
    dragRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 120, d.ox + (e.clientX - d.px))),
      y: Math.max(0, Math.min(window.innerHeight - 40, d.oy + (e.clientY - d.py))),
    });
  };
  const onDragUp = () => {
    dragRef.current = null;
  };

  const onResizeDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    resizeRef.current = { px: e.clientX, py: e.clientY, ow: size.w, oh: size.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    setSize({ w: Math.max(280, r.ow + (e.clientX - r.px)), h: Math.max(200, r.oh + (e.clientY - r.py)) });
  };
  const onResizeUp = () => {
    resizeRef.current = null;
  };

  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-hive-600 bg-hive-900 shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: size.w, height: min ? undefined : size.h }}
    >
      <div
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        className="flex cursor-move select-none items-center gap-2 bg-hive-800 px-3 py-1.5 text-xs text-white"
      >
        <MonitorUp size={14} className="text-honey" />
        <span className="flex-1 truncate font-medium">{active.title}</span>
        {remoteScreens.length > 1 && (
          <select value={selectedRemote?.id ?? ''} onChange={(event) => setSelectedPeerId(event.target.value)} onPointerDown={(event) => event.stopPropagation()} aria-label="Écran partagé affiché" className="max-w-40 rounded bg-hive-700 px-1 py-0.5 text-xs text-white">
            {remoteScreens.map((peer) => <option key={peer.id} value={peer.id}>{peer.name}</option>)}
          </select>
        )}
        {!min && (
          <button onClick={goFullscreen} title="Plein écran" className="rounded p-1 hover:bg-hive-700">
            <Maximize2 size={13} />
          </button>
        )}
        <button onClick={() => setMin((m) => !m)} title={min ? 'Agrandir' : 'Réduire'} className="rounded p-1 hover:bg-hive-700">
          <Minus size={13} />
        </button>
        {active.mine ? (
          <button onClick={() => toggleScreen()} title="Arrêter le partage" className="rounded p-1 hover:bg-red/30 hover:text-red">
            <X size={13} />
          </button>
        ) : (
          <button onClick={() => setMin(true)} title="Masquer" className="rounded p-1 hover:bg-hive-700">
            <X size={13} />
          </button>
        )}
      </div>
      {!min && (
        <div className="relative flex-1 bg-black">
          <video ref={attachVideo} autoPlay playsInline muted className="h-full w-full object-contain" />
          <div
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            title="Redimensionner"
            className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
          >
            <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-white/60" />
          </div>
        </div>
      )}
    </div>
  );
}
