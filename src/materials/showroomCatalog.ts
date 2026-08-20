/**
 * Showroom finishes (SHOWROOM-FINISHES) — a hand-curated shortlist of
 * photo-scanned CC0 PBR materials (Poly Haven), surfaced as a one-tap strip in
 * the FinishPicker so photoreal finishes are part of the core design loop
 * instead of buried in the Pro-only pack browser. This is the "curated material
 * library" pattern every photoreal reference product (Coohom, Planner 5D,
 * HomeByMe) leads with: real scanned albedo + normal + roughness (+ AO) map
 * sets beat any procedural bake for showroom/sample-board fidelity.
 *
 * Pure data + string helpers — no three.js, no React, no store — so the
 * curation and the finish-id round-trip are unit-testable. The actual download
 * rides the existing remote-catalog infrastructure (`resolveRemoteAsset` →
 * Poly Haven CORS-direct fetch → IndexedDB cache → `TexturedMaterialDef`), so
 * everything here ships prod-safe (CC0, no proxy).
 *
 * Curation rules:
 *  - Poly Haven only (CORS-direct in production; ambientCG needs the dev proxy).
 *  - Interior-plausible finishes with full PBR map sets.
 *  - `uvScale` is the physical metres-per-tile the texture reads best at on the
 *    world-UV surfaces (same convention as `builtinCatalog`).
 *  - `swatch` approximates the asset's mean albedo tone (picker chip + the tile
 *    colour while the photo thumb streams in).
 * A dead/renamed slug degrades gracefully: its CDN thumbnail 404s (the strip
 * hides that chip) and a resolve failure surfaces the standard error toast.
 */

import type { RemoteEntry, Resolution } from '../catalog/remote/types'
import type { MaterialCategory } from './types'

export interface ShowroomFinish {
  /** Poly Haven asset slug (`polyhaven.com/a/<slug>`). */
  slug: string
  /** Honest display name (what the scan actually looks like). */
  name: string
  category: MaterialCategory
  /** Mean albedo tone — chip colour while the photo thumbnail loads. */
  swatch: string
  /** Physical metres per texture tile on the world-UV surfaces. */
  uvScale: [number, number]
}

/** Resolution the one-tap strip streams at — 1K keeps a tap snappy (~1 MB for
 *  a full map set) and reads clean at room scale; the Pro pack browser still
 *  offers 2K/4K of the same assets. */
export const SHOWROOM_RESOLUTION: Resolution = '1k'

/** Ordered curated list (floors first, then walls; most-reached-for first). */
export const SHOWROOM_FINISHES: ShowroomFinish[] = [
  // ── Floors ────────────────────────────────────────────────────────────────
  {
    slug: 'wood_floor',
    name: 'Rustic timber boards',
    category: 'floor',
    swatch: '#816043',
    uvScale: [1.5, 1.5],
  },
  {
    slug: 'wood_floor_deck',
    name: 'Seasoned oak decking',
    category: 'floor',
    swatch: '#6f350e',
    uvScale: [1.5, 1.5],
  },
  {
    slug: 'wood_floor_worn',
    name: 'Worn walnut boards',
    category: 'floor',
    swatch: '#8a592f',
    uvScale: [1.5, 1.5],
  },
  {
    slug: 'brown_planks_03',
    name: 'Coffee oak planks',
    category: 'floor',
    swatch: '#6c645a',
    uvScale: [1.5, 1.5],
  },
  {
    slug: 'laminate_floor_02',
    name: 'Pale laminate',
    category: 'floor',
    swatch: '#c8b39a',
    uvScale: [1.6, 1.6],
  },
  {
    slug: 'marble_01',
    name: 'Cream marble slab',
    category: 'floor',
    swatch: '#b29d7a',
    uvScale: [1, 1],
  },
  {
    slug: 'floor_tiles_06',
    name: 'Slate floor tiles',
    category: 'floor',
    swatch: '#7a706c',
    uvScale: [1.2, 1.2],
  },
  {
    slug: 'square_tiles_03',
    name: 'Vintage ceramic tiles',
    category: 'floor',
    swatch: '#6e6156',
    uvScale: [0.6, 0.6],
  },
  {
    slug: 'concrete_floor_02',
    name: 'Polished screed',
    category: 'floor',
    swatch: '#786f5b',
    uvScale: [2.2, 2.2],
  },
  // ── Walls ─────────────────────────────────────────────────────────────────
  {
    slug: 'plastered_wall_02',
    name: 'Hand-skimmed plaster',
    category: 'wall',
    swatch: '#bbb2a3',
    uvScale: [2, 2],
  },
  {
    slug: 'beige_wall_001',
    name: 'Warm painted render',
    category: 'wall',
    swatch: '#9e8c78',
    uvScale: [2, 2],
  },
  {
    slug: 'painted_plaster_wall',
    name: 'Painted plaster',
    category: 'wall',
    swatch: '#b5aca0',
    uvScale: [2, 2],
  },
  {
    slug: 'concrete_wall_007',
    name: 'Raw concrete wall',
    category: 'wall',
    swatch: '#8b836e',
    uvScale: [2, 2],
  },
  {
    slug: 'stone_brick_wall_001',
    name: 'Rustic stone brick',
    category: 'wall',
    swatch: '#4e4230',
    uvScale: [1.5, 1.5],
  },
  {
    slug: 'leather_white',
    name: 'Ivory leather panel',
    category: 'wall',
    swatch: '#969380',
    uvScale: [1, 1],
  },
]

const BY_SLUG = new Map(SHOWROOM_FINISHES.map((f) => [f.slug, f]))

/** Curated entry for a Poly Haven slug, or `null` when the slug isn't in the
 *  showroom list (a generic pack-browser download). */
export function showroomFinishFor(slug: string): ShowroomFinish | null {
  return BY_SLUG.get(slug) ?? null
}

/** Showroom finishes for one picker surface, in curated order. */
export function showroomFinishes(category: MaterialCategory): ShowroomFinish[] {
  return SHOWROOM_FINISHES.filter((f) => f.category === category)
}

const CDN_THUMB = (slug: string) =>
  `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png?height=96`

/** Synthesize the `RemoteEntry` a showroom finish resolves through — the same
 *  shape `fetchIndex` would return for it, so `resolveRemoteAsset` (fetch +
 *  IDB cache + def build) needs no new code path. */
export function showroomEntry(f: ShowroomFinish): RemoteEntry {
  return {
    provider: 'polyhaven',
    slug: f.slug,
    kind: 'material',
    name: f.name,
    category: f.category,
    thumbUrl: CDN_THUMB(f.slug),
    resolutions: ['1k', '2k', '4k'],
    attribution: 'Poly Haven (CC0)',
    sourceUrl: `https://polyhaven.com/a/${f.slug}`,
  }
}

/** The finish id a resolved remote material is applied as (mirrors
 *  `bundleToMaterialDef`'s id shape: `<provider>:<slug>:<resolution>`). */
export function showroomFinishId(
  slug: string,
  resolution: Resolution = SHOWROOM_RESOLUTION,
): string {
  return `polyhaven:${slug}:${resolution}`
}

// ── Remote-finish id round-trip (reload rehydration) ─────────────────────────

export interface RemoteFinishRef {
  provider: 'polyhaven' | 'ambientcg'
  slug: string
  resolution: Resolution
}

// Slug charset: Poly Haven slugs are lowercase snake_case; ambientCG asset ids
// are CamelCase+digits (e.g. `Wood094`) — allow both.
const REMOTE_FINISH_RE = /^(polyhaven|ambientcg):([A-Za-z0-9_-]+):(1k|2k|4k)$/
const REMOTE_FINISH_SCAN_RE = /(polyhaven|ambientcg):([A-Za-z0-9_-]+):(1k|2k|4k)/g

/** Parse a remote-material finish id (`<provider>:<slug>:<res>`), or `null`. */
export function parseRemoteFinishId(id: string): RemoteFinishRef | null {
  const m = typeof id === 'string' ? id.match(REMOTE_FINISH_RE) : null
  if (!m) return null
  return {
    provider: m[1] as RemoteFinishRef['provider'],
    slug: m[2],
    resolution: m[3] as Resolution,
  }
}

/** Scan any serialized state blob for remote-material finish ids — including
 *  ids embedded inside `tint:`/`mat:` wrappers — deduped, in first-seen order.
 *  Pure string scan so it works over `JSON.stringify(finishes/items)` without
 *  knowing every field that can carry a finish token. */
export function extractRemoteFinishRefs(json: string): RemoteFinishRef[] {
  const out: RemoteFinishRef[] = []
  const seen = new Set<string>()
  for (const m of json.matchAll(REMOTE_FINISH_SCAN_RE)) {
    const key = m[0]
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      provider: m[1] as RemoteFinishRef['provider'],
      slug: m[2],
      resolution: m[3] as Resolution,
    })
  }
  return out
}

function titleCase(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

/** Synthesize the `RemoteEntry` to re-resolve a persisted remote finish with —
 *  curated metadata when the slug is a showroom pick, an honest generic entry
 *  otherwise. (ambientCG re-resolution still works wherever its dev proxy is
 *  available; the IDB bundle cache serves either provider offline.) */
export function remoteEntryForRef(ref: RemoteFinishRef): RemoteEntry {
  const curated = ref.provider === 'polyhaven' ? showroomFinishFor(ref.slug) : null
  if (curated) return showroomEntry(curated)
  return {
    provider: ref.provider,
    slug: ref.slug,
    kind: 'material',
    name: titleCase(ref.slug),
    category: 'floor',
    thumbUrl: ref.provider === 'polyhaven' ? CDN_THUMB(ref.slug) : '',
    resolutions: ['1k', '2k', '4k'],
    attribution: ref.provider === 'polyhaven' ? 'Poly Haven (CC0)' : 'ambientCG (CC0)',
    sourceUrl:
      ref.provider === 'polyhaven'
        ? `https://polyhaven.com/a/${ref.slug}`
        : `https://ambientcg.com/view?id=${ref.slug}`,
  }
}
