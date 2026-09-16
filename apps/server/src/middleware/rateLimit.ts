import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Invitation creation returns a high-value, single-use capability. Bound it
// per authenticated account while still allowing a full pilot team at once.
export const workspaceInviteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop d’invitations créées, réessaie plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? 'anon',
});

// Channel creation: per-user (auth runs first), generous but bounds spam.
export const channelCreateRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Trop de canaux créés, réessaie plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
  // Auth runs before this route, so userId is always present (no IP fallback —
  // express-rate-limit v8 rejects raw req.ip in custom key generators).
  keyGenerator: (req) => req.user?.userId ?? 'anon',
});

// Map saves may decode/hash an image and persist a large JSON snapshot. Bound
// that work per authenticated user without constraining lightweight reads.
export const mapSaveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Trop de cartes enregistrées, réessaie plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? 'anon',
});
