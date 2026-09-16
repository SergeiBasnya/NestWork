export type AssetLibraryMode = 'original' | 'full';

// The repository-safe default only exposes assets created for NestWork.
// Private deployments that own the optional commercial pack can opt in at
// build time without changing the builder or persisted catalog identifiers.
export const ASSET_LIBRARY_MODE: AssetLibraryMode =
  process.env.NEXT_PUBLIC_ASSET_LIBRARY === 'full' ? 'full' : 'original';

export const LICENSED_ASSETS_ENABLED = ASSET_LIBRARY_MODE === 'full';
