'use client';

import { useAuthStore } from '../../stores/auth';
import { useWorkspacePresence } from '../../contexts/WorkspaceDomains';
import { Avatar } from '../ui';

export function BottomStatusBar() {
  const user = useAuthStore((s) => s.user);
  const { connected, currentRoomName } = useWorkspacePresence();

  return (
    <div className="flex h-12 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4">
      {/* Gauche : avatar + nom + statut */}
      <div className="flex items-center gap-2">
        <Avatar name={user?.name} size="sm" dotRingClass="border-[var(--color-surface-secondary)]" />
        <span className="text-sm text-[var(--color-text-primary)]">{user?.name}</span>
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-green' : 'bg-red'}`} title={connected ? 'Connecté' : 'Déconnecté'} />
      </div>

      {/* Droite : salle actuelle + aide */}
      <div className="flex items-center gap-3">
        {currentRoomName && (
          <span className="rounded-full bg-[var(--color-active-bg)] px-3 py-1 text-xs font-medium text-[var(--color-active-text)]">
            {currentRoomName}
          </span>
        )}
      </div>
    </div>
  );
}
