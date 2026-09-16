export interface RefreshUser {
  id: string;
  email: string;
}

interface RotationTransaction {
  inspect: (jti: string) => Promise<{
    userId: string;
    familyId: string | null;
    revokedAt: Date | null;
    expiresAt: Date;
  } | null>;
  consume: (input: { jti: string; userId: string; now: Date }) => Promise<number>;
  revokeFamily: (familyId: string, now: Date) => Promise<void>;
  findUser: (userId: string) => Promise<RefreshUser | null>;
  create: (input: { jti: string; userId: string; familyId: string; parentJti: string; expiresAt: Date }) => Promise<void>;
}

export interface RefreshRotationDependencies {
  transaction: <T>(operation: (transaction: RotationTransaction) => Promise<T>) => Promise<T>;
}

const CONCURRENT_ROTATION_GRACE_MS = 5_000;

export type RefreshRotationResult =
  | { status: 'rotated'; user: RefreshUser }
  | { status: 'concurrent' }
  | { status: 'invalid' };

export async function rotateRefreshToken(
  dependencies: RefreshRotationDependencies,
  input: { currentJti: string; userId: string; nextJti: string; nextExpiresAt: Date; now: Date },
): Promise<RefreshRotationResult> {
  return dependencies.transaction(async (transaction) => {
    const current = await transaction.inspect(input.currentJti);
    if (!current) return { status: 'invalid' };
    const familyId = current.familyId ?? input.currentJti;
    if (current.revokedAt) {
      const justRotated = input.now.getTime() - current.revokedAt.getTime() <= CONCURRENT_ROTATION_GRACE_MS;
      if (!justRotated) await transaction.revokeFamily(familyId, input.now);
      return { status: justRotated ? 'concurrent' : 'invalid' };
    }
    if (current.userId !== input.userId || current.expiresAt <= input.now) {
      await transaction.revokeFamily(familyId, input.now);
      return { status: 'invalid' };
    }
    // updateMany is the atomic compare-and-swap. Concurrent refreshes race here:
    // exactly one changes revokedAt from null and may mint the replacement row.
    const consumed = await transaction.consume({ jti: input.currentJti, userId: input.userId, now: input.now });
    if (consumed !== 1) {
      // A concurrent request may have inspected the active row before waiting on
      // the winner's UPDATE lock. Its CAS then loses, but that is not evidence of
      // a stolen-token replay: preserve the winner's successor during a short
      // transport/retry grace window. A later replay revokes the whole family.
      const latest = await transaction.inspect(input.currentJti);
      const justRotated = latest?.revokedAt
        && input.now.getTime() - latest.revokedAt.getTime() <= CONCURRENT_ROTATION_GRACE_MS;
      if (!justRotated) await transaction.revokeFamily(familyId, input.now);
      return { status: justRotated ? 'concurrent' : 'invalid' };
    }

    const user = await transaction.findUser(input.userId);
    if (!user) return { status: 'invalid' };
    await transaction.create({
      jti: input.nextJti,
      userId: user.id,
      familyId,
      parentJti: input.currentJti,
      expiresAt: input.nextExpiresAt,
    });
    return { status: 'rotated', user };
  });
}
