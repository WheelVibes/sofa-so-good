/**
 * Curated CC0 HDRI environment library (F3/R-HDRI · PHOTO-HDRI) for image-based
 * lighting. All entries are Poly Haven **CC0** equirectangular `.hdr` maps served
 * from the Poly Haven CDN, which sends CORS headers so the browser fetches them
 * directly (no proxy) — prod-safe. Selecting one swaps the procedural Lightformer
 * probe for a real captured environment (`SceneEnvironment`, behind the
 * `hdriEnvironment` flag, Medium+); the default (`null`) keeps the procedural
 * probe untouched, so the out-of-the-box look never changes.
 *
 * 1k resolution keeps the download small (~1–2 MB) and is plenty for ambient IBL
 * reflections at interior scale.
 */
export interface HdriPreset {
  id: string
  /** Friendly picker label. */
  name: string
  /** Equirectangular `.hdr` URL (Poly Haven CDN, CORS-enabled). */
  url: string
  /** Short mood/use hint. */
  hint: string
  /** Attribution — all Poly Haven HDRIs are CC0. */
  credit: string
}

const BASE = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/'

export const HDRI_PRESETS: readonly HdriPreset[] = [
  {
    id: 'studio_small_09',
    name: 'Neutral studio',
    url: `${BASE}studio_small_09_1k.hdr`,
    hint: 'Soft even product-studio light',
    credit: 'Poly Haven · CC0',
  },
  {
    id: 'brown_photostudio_02',
    name: 'Warm studio',
    url: `${BASE}brown_photostudio_02_1k.hdr`,
    hint: 'Warmer studio with gentle falloff',
    credit: 'Poly Haven · CC0',
  },
  {
    id: 'kloppenheim_06_puresky',
    name: 'Clear sky',
    url: `${BASE}kloppenheim_06_puresky_1k.hdr`,
    hint: 'Bright blue midday sky',
    credit: 'Poly Haven · CC0',
  },
  {
    id: 'venice_sunset',
    name: 'Golden hour',
    url: `${BASE}venice_sunset_1k.hdr`,
    hint: 'Warm low-sun glow',
    credit: 'Poly Haven · CC0',
  },
  {
    id: 'kiara_1_dawn',
    name: 'Soft dawn',
    url: `${BASE}kiara_1_dawn_1k.hdr`,
    hint: 'Cool, diffuse early light',
    credit: 'Poly Haven · CC0',
  },
]

/** Look up a preset by id; `null`/unknown → null (use the procedural probe). */
export function hdriById(id: string | null | undefined): HdriPreset | null {
  if (!id) return null
  return HDRI_PRESETS.find((h) => h.id === id) ?? null
}
