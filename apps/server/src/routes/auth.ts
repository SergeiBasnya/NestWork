import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { compare, hash } from 'bcryptjs';
import type { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthPayload } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { asyncHandler } from '../middleware/errors';
import { rotateRefreshToken } from '../services/refreshRotation';
import { hashInvitationToken, invitationIsUsable } from '../services/workspaceInvitations';

const router: Router = Router();

// ─── Validation schemas ──────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const acceptInvitationSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères').max(60),
  password: z.string().min(12, 'Le mot de passe doit contenir au moins 12 caractères').max(128),
});

// ─── Token helpers ───────────────────────────────────────

const REFRESH_TTL_DAYS = 7;
const REFRESH_COOKIE = 'refreshToken';
const isProd = process.env.NODE_ENV === 'production';
const configuredSameSite = process.env.REFRESH_COOKIE_SAME_SITE?.toLowerCase();
const refreshCookieSameSite: 'lax' | 'strict' | 'none' =
  configuredSameSite === 'strict' || configuredSameSite === 'none' ? configuredSameSite : 'lax';
let refreshTokenPurgeRunning = false;

function maybePurgeStaleRefreshTokens(): void {
  // Opportunistic and bounded: no scheduler/infra, at most one 100-row delete
  // per process at a time and roughly one attempt every 64 token issues.
  if (refreshTokenPurgeRunning || Math.random() >= 1 / 64) return;
  refreshTokenPurgeRunning = true;
  const revokedBefore = new Date(Date.now() - REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  void prisma.$executeRaw`
    DELETE FROM "RefreshToken"
    WHERE id IN (
      SELECT id FROM "RefreshToken"
      WHERE "expiresAt" < NOW()
         OR ("revokedAt" IS NOT NULL AND "revokedAt" < ${revokedBefore})
      ORDER BY "createdAt" ASC
      LIMIT 100
    )
  `.catch((error: unknown) => {
    console.error('[auth] refresh-token purge failed:', error instanceof Error ? error.message : error);
  }).finally(() => {
    refreshTokenPurgeRunning = false;
  });
}

// The refresh token (7-day, high value) lives in an HttpOnly cookie — out of
// JS reach, so XSS can't steal it. Front and API share the registrable domain
// nestwork.site, so the request is same-site: SameSite=Lax is enough (and isn't
// subject to the third-party-cookie phase-out, unlike SameSite=None). On
// localhost dev (same-site, http) Lax works too, without Secure.
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: refreshCookieSameSite,
    path: '/api/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}
function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: refreshCookieSameSite,
    path: '/api/auth',
  });
}

// Issue an access token + a refresh token persisted by its jti (for rotation
// and reuse detection).
function signTokens(payload: AuthPayload, jti: string) {
  const accessTtl = process.env.ACCESS_TTL || '15m';
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: accessTtl } as jwt.SignOptions);
  const refreshToken = jwt.sign(
    { userId: payload.userId, type: 'refresh', jti },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: `${REFRESH_TTL_DAYS}d` },
  );
  return { accessToken, refreshToken };
}

async function issueTokens(payload: AuthPayload) {
  const jti = randomUUID();
  const tokens = signTokens(payload, jti);
  await prisma.refreshToken.create({
    data: {
      jti,
      familyId: jti,
      userId: payload.userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  maybePurgeStaleRefreshTokens();
  return tokens;
}

// ─── Routes ──────────────────────────────────────────────
// Public registration stays disabled. Accounts are created only from a valid,
// single-use workspace invitation during the managed pilot.

// GET /api/auth/invitations/:token — validate a capability before showing the form.
router.get('/invitations/:token', asyncHandler(async (req: Request, res: Response) => {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(req.params.token) },
    select: {
      email: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });
  if (!invitation || !invitationIsUsable(invitation)) {
    res.status(404).json({ error: 'Invitation invalide ou expirée' });
    return;
  }

  res.json({
    invitation: {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      workspace: invitation.workspace,
    },
  });
}));

// POST /api/auth/invitations/:token/accept — create or authenticate the account and join.
router.post('/invitations/:token/accept', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = acceptInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const tokenHash = hashInvitationToken(req.params.token);
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash },
    include: { workspace: { select: { slug: true } } },
  });
  const now = new Date();
  if (!invitation || !invitationIsUsable(invitation, now)) {
    res.status(404).json({ error: 'Invitation invalide ou expirée' });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existingUser && !(await compare(parsed.data.password, existingUser.passwordHash))) {
    res.status(401).json({ error: 'Ce compte existe déjà : utilise son mot de passe actuel' });
    return;
  }
  const passwordHash = existingUser ? null : await hash(parsed.data.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const consumed = await tx.workspaceInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (consumed.count !== 1) {
      const error = new Error('Cette invitation a déjà été utilisée');
      Object.assign(error, { status: 409 });
      throw error;
    }

    const acceptedUser = existingUser ?? await tx.user.create({
      data: {
        email: invitation.email,
        name: parsed.data.name,
        passwordHash: passwordHash!,
      },
    });
    await tx.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: acceptedUser.id,
          workspaceId: invitation.workspaceId,
        },
      },
      update: {},
      create: {
        userId: acceptedUser.id,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
    });
    return acceptedUser;
  });

  const tokens = await issueTokens({ userId: user.id, email: user.email });
  const io = req.app.get('io') as Server | undefined;
  io?.to(`ws:${invitation.workspace.slug}`).emit('workspace:members-changed');
  setRefreshCookie(res, tokens.refreshToken);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      character: user.character,
      status: user.status,
    },
    accessToken: tokens.accessToken,
    workspace: invitation.workspace,
  });
}));

// POST /api/auth/login
router.post('/login', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const tokens = await issueTokens({ userId: user.id, email: user.email });
  setRefreshCookie(res, tokens.refreshToken); // refresh token → HttpOnly cookie, not the body

  res.json({
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, character: user.character, status: user.status },
    accessToken: tokens.accessToken,
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  // Refresh credentials are accepted only through the HttpOnly cookie.
  const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: 'Missing refresh token' });
    return;
  }

  let payload: { userId: string; type: string; jti?: string };
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as typeof payload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }
  if (payload.type !== 'refresh' || !payload.jti) {
    res.status(401).json({ error: 'Invalid token type' });
    return;
  }

  const now = new Date();
  const nextJti = randomUUID();
  const nextExpiresAt = new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const rotation = await rotateRefreshToken({
    transaction: (operation) => prisma.$transaction((tx) => operation({
      inspect: (jti) => tx.refreshToken.findUnique({
        where: { jti },
        select: { userId: true, familyId: true, revokedAt: true, expiresAt: true },
      }),
      consume: async ({ jti, userId, now: consumedAt }) => {
        const result = await tx.refreshToken.updateMany({
          where: { jti, userId, revokedAt: null, expiresAt: { gt: consumedAt } },
          data: { revokedAt: consumedAt },
        });
        return result.count;
      },
      revokeFamily: async (familyId, revokedAt) => {
        await tx.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt } });
      },
      findUser: (userId) => tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
      create: async (input) => { await tx.refreshToken.create({ data: input }); },
    })),
  }, {
    currentJti: payload.jti,
    userId: payload.userId,
    nextJti,
    nextExpiresAt,
    now,
  });

  if (rotation.status === 'concurrent') {
    // Another tab/request rotated the same browser cookie. Do not expire the
    // winner's Set-Cookie response; the client retries once with the new cookie.
    res.setHeader('Retry-After', '1');
    res.status(409).json({ error: 'Refresh already in progress' });
    return;
  }
  if (rotation.status === 'invalid') {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'Token is invalid, expired, or already consumed' });
    return;
  }

  const tokens = signTokens({ userId: rotation.user.id, email: rotation.user.email }, nextJti);
  maybePurgeStaleRefreshTokens();
  setRefreshCookie(res, tokens.refreshToken); // rotate the cookie
  res.json({ accessToken: tokens.accessToken });
}));

// POST /api/auth/logout — revoke the refresh token + clear the cookie
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { jti?: string };
      if (p.jti) {
        await prisma.refreshToken
          .updateMany({ where: { jti: p.jti, revokedAt: null }, data: { revokedAt: new Date() } })
          .catch(() => null);
      }
    } catch {
      /* ignore — clear the cookie regardless */
    }
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
}));

// GET /api/auth/me
router.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, avatarUrl: true, character: true, status: true, createdAt: true },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
}));

export default router;
