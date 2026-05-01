import type { FurnitureCategory } from '../../furniture/types';

export interface PackEntryDescriptor {
  /** Local-to-pack id, e.g. 'bedDouble'. Must match what parseEntries returns. */
  id: string;
  name: string;
  category: FurnitureCategory;
  /** Path in the unzipped file map; install flow reads bytes from it. */
  glbPath: string;
}

export interface InstalledPackEntry {
  /** Globally-unique def id: `${packId}:${entryId}`. */
  id: string;
  packId: string;
  entryId: string;
  name: string;
  category: FurnitureCategory;
  footprint: { w: number; d: number; h: number };
  /** IDB key for the GLB blob in the existing `assets` store. */
  glbKey: string;
  /** IDB key for the thumbnail JPEG blob. */
  thumbKey: string;
}

export interface InstalledPack {
  packId: string;
  installedAt: string;
  entries: InstalledPackEntry[];
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  attribution: string;
  license: 'CC0';
  sourceUrl: string;
  /** Direct .zip URL the install flow fetches via the configured proxy. */
  downloadUrl: string;
  /** Approximate zip size in bytes — used for HEAD-validation and the install button label. */
  sizeBytes: number;
  /** Pure function: given the unzipped file map, returns the entries to register. */
  parseEntries: (files: Record<string, Uint8Array>) => PackEntryDescriptor[];
}
