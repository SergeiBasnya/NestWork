'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useMedia, type RemotePeerMedia } from '../../contexts/MediaContext';
import { useWorkspacePanels } from '../../contexts/WorkspaceDomains';
import { useAuthStore } from '../../stores/auth';

type ScreenPos = { userId: string; x: number; y: number };

function playWithUnlock(element: HTMLMediaElement): () => void {
  const events = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
  let done = false;
  const stop = () => { if (!done) { done = true; events.forEach((event) => document.removeEventListener(event, retry)); } };
  const retry = () => { void element.play().then(stop, () => undefined); };
  void element.play().then(stop, () => events.forEach((event) => document.addEventListener(event, retry)));
  return stop;
}

function initial(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

function useVideoStream(video: RefObject<HTMLVideoElement>, stream: MediaStream | null): void {
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const playableStream = stream?.getVideoTracks().length ? stream : null;
    element.srcObject = playableStream;
    if (playableStream) {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    return () => {
      element.pause();
      element.srcObject = null;
    };
  }, [stream, video]);
}

function SelfBubble({ stream, name, speaking, big, onToggle, wrapRef }: {
  stream: MediaStream | null; name: string; speaking: boolean; big: boolean; onToggle: () => void;
  wrapRef: (element: HTMLDivElement | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useVideoStream(video, stream);
  return (
    <div ref={wrapRef} className="absolute left-0 top-0" style={{ display: 'none' }}>
      <div className="-translate-x-1/2 -translate-y-full">
        <button onClick={onToggle} title={big ? 'Réduire' : 'Agrandir'} className={`pointer-events-auto relative block overflow-hidden border-2 bg-hive-900 shadow-lg transition-[width,height,border-radius] ${big ? 'h-[200px] w-[200px] rounded-2xl' : 'h-[60px] w-[60px] rounded-full'} ${speaking ? 'border-pollen' : 'border-white/70'}`}>
          <div className="absolute inset-0 flex items-center justify-center bg-honey text-xl font-bold text-hive-800">{initial(name)}</div>
          <video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        </button>
        {big && <div className="mt-1 text-center text-xs font-medium text-white drop-shadow">{name} (vous)</div>}
      </div>
    </div>
  );
}

function RemoteBubble({ peer, big, onToggleBig, onToggleMute, wrapRef }: {
  peer: RemotePeerMedia; big: boolean; onToggleBig: () => void; onToggleMute: () => void;
  wrapRef: (element: HTMLDivElement | null) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  useVideoStream(video, peer.stream);
  useEffect(() => {
    if (!audio.current) return;
    audio.current.srcObject = peer.stream;
    if (peer.stream) return playWithUnlock(audio.current);
  }, [peer.stream]);
  useEffect(() => { if (audio.current) audio.current.muted = peer.muted; }, [peer.muted]);
  return (
    <div ref={wrapRef} className="absolute left-0 top-0" style={{ display: 'none' }}>
      <audio ref={audio} autoPlay className="hidden" />
      <div className="-translate-x-1/2 -translate-y-full">
        <div className="relative inline-block">
          <button onClick={onToggleBig} title={big ? 'Réduire' : 'Agrandir'} className={`pointer-events-auto relative block overflow-hidden border-2 bg-hive-900 shadow-lg transition-[width,height,border-radius] ${big ? 'h-[200px] w-[200px] rounded-2xl' : 'h-[60px] w-[60px] rounded-full'} ${peer.speaking ? 'border-pollen' : 'border-white/70'}`}>
            <div className="absolute inset-0 flex items-center justify-center bg-hive-700 text-xl font-bold text-white">{initial(peer.name)}</div>
            <video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          </button>
          <button onClick={(event) => { event.stopPropagation(); onToggleMute(); }} title={peer.muted ? `Réactiver le son de ${peer.name}` : `Couper le son de ${peer.name}`} aria-label={peer.muted ? `Réactiver le son de ${peer.name}` : `Couper le son de ${peer.name}`} aria-pressed={peer.muted} className={`pointer-events-auto absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-hive-900 shadow-md ${peer.muted ? 'bg-red text-white' : 'bg-hive-700 text-white hover:bg-hive-600'}`}>
            {peer.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        </div>
        {big && <div className="mt-1 text-center text-xs font-medium text-white drop-shadow">{peer.name}</div>}
      </div>
    </div>
  );
}

export function AvatarVideos() {
  const { localStream, camOn, speaking, remotePeers, toggleRemoteMute } = useMedia();
  const myName = useAuthStore((state) => state.user?.name ?? 'Vous');
  const myId = useAuthStore((state) => state.user?.id ?? '');
  const { messagingOpen, mapsOpen } = useWorkspacePanels();
  const [selfBig, setSelfBig] = useState(false);
  const [bigPeers, setBigPeers] = useState<Set<string>>(() => new Set());
  const wraps = useRef(new Map<string, HTMLDivElement>());
  const rect = useRef<DOMRect | null>(null);
  const selfOn = camOn && !!localStream;
  const overlayClip = messagingOpen || mapsOpen
    ? `inset(0 ${mapsOpen ? 'min(360px, 90vw)' : '0px'} 0 ${messagingOpen ? 'min(40rem, 90vw)' : '0px'})`
    : undefined;

  useEffect(() => {
    const update = () => { rect.current = document.querySelector('canvas')?.getBoundingClientRect() ?? null; };
    update();
    window.addEventListener('resize', update);
    const interval = window.setInterval(update, 1_000);
    return () => { window.removeEventListener('resize', update); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const positions = (window as unknown as { __nwGetScreenPositions?: () => ScreenPos[] }).__nwGetScreenPositions?.() ?? [];
      const byId = new Map(positions.map((position) => [position.userId, position]));
      for (const [userId, element] of wraps.current) {
        const position = byId.get(userId);
        const canvas = rect.current;
        const visible = userId === myId ? selfOn : remotePeers.some((peer) => peer.id === userId);
        if (!position || !canvas || !visible) { element.style.display = 'none'; continue; }
        const big = userId === myId ? selfBig : bigPeers.has(userId);
        const size = big ? 200 : 60;
        const margin = size / 2 + 6;
        element.style.display = '';
        element.style.transform = `translate(${Math.max(margin, Math.min(canvas.width - margin, position.x))}px, ${Math.max(size + 6, Math.min(canvas.height - 6, position.y))}px)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bigPeers, myId, remotePeers, selfBig, selfOn]);

  useEffect(() => {
    const activeIds = new Set(remotePeers.map((peer) => peer.id));
    setBigPeers((current) => {
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [remotePeers]);

  const registerWrap = (id: string) => (element: HTMLDivElement | null) => {
    if (element) wraps.current.set(id, element); else wraps.current.delete(id);
  };
  const toggleBig = (id: string) => setBigPeers((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" style={{ clipPath: overlayClip }}>
      <SelfBubble stream={selfOn ? localStream : null} name={myName} speaking={speaking} big={selfBig} onToggle={() => setSelfBig((value) => !value)} wrapRef={registerWrap(myId)} />
      {remotePeers.map((peer) => (
        <RemoteBubble key={peer.id} peer={peer} big={bigPeers.has(peer.id)} onToggleBig={() => toggleBig(peer.id)} onToggleMute={() => toggleRemoteMute(peer.id)} wrapRef={registerWrap(peer.id)} />
      ))}
    </div>
  );
}
