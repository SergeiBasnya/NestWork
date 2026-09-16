import type { MapApplyAck } from '@nestwork/shared';

interface ApplyMapWithBackupDependencies {
  createBackup: () => Promise<boolean>;
  applyMap: () => Promise<MapApplyAck>;
}

/**
 * The backup is a separate REST request, so it cannot share the server-side map
 * transaction. Enforce the client-side prerequisite explicitly: no successful
 * backup means no destructive socket command is sent.
 */
export async function applyMapWithBackup(dependencies: ApplyMapWithBackupDependencies): Promise<void> {
  const didCreateBackup = await dependencies.createBackup();
  if (!didCreateBackup) {
    throw new Error('La sauvegarde automatique a échoué. La carte n’a pas été modifiée.');
  }

  const result = await dependencies.applyMap();
  if (!result.ok) throw new Error(result.error);
}
