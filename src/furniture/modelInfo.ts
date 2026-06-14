/**
 * Catalog model metadata for the card tooltip (SweetHome3DJS `FurnitureTablePanel`
 * parity): the model's (uncompressed) byte size + its creator/licence, so a user
 * can weigh a heavy model against the memory budget and see attribution at a
 * glance. Pure + dependency-free so it unit-tests and can be read anywhere.
 */
import type { FurnitureDef } from './types'

/** Human-readable byte size (B / KB / MB), matching the remote-catalog formatter. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * A one-line "model info" string for a catalog card tooltip, or null when there's
 * nothing extra to show (e.g. a parametric primitive — generated geometry, no
 * download, no licence). Combines model size (when known) + licence + creator.
 */
export function modelInfoText(def: FurnitureDef): string | null {
  const parts: string[] = []
  // Byte size: user uploads carry `byteSize`; other GLB sources don't expose it
  // on the def (remote fetches it lazily in its own card; builtin has no manifest).
  if ('byteSize' in def && typeof def.byteSize === 'number' && def.byteSize > 0) {
    parts.push(formatBytes(def.byteSize))
  }
  if ('license' in def && def.license) parts.push(def.license)
  if ('attribution' in def && def.attribution) parts.push(def.attribution)
  return parts.length > 0 ? parts.join(' · ') : null
}
