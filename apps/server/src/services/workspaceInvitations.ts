import { createHash, randomBytes } from 'node:crypto';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface InvitationState {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function invitationIsUsable(invitation: InvitationState, now = new Date()): boolean {
  return invitation.acceptedAt === null
    && invitation.revokedAt === null
    && invitation.expiresAt.getTime() > now.getTime();
}

export function canManageInvitations(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

export function canAssignInvitationRole(actorRole: WorkspaceRole, invitedRole: WorkspaceRole): boolean {
  if (invitedRole === 'OWNER') return false;
  return actorRole === 'OWNER' || (actorRole === 'ADMIN' && invitedRole === 'MEMBER');
}

export function canChangeMemberRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
  isSelf: boolean,
): boolean {
  return actorRole === 'OWNER'
    && targetRole !== 'OWNER'
    && nextRole !== 'OWNER'
    && !isSelf;
}

export function canRemoveMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  isSelf: boolean,
): boolean {
  if (isSelf || targetRole === 'OWNER') return false;
  return actorRole === 'OWNER' || (actorRole === 'ADMIN' && targetRole === 'MEMBER');
}
