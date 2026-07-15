import type { FurnitureCategory } from '../../furniture/types'

/**
 * Poly Haven curated set-dressing bundles.
 *
 * Poly Haven (https://polyhaven.com) hosts hundreds of **CC0** scanned/modelled
 * props behind a fully public, CORS-friendly API (`api.polyhaven.com`, no key) —
 * so the browser can fetch directly, like the Poly Pizza pack, which is why
 * these bundles surface in production builds too.
 *
 * Unlike Poly Pizza's single-file GLBs, Poly Haven models ship as a **multi-file
 * glTF** (a small `.gltf` + external `.bin` + `textures/*.jpg`). Poly Haven was
 * dropped as a *browsable* model source for exactly this reason (see CHANGELOG
 * v0.9.0.64), but a fixed curated set can still be fetched and packed into a
 * self-contained GLB in-browser at install time via the existing model-CONVERT
 * pipeline (`furniture/convert/convertModel`), then registered through the shared
 * pack pipeline — nothing is vendored into the repo.
 *
 * Every item is CC0 (no attribution legally required), but we capture the
 * author + a descriptive attribution string so the inspector credit line is
 * accurate. The download URLs (bin + each texture) come from the API's
 * per-asset `include` map — we never construct CDN paths ourselves.
 */

/** Poly Haven's public REST API (no auth, `access-control-allow-origin: *`). */
export const POLY_HAVEN_API = 'https://api.polyhaven.com'

/** Resolution tier fetched for bundle items — 1k keeps each item browser-light
 *  (single-digit MB) while still photoreal at furniture-prop distance. */
export const POLY_HAVEN_RESOLUTION = '1k'

/** One curated model within a bundle. `author` is captured for the credit line
 *  even though Poly Haven is CC0 (attribution not required). */
export interface PolyHavenItem {
  /** Poly Haven asset slug, e.g. 'ceramic_vase_01'. */
  slug: string
  name: string
  category: FurnitureCategory
  author: string
}

/** A themed set of items surfaced as one installable pack card. */
export interface PolyHavenBundle {
  /** Doubles as the pack id (must be unique across `AVAILABLE_PACKS`). */
  id: string
  name: string
  description: string
  items: PolyHavenItem[]
}

/** The curated bundles. All items are CC0 Poly Haven models, real-world metre
 *  scale (so the pack pipeline's default scale=1 is correct — no heuristic). */
export const POLY_HAVEN_BUNDLES: PolyHavenBundle[] = [
  {
    id: 'poly-haven-plants',
    name: 'Indoor plants',
    description:
      'Six CC0 potted houseplants — a pachira money tree, calathea, anthurium, ferns and more — to green up a corner or shelf. Fetched from Poly Haven; works in the published app.',
    items: [
      {
        slug: 'potted_plant_02',
        name: 'Potted Plant 02',
        category: 'decor',
        author: 'Rico Cilliers',
      },
      {
        slug: 'potted_plant_04',
        name: 'Potted Plant 04',
        category: 'decor',
        author: 'James Ray Cock',
      },
      {
        slug: 'calathea_orbifolia_01',
        name: 'Calathea Orbifolia',
        category: 'decor',
        author: 'Rob Tuytel, Rico Cilliers',
      },
      {
        slug: 'pachira_aquatica_01',
        name: 'Pachira Money Tree',
        category: 'decor',
        author: 'Rob Tuytel, Rico Cilliers',
      },
      {
        slug: 'anthurium_botany_01',
        name: 'Anthurium',
        category: 'decor',
        author: 'Rob Tuytel, Rico Cilliers',
      },
      { slug: 'fern_02', name: 'Fern', category: 'decor', author: 'Rob Tuytel, Rico Cilliers' },
    ],
  },
  {
    id: 'poly-haven-decor',
    name: 'Shelf & table decor',
    description:
      'Seven CC0 accents — ceramic and brass vases, a book set and a wooden bowl — to style a shelf, sideboard or coffee table. Fetched from Poly Haven; works in the published app.',
    items: [
      {
        slug: 'ceramic_vase_01',
        name: 'Ceramic Vase 01',
        category: 'decor',
        author: 'James Ray Cock',
      },
      {
        slug: 'ceramic_vase_02',
        name: 'Ceramic Vase 02',
        category: 'decor',
        author: 'James Ray Cock',
      },
      {
        slug: 'ceramic_vase_03',
        name: 'Ceramic Vase 03',
        category: 'decor',
        author: 'James Ray Cock',
      },
      { slug: 'brass_vase_01', name: 'Brass Vase', category: 'decor', author: 'Rico Cilliers' },
      {
        slug: 'antique_ceramic_vase_01',
        name: 'Antique Ceramic Vase',
        category: 'decor',
        author: 'James Ray Cock',
      },
      {
        slug: 'book_encyclopedia_set_01',
        name: 'Book Set',
        category: 'decor',
        author: 'John Malcolm',
      },
      {
        slug: 'wooden_bowl_01',
        name: 'Wooden Bowl 01',
        category: 'decor',
        author: 'Oliver Harries',
      },
    ],
  },
  {
    id: 'poly-haven-kitchen',
    name: 'Kitchen counter',
    description:
      'Seven CC0 countertop props — a tea set, wine bottles, jug, pots, plate and bowl — to dress a kitchen or dining surface. Fetched from Poly Haven; works in the published app.',
    items: [
      {
        slug: 'tea_set_01',
        name: 'Tea Set',
        category: 'kitchen',
        author: 'James Ray Cock, Rico Cilliers, Jurita Burger',
      },
      {
        slug: 'wine_bottles_01',
        name: 'Wine Bottles',
        category: 'kitchen',
        author: 'Rico Cilliers, Jurita Burger',
      },
      {
        slug: 'wooden_bowl_02',
        name: 'Wooden Bowl 02',
        category: 'kitchen',
        author: 'Kuutti Siitonen',
      },
      { slug: 'ceramic_pot', name: 'Ceramic Pot', category: 'kitchen', author: 'Aron Łyczek' },
      { slug: 'jug_01', name: 'Jug', category: 'kitchen', author: 'Kuutti Siitonen' },
      { slug: 'pot_enamel_01', name: 'Enamel Pot', category: 'kitchen', author: 'Kuutti Siitonen' },
      {
        slug: 'carved_wooden_plate',
        name: 'Carved Wooden Plate',
        category: 'kitchen',
        author: 'Jan Martens',
      },
    ],
  },
]

/** Look up a bundle by its id (= pack id). */
export function polyHavenBundle(id: string): PolyHavenBundle | undefined {
  return POLY_HAVEN_BUNDLES.find((b) => b.id === id)
}

/** The inspector/credit attribution for one item (CC0 — legally optional, but
 *  we credit the author regardless). */
export function polyHavenAttribution(item: PolyHavenItem): string {
  return `${item.name} by ${item.author} — Poly Haven (CC0)`
}

/** The Poly Haven asset page for an item. */
export function polyHavenSourceUrl(slug: string): string {
  return `https://polyhaven.com/a/${slug}`
}

/** Basename of a URL or relative path, sans query/hash. */
export function polyHavenBasename(pathOrUrl: string): string {
  const clean = pathOrUrl.split(/[?#]/)[0]
  return clean.split('/').pop() ?? clean
}

/** One external file a glTF depends on (its `.bin` or a texture). */
export interface PolyHavenFileRef {
  /** Basename — matches how the sibling pool + glTF relative refs resolve. */
  name: string
  url: string
}

/** The resolved download plan for one item: the entry `.gltf` plus every
 *  external file it references. */
export interface PolyHavenGltfFiles {
  gltfUrl: string
  gltfName: string
  deps: PolyHavenFileRef[]
}

/** MIME type for a dependency file, from its extension. Used to build the
 *  `data:` URI when inlining a Poly Haven glTF's external refs. */
export function polyHavenDataMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

/** The subset of a glTF document this module rewrites. */
export interface GltfUriDoc {
  buffers?: { uri?: string }[]
  images?: { uri?: string }[]
}

/**
 * Pure: rewrite a glTF's external `buffers[].uri`/`images[].uri` to inline
 * `data:` URIs, matched by basename against `dataUriByName`. Mutates + returns
 * the passed document. This makes the glTF fully self-contained BEFORE it hits
 * the CONVERT pipeline — the shared loader-security manager passes `data:`
 * through unchanged, whereas relative refs resolved against the entry's `blob:`
 * URL are short-circuited as `blob:` and never reach the sibling-pool map (so
 * inlining, not a sibling pool, is what actually loads Poly Haven's deps). Refs
 * already inline (`data:`) or unmatched are left untouched.
 */
export function inlineGltfUris<T extends GltfUriDoc>(
  gltf: T,
  dataUriByName: Record<string, string>,
): T {
  const swap = (list?: { uri?: string }[]): void => {
    for (const entry of list ?? []) {
      if (typeof entry.uri === 'string' && !entry.uri.startsWith('data:')) {
        const uri = dataUriByName[polyHavenBasename(entry.uri)]
        if (uri) entry.uri = uri
      }
    }
  }
  swap(gltf.buffers)
  swap(gltf.images)
  return gltf
}

/**
 * Pure: turn a Poly Haven `/files/<slug>` response into a download plan for the
 * given resolution. Returns null when that resolution has no glTF variant. The
 * `include` map is authoritative for dependency URLs (we never build CDN paths);
 * dependency names are basenames so they match the glTF's own relative refs when
 * inlined via `inlineGltfUris`.
 */
export function resolvePolyHavenGltfFiles(
  filesJson: unknown,
  resolution: string = POLY_HAVEN_RESOLUTION,
): PolyHavenGltfFiles | null {
  const gltf = (filesJson as { gltf?: Record<string, { gltf?: unknown }> } | null)?.gltf
  const node = gltf?.[resolution]?.gltf as
    | { url?: unknown; include?: Record<string, { url?: unknown }> }
    | undefined
  if (!node || typeof node.url !== 'string') return null
  const deps: PolyHavenFileRef[] = []
  for (const [rel, info] of Object.entries(node.include ?? {})) {
    if (info && typeof info.url === 'string') {
      deps.push({ name: polyHavenBasename(rel), url: info.url })
    }
  }
  return { gltfUrl: node.url, gltfName: polyHavenBasename(node.url), deps }
}
