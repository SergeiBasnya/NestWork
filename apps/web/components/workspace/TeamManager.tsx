'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Check, Copy, Mail, Shield, Trash2, UserPlus, X } from 'lucide-react';
import type { Member, WorkspaceDetail } from '../../contexts/WorkspaceDomains';
import { api } from '../../lib/api';
import { Avatar } from '../ui';

interface PendingInvitation {
  id: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  expiresAt: string;
}

interface TeamManagerProps {
  workspace: WorkspaceDetail;
  members: Member[];
  myUserId: string;
  myRole: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  return (isAxiosError<{ error?: string }>(error) ? error.response?.data?.error : undefined) || fallback;
}

function roleLabel(role: string): string {
  if (role === 'OWNER') return 'Propriétaire';
  if (role === 'ADMIN') return 'Administrateur';
  return 'Membre';
}

export function TeamManager({ workspace, members, myUserId, myRole, onClose, onRefresh }: TeamManagerProps) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    api.get(`/workspaces/${workspace.slug}/invitations`)
      .then(({ data }) => {
        if (active) setInvitations(data.invitations);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestErrorMessage(requestError, 'Impossible de charger les invitations'));
      })
      .finally(() => {
        if (active) setLoadingInvitations(false);
      });
    return () => { active = false; };
  }, [workspace.slug]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setCopied(false);
    setSubmittingInvite(true);
    try {
      const { data } = await api.post(`/workspaces/${workspace.slug}/invitations`, { email, role });
      const invitation = data.invitation as PendingInvitation & { token: string };
      setInvitations((current) => [invitation, ...current.filter((item) => item.email !== invitation.email)]);
      setInviteLink(`${window.location.origin}/join/${invitation.token}`);
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Impossible de créer cette invitation'));
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setError('La copie automatique a échoué. Sélectionne le lien manuellement.');
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusyId(invitationId);
    setError('');
    try {
      await api.delete(`/workspaces/${workspace.slug}/invitations/${invitationId}`);
      setInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Impossible de révoquer cette invitation'));
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(member: Member, nextRole: 'ADMIN' | 'MEMBER') {
    if (member.role === nextRole) return;
    setBusyId(member.id);
    setError('');
    try {
      await api.patch(`/workspaces/${workspace.slug}/members/${member.id}`, { role: nextRole });
      await onRefresh();
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Impossible de modifier ce rôle'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(member: Member) {
    if (confirmRemoveId !== member.id) {
      setConfirmRemoveId(member.id);
      return;
    }
    setBusyId(member.id);
    setError('');
    try {
      await api.delete(`/workspaces/${workspace.slug}/members/${member.id}`);
      setConfirmRemoveId(null);
      await onRefresh();
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Impossible de retirer ce membre'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-hive-900/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="team-manager-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-da-xl border border-[var(--color-border)] bg-[var(--color-panel-bg)] shadow-warm-xl">
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-honey-700">Administration</p>
            <h2 id="team-manager-title" className="mt-1 font-display text-2xl font-extrabold text-[var(--color-text-primary)]">Équipe · {workspace.name}</h2>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{members.length} membre{members.length > 1 ? 's' : ''} · pilote limité à 12 personnes</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la gestion d’équipe" className="rounded-lg p-2 text-[var(--color-text-tertiary)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-primary)]"><X size={19} /></button>
        </header>

        <div className="overflow-y-auto p-6">
          {error && <p role="alert" className="mb-5 rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

          <section aria-labelledby="invite-title" className="rounded-da-lg border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4">
            <div className="flex items-center gap-2">
              <UserPlus size={17} className="text-honey-700" />
              <h3 id="invite-title" className="font-display font-bold text-[var(--color-text-primary)]">Inviter une personne</h3>
            </div>
            <form onSubmit={createInvitation} className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
              <label className="sr-only" htmlFor="team-invite-email">Adresse e-mail</label>
              <input id="team-invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="prenom@entreprise.com" className="min-w-0 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-honey" />
              {myRole === 'OWNER' ? (
                <select aria-label="Rôle de la personne invitée" value={role} onChange={(event) => setRole(event.target.value as 'ADMIN' | 'MEMBER')} className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-honey">
                  <option value="MEMBER">Membre</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              ) : <span className="flex items-center rounded-lg border border-[var(--color-border)] px-3 text-xs text-[var(--color-text-secondary)]">Membre</span>}
              <button disabled={submittingInvite} className="rounded-lg bg-honey px-4 py-2.5 text-sm font-semibold text-hive-800 hover:bg-honey-400 disabled:opacity-50">{submittingInvite ? 'Création…' : 'Créer le lien'}</button>
            </form>
            {inviteLink && (
              <div className="mt-4 rounded-lg border border-honey-300 bg-honey-50 p-3">
                <p className="text-xs font-medium text-honey-900">Lien créé pour {email}</p>
                <div className="mt-2 flex gap-2">
                  <input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} aria-label="Lien d’invitation" className="min-w-0 flex-1 rounded-md border border-honey-300 bg-white px-2.5 py-2 font-mono text-[10px] text-hive-700" />
                  <button type="button" onClick={copyInvitation} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-hive-700 px-3 text-xs font-semibold text-white">{copied ? <><Check size={14} /> Copié</> : <><Copy size={14} /> Copier</>}</button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="members-title" className="mt-7">
            <h3 id="members-title" className="font-display text-lg font-bold text-[var(--color-text-primary)]">Membres actifs</h3>
            <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-da-lg border border-[var(--color-border)]">
              {members.map((member) => {
                const isMe = member.userId === myUserId;
                const canChangeRole = myRole === 'OWNER' && member.role !== 'OWNER' && !isMe;
                const canRemove = !isMe && member.role !== 'OWNER' && (myRole === 'OWNER' || (myRole === 'ADMIN' && member.role === 'MEMBER'));
                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Avatar name={member.user.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{member.user.name}{isMe ? ' (vous)' : ''}</p>
                      <p className="truncate text-xs text-[var(--color-text-tertiary)]">{member.user.email}</p>
                    </div>
                    {canChangeRole ? (
                      <select aria-label={`Rôle de ${member.user.name}`} disabled={busyId === member.id} value={member.role} onChange={(event) => void changeRole(member, event.target.value as 'ADMIN' | 'MEMBER')} className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-2.5 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:border-honey disabled:opacity-50">
                        <option value="MEMBER">Membre</option>
                        <option value="ADMIN">Administrateur</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-text-secondary)]"><Shield size={11} /> {roleLabel(member.role)}</span>
                    )}
                    {canRemove && (
                      <button type="button" disabled={busyId === member.id} onClick={() => void removeMember(member)} onBlur={() => { if (confirmRemoveId === member.id) setConfirmRemoveId(null); }} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold disabled:opacity-50 ${confirmRemoveId === member.id ? 'bg-error text-white' : 'text-error-700 hover:bg-error-50'}`}>
                        <Trash2 size={14} /> {confirmRemoveId === member.id ? 'Confirmer' : 'Retirer'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="pending-title" className="mt-7">
            <h3 id="pending-title" className="font-display text-lg font-bold text-[var(--color-text-primary)]">Invitations en attente</h3>
            {loadingInvitations ? (
              <p className="mt-3 font-mono text-xs text-[var(--color-text-tertiary)]">Chargement…</p>
            ) : invitations.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-tertiary)]">Aucune invitation en attente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-da-lg border border-[var(--color-border)]">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                    <Mail size={16} className="shrink-0 text-[var(--color-text-tertiary)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{invitation.email}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">{roleLabel(invitation.role)} · expire le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(invitation.expiresAt))}</p>
                    </div>
                    <button type="button" disabled={busyId === invitation.id} onClick={() => void revokeInvitation(invitation.id)} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-error-700 hover:bg-error-50 disabled:opacity-50">Révoquer</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
