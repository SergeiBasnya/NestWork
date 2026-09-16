'use client';

import { useState } from 'react';
import { Lock, LocateFixed, PanelLeftClose, RefreshCw, UserCog } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Logo } from '../Logo';
import { statusMeta } from '../../lib/status';
import { Avatar } from '../ui';
import { TeamManager } from './TeamManager';

export function MembersSidebar() {
  const user = useAuthStore((s) => s.user);
  const { membersOpen, setMembersOpen, workspace, members, onlineUserIds, connected, statusByUserId, dndByUserId, goToUser, refreshPresence, openDm, setActiveChannel, setMessagingOpen, refetchWorkspace } =
    useWorkspace();
  const [teamManagerOpen, setTeamManagerOpen] = useState(false);

  const myRole = members.find((member) => member.userId === user?.id)?.role;
  const canManageTeam = myRole === 'OWNER' || myRole === 'ADMIN';

  // Click a member → open (or create) the DM with them and reveal the panel.
  const messageMember = async (userId: string) => {
    const id = await openDm(userId);
    if (id) {
      setActiveChannel(id);
      setMessagingOpen(true);
    }
  };

  const isOnline = (userId: string) =>
    onlineUserIds.includes(userId) || (userId === user?.id && connected);

  const sorted = [...members].sort((a, b) => {
    const ao = isOnline(a.userId) ? 0 : 1;
    const bo = isOnline(b.userId) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.user.name.localeCompare(b.user.name);
  });
  const onlineCount = members.filter((m) => isOnline(m.userId)).length;

  if (!membersOpen) return null;

  return (
    <div className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel-bg)]">
      {/* Workspace header */}
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-start justify-between">
          <Logo size={26} />
          <button
            onClick={() => setMembersOpen(false)}
            title="Masquer le panneau"
            className="-mr-1 rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
          {workspace?.name && workspace.name !== 'NestWork' ? workspace.name : 'Espace privé'}
        </p>
      </div>

      {/* Online members */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          En ligne <span className="text-[var(--color-text-secondary)]">({onlineCount})</span>
          <button
            onClick={refreshPresence}
            title="Rafraîchir la présence"
            aria-label="Rafraîchir la présence"
            className="ml-auto rounded p-1 text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <ul className="space-y-1">
          {sorted.map((m) => {
            const online = isOnline(m.userId);
            const me = m.userId === user?.id;
            const meta = statusMeta(statusByUserId[m.userId]);
            const locked = online && !!dndByUserId[m.userId];
            return (
              <li
                key={m.id}
                className={`group flex items-center rounded-lg ${
                  online ? 'hover:bg-[var(--color-hover-bg)]' : 'opacity-50 hover:bg-[var(--color-hover-bg)]'
                }`}
              >
                {me ? (
                  <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
                    <Avatar name={m.user.name} size="md" statusDot={online ? meta.dot : 'bg-[var(--color-text-tertiary)]'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-sm text-[var(--color-text-primary)]">
                        <span className="truncate">{m.user.name}</span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">(vous)</span>
                        {locked && <Lock size={12} className="shrink-0 text-honey" />}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {!online ? 'Hors ligne' : locked ? 'Ne pas déranger' : meta.label}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => messageMember(m.userId)}
                    title={`Envoyer un message à ${m.user.name}`}
                    className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left"
                  >
                    <Avatar name={m.user.name} size="md" statusDot={online ? meta.dot : 'bg-[var(--color-text-tertiary)]'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-sm text-[var(--color-text-primary)]">
                        <span className="truncate">{m.user.name}</span>
                        {locked && <Lock size={12} className="shrink-0 text-honey" />}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {!online ? 'Hors ligne' : locked ? 'Ne pas déranger' : meta.label}
                      </div>
                    </div>
                  </button>
                )}
                {online && !me && (
                  <button
                    onClick={() => goToUser(m.userId)}
                    title={`Rejoindre ${m.user.name}`}
                    aria-label={`Rejoindre ${m.user.name}`}
                    className="mr-1 shrink-0 rounded-md p-1 text-[var(--color-text-tertiary)] opacity-0 transition hover:bg-[var(--color-active-bg)] hover:text-[var(--color-active-text)] group-hover:opacity-100"
                  >
                    <LocateFixed size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {canManageTeam && (
        <div className="border-t border-[var(--color-border)] p-3">
          <button
            type="button"
            onClick={() => setTeamManagerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-honey px-3 py-2 text-xs font-semibold text-hive-800 transition-colors hover:bg-honey-400"
          >
            <UserCog size={15} /> Gérer l’équipe
          </button>
        </div>
      )}
      {teamManagerOpen && workspace && user && myRole && (
        <TeamManager
          workspace={workspace}
          members={members}
          myUserId={user.id}
          myRole={myRole}
          onClose={() => setTeamManagerOpen(false)}
          onRefresh={refetchWorkspace}
        />
      )}
    </div>
  );
}
