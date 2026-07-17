import type { FurnitureCategory } from '../../furniture/types'

export interface PackEntryDescriptor {
  /** Local-to-pack id, e.g. 'bedDouble'. Must match what parseEntries returns. */
  id: string
  name: string
  category: FurnitureCategory
  /** Path in the unzipped file map; install flow reads bytes from it. */
  glbPath: string
}

export interface InstalledPackEntry {
  /** Globally-unique def id: `${packId}:${entryId}`. */
  id: string
  packId: string
  entryId: string
  name: string
  category: FurnitureCategory
  /** Render-time multiplier applied to the raw GLB. `footprint` already
   *  includes this multiplier; the value is persisted so collision and
   *  rendering stay in sync without re-deriving on every read. */
  scale: number
  /** Scaled footprint = raw GLB bounding box × `scale`. */
  footprint: { w: number; d: number; h: number }
  /** IDB key for the GLB blob in the existing `assets` store. */
  glbKey: string
  /** IDB key for the thumbnail JPEG blob. */
  thumbKey: string
  /** Per-entry attribution. Most packs share one attribution (the pack's), but
   *  API-sourced packs (Poly Pizza) credit a different author per model — this
   *  overrides the pack-level attribution when present. */
  attribution?: string
  /** Per-entry licence — `'CC-BY'` items (e.g. some Poly Pizza models) require
   *  attribution. Defaults to the pack licence (`'CC0'`) when absent. */
  license?: 'CC0' | 'CC-BY'
  /** Per-entry source page URL (the model's page on the provider). */
  sourceUrl?: string
}

export interface InstalledPack {
  packId: string
  installedAt: string
  entries: InstalledPackEntry[]
}

export interface Pack {
  id: string
  /** 'zip' = fetch a hosted archive (default install flow); 'ikea-live' =
   *  drive the local scraper sidecar; 'poly-pizza' = fetch GLBs on demand from
   *  the Poly Pizza API (user-supplied key, in-browser, CORS-friendly);
   *  'poly-haven-bundle' = a curated CC0 set-dressing bundle fetched from the
   *  keyless Poly Haven API and packed into self-contained GLBs in-browser (see
   *  `polyHaven.ts`); 'manual' = a link-out card for sources with no
   *  programmatic/CORS download (the user downloads by hand and imports via the
   *  Upload dialog). */
  kind?: 'zip' | 'ikea-live' | 'poly-pizza' | 'poly-haven-bundle' | 'manual'
  /** What the source provides — drives the import hint on `manual` cards
   *  (furniture → Upload model dialog; material → Upload material dialog).
   *  Defaults to 'furniture'. */
  assetType?: 'furniture' | 'material'
  name: string
  description: string
  attribution: string
  license: 'CC0' | 'CC-BY'
  sourceUrl: string
  /** Direct .zip URL the install flow fetches via the configured proxy. */
  downloadUrl?: string
  /** Approximate zip size in bytes — used for HEAD-validation and the install button label. */
  sizeBytes?: number
  /** Pure function: given the unzipped file map, returns the entries to register. */
  parseEntries?: (files: Record<string, Uint8Array>) => PackEntryDescriptor[]
  /** Hidden from production builds (only shown when `import.meta.env.DEV`).
   *  Used for packs that depend on a dev-only proxy/sidecar (Kenney, ikea-live)
   *  or are non-programmatic manual link-outs. */
  devOnly?: boolean
}
