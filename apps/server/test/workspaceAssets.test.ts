import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isWorkspaceAssetCatalogId,
  workspaceAssetCatalogKey,
  workspaceAssetIdFromCatalogId,
} from '@nestwork/shared';
import {
  hasSupportedWorkspaceAssetSignature,
  workspaceAssetCreateSchema,
  workspaceAssetIdsInSnapshot,
} from '../src/services/workspaceAssets';

const assetId = 'cm1234567890abcd';

function validPayload() {
  return {
    name: 'Canapé bleu',
    source: 'CUSTOM' as const,
    kind: 'OBJECT' as const,
    cols: 2,
    rows: 1,
    depth: 3,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };
}

describe('private workspace assets', () => {
  test('requires an explicit license attestation for Modern Interiors', () => {
    const missing = workspaceAssetCreateSchema.safeParse({
      ...validPayload(),
      source: 'MODERN_INTERIORS',
      kind: 'SHEET',
    });
    assert.equal(missing.success, false);

    const confirmed = workspaceAssetCreateSchema.safeParse({
      ...validPayload(),
      source: 'MODERN_INTERIORS',
      kind: 'SHEET',
      licenseAccepted: true,
    });
    assert.equal(confirmed.success, true);
  });

  test('accepts only real PNG and WebP signatures', () => {
    assert.equal(hasSupportedWorkspaceAssetSignature('image/png', Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])), true);
    assert.equal(hasSupportedWorkspaceAssetSignature('image/webp', Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ])), true);
    assert.equal(hasSupportedWorkspaceAssetSignature('image/png', Uint8Array.from([1, 2, 3])), false);
    assert.equal(hasSupportedWorkspaceAssetSignature('image/jpeg', Uint8Array.from([0xff, 0xd8])), false);
  });

  test('round-trips catalog ids and finds private assets in saved maps', () => {
    const key = workspaceAssetCatalogKey(assetId);
    const catalogId = `${key}_2_3_4x2`;
    assert.equal(workspaceAssetIdFromCatalogId(catalogId), assetId);
    assert.equal(isWorkspaceAssetCatalogId(catalogId), true);
    assert.equal(workspaceAssetIdFromCatalogId('nw-office_0_0_1x1'), null);

    assert.deepEqual(
      [...workspaceAssetIdsInSnapshot({
        furniture: [
          { catalogId },
          { catalogId: `${key}_0_0_1x1` },
          { catalogId: 'nw-office_0_0_1x1' },
          { catalogId: null },
        ],
      })],
      [assetId],
    );
    assert.deepEqual([...workspaceAssetIdsInSnapshot({ furniture: 'invalid' })], []);
  });
});
