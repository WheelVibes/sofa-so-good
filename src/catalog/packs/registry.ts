import { parseKenneyFurnitureKit } from './parsers'
import { POLY_HAVEN_BUNDLES } from './polyHaven'
import type { Pack } from './types'

/** Each curated Poly Haven bundle surfaces as one installable pack card. All
 *  items are CC0 + fetched from the keyless, CORS-friendly Poly Haven API, so
 *  the bundles are visible in production builds (no `devOnly`). The card looks
 *  the bundle's items up by id in `POLY_HAVEN_BUNDLES`. */
const POLY_HAVEN_BUNDLE_PACKS: Pack[] = POLY_HAVEN_BUNDLES.map((b) => ({
  id: b.id,
  kind: 'poly-haven-bundle' as const,
  name: b.name,
  description: b.description,
  attribution: 'Poly Haven — polyhaven.com (CC0, credited per model)',
  license: 'CC0' as const,
  sourceUrl: 'https://polyhaven.com/models',
}))

export const AVAILABLE_PACKS: Pack[] = [
  ...POLY_HAVEN_BUNDLE_PACKS,
  {
    id: 'poly-pizza',
    kind: 'poly-pizza',
    name: 'Poly Pizza',
    description:
      'Browse and download low-poly furniture from Poly Pizza (10,000+ CC0 / CC-BY models). Needs a free API key from poly.pizza — paste it below, search, and download. Works in the published app.',
    attribution: 'Poly Pizza — poly.pizza (CC0 / CC-BY, credited per model)',
    license: 'CC0',
    sourceUrl: 'https://poly.pizza/',
    // Programmatic in-browser download (CORS-friendly API) → visible everywhere.
  },
  {
    id: 'kenney-furniture-kit',
    name: 'Kenney Furniture Kit',
    description:
      'Stylized low-poly furniture — bedrooms, kitchens, bathrooms, lounges, decor (~125 items).',
    attribution: 'Kenney — kenney.nl (CC0)',
    license: 'CC0',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl:
      '/kenney/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip',
    sizeBytes: 5_130_729,
    parseEntries: parseKenneyFurnitureKit,
    // kenney.nl ships no CORS headers and the `/kenney` path is a dev-only Vite
    // proxy, so this only works under `npm run dev`. Hidden in production until a
    // production proxy / same-origin mirror exists. See TODO.md.
    devOnly: true,
  },
  {
    id: 'ikea-sg-live',
    kind: 'ikea-live',
    name: 'IKEA Singapore (live scrape)',
    description:
      'Scrapes IKEA SG product models on demand via the local scraper sidecar, optimizing each model as it downloads. Requires `npm run scraper-server`.',
    // Not a CC0 claim — the literal only satisfies the Pack type; the card shows
    // the IKEA attribution. IKEA models are IKEA IP, local/dev-only.
    attribution: 'IKEA — ikea.com/sg (imported models, local/dev-only)',
    license: 'CC0',
    sourceUrl: 'https://www.ikea.com/sg/en/',
    devOnly: true,
  },
  // ── Manual sources ──────────────────────────────────────────────────────
  // These have no CORS-friendly programmatic single-file download (Google-Drive
  // hosting, OAuth-gated download APIs, or marketplace pages). They can't drive
  // an in-app install, so each is a link-out card: download by hand, then import
  // via the Upload dialog (drag-drop GLB folders). Dev-only — a production build
  // surfaces only sources that actually download in-app.
  {
    id: 'quaternius',
    kind: 'manual',
    name: 'Quaternius',
    description:
      'CC0 low-poly furniture & interior packs (GLB/FBX). Google-Drive hosted (no CORS download) — grab a pack, then import the GLBs via Upload.',
    attribution: 'Quaternius — quaternius.com (CC0)',
    license: 'CC0',
    sourceUrl: 'https://quaternius.com/',
    devOnly: true,
  },
  {
    id: 'sketchfab',
    kind: 'manual',
    name: 'Sketchfab (free / CC)',
    description:
      '800,000+ free models under Creative Commons. Download requires a Sketchfab login (OAuth) — download glTF by hand, then import via Upload.',
    attribution: 'Sketchfab — sketchfab.com (CC-BY / CC-BY-NC / etc., per model)',
    license: 'CC-BY',
    sourceUrl: 'https://sketchfab.com/3d-models/categories/furniture-home?features=downloadable',
    devOnly: true,
  },
  {
    id: 'furnimesh',
    kind: 'manual',
    name: 'FurniMesh',
    description:
      'Furniture-only library (GLB/OBJ), free commercial-use licence, no attribution. Download by hand, then import via Upload.',
    attribution: 'FurniMesh — furnimesh.com (free, no attribution)',
    license: 'CC0',
    sourceUrl: 'https://furnimesh.com/',
    devOnly: true,
  },
  {
    id: 'open-source-3d-assets',
    kind: 'manual',
    name: 'Open Source 3D Assets',
    description:
      '~1,000 CC0 GLB models. No bulk API — download what you need, then import via Upload.',
    attribution: 'Open Source 3D Assets — opensource3dassets.com (CC0)',
    license: 'CC0',
    sourceUrl: 'https://www.opensource3dassets.com/en',
    devOnly: true,
  },
  {
    id: 'free3d',
    kind: 'manual',
    name: 'Free3D',
    description:
      'Large free furniture library (GLB/FBX/OBJ). Licences vary per model — check each. Download by hand, then import via Upload.',
    attribution: 'Free3D — free3d.com (licence varies per model)',
    license: 'CC-BY',
    sourceUrl: 'https://free3d.com/3d-models/furniture',
    devOnly: true,
  },
  // ── Material / texture sources ───────────────────────────────────────────
  // Runtime-downloadable CC0 textures come from Poly Haven (CORS-friendly,
  // browsable in the catalog/finish pickers in production) and — in dev only —
  // ambientCG via the Vite proxy. The libraries below are CC0 but have no
  // CORS-friendly API, so they're manual link-outs: download a PBR set, then
  // import it via the Upload → Material dialog. Dev-only.
  {
    id: 'cgbookcase',
    kind: 'manual',
    assetType: 'material',
    name: 'cgbookcase',
    description:
      '500+ tileable PBR textures, all CC0 (no attribution). No API — download a set (albedo/normal/roughness), then import via Upload → Material.',
    attribution: 'cgbookcase.com (CC0)',
    license: 'CC0',
    sourceUrl: 'https://www.cgbookcase.com/textures',
    devOnly: true,
  },
  {
    id: 'texturecan',
    kind: 'manual',
    assetType: 'material',
    name: 'TextureCan',
    description:
      'Free 4K+ PBR textures & materials for any use. No API — download a set, then import via Upload → Material.',
    attribution: 'texturecan.com (free, commercial use)',
    license: 'CC0',
    sourceUrl: 'https://www.texturecan.com/',
    devOnly: true,
  },
  {
    id: '3dtextures',
    kind: 'manual',
    assetType: 'material',
    name: '3DTextures.me',
    description:
      'Large CC0 seamless PBR texture collection (1K free). No API — download a set, then import via Upload → Material.',
    attribution: '3dtextures.me (CC0)',
    license: 'CC0',
    sourceUrl: 'https://3dtextures.me/',
    devOnly: true,
  },
  {
    id: 'sharetextures',
    kind: 'manual',
    assetType: 'material',
    name: 'Share Textures',
    description:
      'CC0 PBR textures & models (wood/stone/wall/metal…). Some sets are patron-only. No API — download a free set, then import via Upload → Material.',
    attribution: 'sharetextures.com (CC0, some patron-only)',
    license: 'CC0',
    sourceUrl: 'https://www.sharetextures.com/',
    devOnly: true,
  },
]

/** Packs to surface in the UI. `devOnly` packs (Kenney + the dev-only Vite
 *  proxy, the IKEA live-scrape sidecar, and the manual link-out sources) are
 *  hidden from production builds — only packs that actually download in-app
 *  (Poly Pizza) appear there. Pass `import.meta.env.DEV` from the caller. */
export function visiblePacks(isDev: boolean): Pack[] {
  return AVAILABLE_PACKS.filter((p) => isDev || !p.devOnly)
}
