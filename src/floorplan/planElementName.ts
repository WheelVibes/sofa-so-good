/**
 * Display names for plan walls + openings. A user-set `name` always wins; absent
 * one, we synthesise a stable default from the element id so the inspector and
 * canvas always have something to show.
 *
 * Defaults (matching the product spec):
 *  - wall    → `Wall <6-digit hash>`
 *  - door    → `Door <6-digit hash>`
 *  - window  → `Window <6-digit hash>`
 *
 * The hash is derived deterministically from the id (not random per render) so a
 * wall keeps the same default name across reloads until the user renames it.
 * Room/auto-room allocation may later write a `<room> wall ##` name into `name`,
 * but only when the user hasn't set one — see the slice's allocation logic.
 *
 * Pure (no React/three) so it unit-tests in isolation.
 */
import type { PlanOpening, PlanWall } from './types'

/** A stable 6-digit string derived from an id (FNV-1a, mod 1e6, zero-padded). */
export function hash6(id: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return String((h >>> 0) % 1_000_000).padStart(6, '0')
}

export function defaultWallName(wall: Pick<PlanWall, 'id'>): string {
  return `Wall ${hash6(wall.id)}`
}

export function defaultOpeningName(o: Pick<PlanOpening, 'id' | 'kind'>): string {
  const kind = o.kind === 'door' ? 'Door' : 'Window'
  return `${kind} ${hash6(o.id)}`
}

/** A wall's display name: its custom name, else the generated default. */
export function wallDisplayName(wall: Pick<PlanWall, 'id' | 'name'>): string {
  return wall.name?.trim() || defaultWallName(wall)
}

/** An opening's display name: its custom name, else the generated default. */
export function openingDisplayName(o: Pick<PlanOpening, 'id' | 'kind' | 'name'>): string {
  return o.name?.trim() || defaultOpeningName(o)
}
