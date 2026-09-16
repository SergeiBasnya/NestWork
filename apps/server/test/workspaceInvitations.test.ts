import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canAssignInvitationRole,
  canChangeMemberRole,
  canManageInvitations,
  canRemoveMember,
  createInvitationToken,
  hashInvitationToken,
  invitationIsUsable,
  normalizeInviteEmail,
} from '../src/services/workspaceInvitations';

describe('workspace invitations', () => {
  test('normalizes email addresses before lookup or persistence', () => {
    assert.equal(normalizeInviteEmail('  Camille@Example.COM '), 'camille@example.com');
  });

  test('creates an opaque token while exposing only its stable digest for storage', () => {
    const first = createInvitationToken();
    const second = createInvitationToken();

    assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(first.tokenHash, hashInvitationToken(first.token));
    assert.notEqual(first.token, second.token);
    assert.notEqual(first.tokenHash, second.tokenHash);
  });

  test('rejects accepted, revoked, and expired invitations', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    const active = { expiresAt: new Date('2026-09-05T12:00:00.000Z'), acceptedAt: null, revokedAt: null };

    assert.equal(invitationIsUsable(active, now), true);
    assert.equal(invitationIsUsable({ ...active, acceptedAt: now }, now), false);
    assert.equal(invitationIsUsable({ ...active, revokedAt: now }, now), false);
    assert.equal(invitationIsUsable({ ...active, expiresAt: now }, now), false);
  });

  test('keeps role delegation below the actor privilege level', () => {
    assert.equal(canManageInvitations('OWNER'), true);
    assert.equal(canManageInvitations('ADMIN'), true);
    assert.equal(canManageInvitations('MEMBER'), false);
    assert.equal(canAssignInvitationRole('OWNER', 'ADMIN'), true);
    assert.equal(canAssignInvitationRole('ADMIN', 'ADMIN'), false);
    assert.equal(canAssignInvitationRole('ADMIN', 'MEMBER'), true);
    assert.equal(canAssignInvitationRole('OWNER', 'OWNER'), false);
  });

  test('reserves role changes for the owner without allowing ownership changes', () => {
    assert.equal(canChangeMemberRole('OWNER', 'MEMBER', 'ADMIN', false), true);
    assert.equal(canChangeMemberRole('OWNER', 'ADMIN', 'MEMBER', false), true);
    assert.equal(canChangeMemberRole('ADMIN', 'MEMBER', 'ADMIN', false), false);
    assert.equal(canChangeMemberRole('OWNER', 'OWNER', 'MEMBER', false), false);
    assert.equal(canChangeMemberRole('OWNER', 'MEMBER', 'OWNER', false), false);
    assert.equal(canChangeMemberRole('OWNER', 'MEMBER', 'ADMIN', true), false);
  });

  test('lets admins remove members but never owners, admins, or themselves', () => {
    assert.equal(canRemoveMember('OWNER', 'ADMIN', false), true);
    assert.equal(canRemoveMember('OWNER', 'MEMBER', false), true);
    assert.equal(canRemoveMember('ADMIN', 'MEMBER', false), true);
    assert.equal(canRemoveMember('ADMIN', 'ADMIN', false), false);
    assert.equal(canRemoveMember('ADMIN', 'OWNER', false), false);
    assert.equal(canRemoveMember('OWNER', 'MEMBER', true), false);
  });
});
