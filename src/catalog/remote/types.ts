import type { FurnitureCategory } from '../../furniture/types'
import type { MaterialCategory } from '../../materials/types'

export type ProviderId = 'polyhaven' | 'ambientcg'
export type Resolution = '1k' | '2k' | '4k'
export const RESOLUTIONS: readonly Resolution[] = ['1k', '2k', '4k']

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
  /** Optional: does a CACHED index still match what this provider serves? The
   *  index cache lives for a week (`bootstrapRemoteCatalog`), which outlasts a
   *  transport change — entries written by an older build can point at URLs
   *  this provider can no longer fetch, and a card built from one loads
   *  forever. Return false to force a refetch instead of rendering them. */
  validateCached?(entries: RemoteEntry[]): boolean
}
