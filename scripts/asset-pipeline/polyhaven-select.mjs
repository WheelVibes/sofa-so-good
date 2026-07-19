// Pure, network-free helpers for the Poly Haven model fetcher
// (`fetch-polyhaven-models.mjs`). Kept in its own module so the file-selection /
// naming / category-mapping logic is unit-testable without touching the network
// or the filesystem. NO side effects here.

/** Poly Haven texture resolutions, cheapest first — used as a fallback order. */
export const RESOLUTIONS = ['1k', '2k', '4k']

/**
 * Pick the glTF bundle (main .gltf + its included .bin/textures) at a resolution
 * from a Poly Haven `/files/<id>` response. Poly Haven ships models as a multi-
 * file glTF: `files.gltf["1k"].gltf = { url, size, md5, include: { <relPath>:
 * { url, size, md5 } } }`, where each `include` key is a path RELATIVE to the
 * main .gltf (e.g. `textures/foo_diff_1k.jpg`, `Foo.bin`) that the .gltf's own
 * `buffer.uri` / `image.uri` reference. Returns null when no glTF bundle exists.
 *
 * @param {any} files parsed `/files/<id>` JSON
 * @param {string} [preferred] preferred resolution ('1k' default); falls back
 *   through RESOLUTIONS to the cheapest available if the preferred one is absent.
 */
export function pickGltfBundle(files, preferred = '1k') {
  const gltf = files?.gltf
  if (!gltf || typeof gltf !== 'object') return null
  const order = [preferred, ...RESOLUTIONS.filter((r) => r !== preferred)]
  for (const res of order) {
    const entry = gltf[res]?.gltf
    if (!entry?.url) continue
    const include = entry.include && typeof entry.include === 'object' ? entry.include : {}
    const includes = Object.entries(include)
      .filter(([relPath, info]) => relPath && info?.url)
      .map(([relPath, info]) => ({ relPath, url: info.url, size: info.size ?? 0 }))
    return { resolution: res, url: entry.url, size: entry.size ?? 0, includes }
  }
  return null
}

/** Filesystem-safe, human-readable slug from an asset name/id.
 *  "Arm Chair 01" → "arm-chair-01"; "modern_coffee_table_01" → "modern-coffee-table-01".
 *  The dev local-assets plugin title-cases the stem back into a display name. */
export function slugify(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

// Keyword → FurnitureCategory, adapted from src/catalog/packs/polyPizza.ts
// `guessCategory`, but returning null (not 'others') on no match so the caller
// can fall back to Poly Haven's own category tags. One deliberate ordering
// difference from the runtime heuristic: the lighting check runs BEFORE tables
// so "desk lamp" reads as lighting (not a desk) — the fetcher gets to pick the
// most accurate subdir rather than replicate guessCategory's table>lamp quirk.
function keywordCategory(text) {
  const n = text.toLowerCase()
  if (/\b(bed|mattress|crib|bunk|daybed)\b/.test(n)) return 'beds'
  if (/\b(lamp|chandelier|sconce|lantern|pendant|bulb)\b/.test(n)) return 'lighting'
  if (/\b(sofa|couch|chair|stool|bench|armchair|seat|ottoman)\b/.test(n)) return 'seating'
  if (/\b(table|desk|nightstand|commode|console|counter)\b/.test(n)) return 'tables'
  if (
    /\b(shelf|shelves|bookcase|bookshelf|cabinet|wardrobe|drawer|dresser|storage|closet|rack|commode)\b/.test(
      n,
    )
  )
    return 'storage'
  if (/\b(lamp|light|chandelier|sconce|lantern|candle|bulb)\b/.test(n)) return 'lighting'
  if (/\b(fridge|refrigerator|oven|stove|microwave|washer|dishwasher|appliance)\b/.test(n))
    return 'appliances'
  if (/\b(sink|toilet|bath|shower|tub)\b/.test(n)) return 'bathroom'
  if (/\b(kitchen)\b/.test(n)) return 'kitchen'
  if (/\b(tv|television|monitor|computer|speaker|console)\b/.test(n)) return 'electronics'
  if (/\b(rug|carpet|curtain|cushion|pillow|blanket)\b/.test(n)) return 'textiles'
  if (/\b(plant|vase|painting|frame|clock|decor|mirror|sculpture|book)\b/.test(n)) return 'decor'
  return null
}

// Poly Haven's own model sub-category → our FurnitureCategory subdir (used only
// when the name keywords don't already pin a category).
const PH_CATEGORY_MAP = {
  bed: 'beds',
  seating: 'seating',
  table: 'tables',
  shelves: 'storage',
  containers: 'storage',
  lighting: 'lighting',
  appliances: 'appliances',
  electronics: 'electronics',
  office: 'tables',
  vases: 'decor',
  books: 'decor',
  decorative: 'decor',
  dishes: 'decor',
  'wall decoration': 'decor',
  'potted plants': 'decor',
  plants: 'decor',
  flowers: 'decor',
}

/**
 * Best FurnitureCategory subdir for a Poly Haven model asset. The dev local-
 * assets plugin infers a catalog category from the FIRST path segment when it
 * matches a `FurnitureCategory`, so writing into `local-assets/<category>/…`
 * pins the category deterministically. Name keywords win (they mirror the
 * runtime `guessCategory`), then Poly Haven's category tags, else 'others'.
 *
 * @param {{ name?: string, tags?: string[], categories?: string[] }} asset
 */
export function polyhavenCategory(asset) {
  const name = asset?.name ?? ''
  const tags = Array.isArray(asset?.tags) ? asset.tags.join(' ') : ''
  const kw = keywordCategory(`${name} ${tags}`)
  if (kw) return kw
  const cats = Array.isArray(asset?.categories) ? asset.categories : []
  for (const c of cats) {
    const mapped = PH_CATEGORY_MAP[String(c).toLowerCase()]
    if (mapped) return mapped
  }
  return 'others'
}

/** CC0 attribution string for the sidecar / provenance record. Poly Haven is
 *  CC0 so attribution isn't legally required, but we record the author + source
 *  anyway (matching CREDITS.json conventions). */
export function buildAttribution(asset) {
  const name = asset?.name ?? asset?.id ?? 'Untitled'
  const authors =
    asset?.authors && typeof asset.authors === 'object' ? Object.keys(asset.authors) : []
  const by = authors.length ? ` by ${authors.join(', ')}` : ''
  return `${name}${by} (CC0) — Poly Haven`
}

/** Canonical Poly Haven asset page URL for an id. */
export function sourceUrl(id) {
  return `https://polyhaven.com/a/${id}`
}
