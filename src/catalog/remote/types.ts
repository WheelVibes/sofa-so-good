import type { FurnitureCategory } from '../../furniture/types'
import type { MaterialCategory } from '../../materials/types'

export type ProviderId = 'polyhaven' | 'ambientcg'
export type Resolution = '1k' | '2k' | '4k'
export const RESOLUTIONS: readonly Resolution[] = ['1k', '2k', '4k']

/** Map edge length in pixels per resolution tier — how much floor a download
 *  can cover sharply (`materials/tileSize.ts`). */
export const RESOLUTION_PIXELS: Record<Resolution, number> = {
  '1k': 1024,
  '2k': 2048,
  '4k': 4096,
}

export type RemoteKind = 'furniture' | 'material'

export interface RemoteEntry {
  provider: ProviderId
  slug: string
  kind: RemoteKind
  name: string
  category: FurnitureCategory | MaterialCategory
  thumbUrl: string
  resolutions: Resolution[]
  attribution: string
  sourceUrl: string
  /** Free-form keywords from the provider (Poly Haven `tags` + `categories`). */
  tags?: string[]
  /** Metres per texture period, when the provider knows the physical size of
   *  the scanned patch (ambientCG records `dimensionX` per asset; our packed
   *  manifest carries it through). Without this a scan renders at an arbitrary
   *  1 m tile — a 0.4 m wood patch stretched 2.5x, or a 2.45 m tile floor
   *  repeating 2.45x too often. */
  uvScale?: [number, number]
  bytesEstimate?: Partial<Record<Resolution, number>>
}

export type AssetBundle =
  | { kind: 'material'; channels: Record<string, Blob> }
  | {
      kind: 'furniture'
      gltfJson: object
      bin?: Blob
      textures: Record<string, Blob>
      rootPath: string
    }

export interface RemoteProvider {
  id: ProviderId
  fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]>
  fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob>
  fetchAsset(entry: RemoteEntry, resolution: Resolution, signal?: AbortSignal): Promise<AssetBundle>
  /** Optional: total download size (bytes) for an entry at a resolution, so the
   *  UI can warn before a large download. Returns null when unknown. Fetched
   *  lazily per visible card (not part of the bulk index). */
  fetchSize?(
    entry: RemoteEntry,
    resolution: Resolution,
    signal?: AbortSignal,
  ): Promise<number | null>
  /** Optional: the physical tile size the provider records for a slug, for
   *  callers whose `RemoteEntry` was synthesised rather than taken from the
   *  index — a persisted finish id (`<provider>:<slug>:<res>`) carries no size,
   *  and rehydrating one at boot must not fall back to a flat 1 m tile. */
  tileSizeFor?(slug: string): Promise<[number, number] | null>
  /** Optional: does a CACHED index still match what this provider serves? The
   *  index cache lives for a week (`bootstrapRemoteCatalog`), which outlasts a
   *  transport change — entries written by an older build can point at URLs
   *  this provider can no longer fetch, and a card built from one loads
   *  forever. Return false to force a refetch instead of rendering them. */
  validateCached?(entries: RemoteEntry[]): boolean
}
