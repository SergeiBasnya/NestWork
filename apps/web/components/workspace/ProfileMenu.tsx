'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Home, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useWorkspacePresence } from '../../contexts/WorkspaceDomains';
import { CHARACTER_NAMES, characterSpriteSpec, characterLabel, defaultCharacterFor } from '../../game/constants';
import { STATUSES } from '../../lib/status';

const DOWN_FRAME = 18; // first frame of the "down/front" idle animation

// Preview of a character (front-facing idle frame), drawn from the idle sheet.
function CharPreview({ name, size = 48 }: { name: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { frameWidth: FW, frameHeight: FH, idleFile } = characterSpriteSpec(name);
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const scale = size / FH;
      ctx.drawImage(img, DOWN_FRAME * FW, 0, FW, FH, (size - FW * scale) / 2, 0, FW * scale, FH * scale);
    };
    img.src = idleFile;
    return () => { img.onload = null; };
  }, [name, size]);
  return <canvas ref={canvasRef} width={size} height={size} />;
}

export function ProfileMenu({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setCharacter = useAuthStore((s) => s.setCharacter);
  const setName = useAuthStore((s) => s.setName);
  const { socket, statusByUserId, setMyStatus, myDesk, claimDesk, clearDesk } = useWorkspacePresence();
  const ref = useRef<HTMLDivElement>(null);
  const myStatus = user ? statusByUserId[user.id] ?? 'ONLINE' : 'ONLINE';
  const [draftName, setDraftName] = useState(user?.name ?? '');

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Clicking the avatar button itself toggles the menu — let it handle the
      // close, otherwise we'd close here then its onClick would reopen.
      if (target.closest?.('[data-profile-toggle]')) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  function choose(name: string) {
    setCharacter(name);
    socket?.emit('space:set-skin', { character: name });
  }

  function saveName() {
    const next = draftName.trim().slice(0, 24);
    if (!next || next === user?.name) return;
    setName(next);
    socket?.emit('space:set-name', { name: next });
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-1/2 z-30 mb-3 w-72 -translate-x-1/2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-bg)] p-4 shadow-xl"
    >
      {/* Identity */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] pb-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-honey text-lg font-bold text-hive-800">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveName();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={saveName}
              maxLength={24}
              placeholder="Ton pseudo"
              aria-label="Pseudo"
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-display font-bold text-[var(--color-text-primary)] hover:border-[var(--color-border)] focus:border-honey focus:bg-[var(--color-hover-bg)] focus:outline-none"
            />
            {draftName.trim() && draftName.trim() !== user?.name && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveName}
                title="Enregistrer le pseudo"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-honey text-hive-800 transition hover:opacity-90"
              >
                <Check size={14} />
              </button>
            )}
          </div>
          <div className="truncate px-1 text-xs text-[var(--color-text-tertiary)]">{user?.email}</div>
        </div>
      </div>

      {/* Status */}
      <div className="border-b border-[var(--color-border)] py-3">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Statut
        </span>
        <div className="flex gap-1.5">
          {STATUSES.map((s) => {
            const active = myStatus === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setMyStatus(s.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-honey bg-[var(--color-active-bg)] text-[var(--color-active-text)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)]'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* My desk: claim current spot as spawn */}
      <div className="border-b border-[var(--color-border)] py-3">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Mon bureau
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              claimDesk();
              onClose();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)]"
          >
            <Home size={14} />
            {myDesk ? 'Déplacer ici' : "C'est mon bureau ici"}
          </button>
          {myDesk && (
            <button
              onClick={() => {
                clearDesk();
                onClose();
              }}
              title="Oublier mon bureau"
              aria-label="Oublier mon bureau"
              className="flex items-center justify-center rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-hover-bg)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] text-[var(--color-text-tertiary)]">
          Tu réapparaîtras ici à chaque connexion.
        </p>
      </div>

      {/* Avatar picker */}
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Ton avatar
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{CHARACTER_NAMES.length} persos</span>
        </div>
        <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
          {CHARACTER_NAMES.map((name) => {
            const current = user?.character || (user ? defaultCharacterFor(user.id) : '');
            const active = current === name;
            return (
              <button
                key={name}
                onClick={() => choose(name)}
                title={characterLabel(name)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                  active ? 'border-honey bg-honey/10' : 'border-[var(--color-border)] hover:border-honey/50'
                }`}
              >
                <CharPreview name={name} />
                <span className="w-full truncate text-center text-[10px] text-[var(--color-text-secondary)]">
                  {characterLabel(name)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
