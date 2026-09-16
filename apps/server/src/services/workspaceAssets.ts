import { z } from 'zod';
import {
  FURNITURE_DEPTH_MAX,
  FURNITURE_DEPTH_MIN,
  MAX_WORKSPACE_ASSET_BYTES,
  isWorkspaceAssetCatalogId,
  workspaceAssetIdFromCatalogId,
} from '@nestwork/shared';

const MAX_DATA_URL_CHARS = Math.ceil(MAX_WORKSPACE_ASSET_BYTES * 1.37) + 64;

export const workspaceAssetCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  source: z.enum(['CUSTOM', 'MODERN_INTERIORS']),
  kind: z.enum(['OBJECT', 'SHEET']),
  cols: z.number().int().min(1).max(128),
  rows: z.number().int().min(1).max(128),
  depth: z.number().finite().min(FURNITURE_DEPTH_MIN).max(FURNITURE_DEPTH_MAX),
  dataUrl: z.string().max(MAX_DATA_URL_CHARS),
  licenseAccepted: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.source === 'MODERN_INTERIORS' && value.licenseAccepted !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['licenseAccepted'],
      message: 'A valid Modern Interiors license must be confirmed',
    });
  }
});

export function hasSupportedWorkspaceAssetSignature(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

interface SnapshotFurniture {
  catalogId?: unknown;
}

export function workspaceAssetIdsInSnapshot(data: unknown): Set<string> {
  if (!data || typeof data !== 'object') return new Set();
  const furniture = (data as { furniture?: unknown }).furniture;
  if (!Array.isArray(furniture)) return new Set();
  const ids = new Set<string>();
  for (const entry of furniture as SnapshotFurniture[]) {
    if (typeof entry?.catalogId !== 'string' || !isWorkspaceAssetCatalogId(entry.catalogId)) continue;
    const id = workspaceAssetIdFromCatalogId(entry.catalogId);
    if (id) ids.add(id);
  }
  return ids;
}
