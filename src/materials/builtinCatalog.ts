/**
 * Built-in material catalog.
 *
 * Floors and a few wall finishes are generated procedurally on-device at
 * runtime (see materials/procedural) — real tiling PBR maps (albedo +
 * normal + roughness) with no network fetch and a single shared tile per
 * material. Wall paints are flat matte colours that match common Singapore
 * HDB interior palettes. Adding a material = one entry here.
 */

import type { RoomId } from '../apartment/types'
import type {
  FloorBuildUp,
  MaterialCategory,
  MaterialDef,
  MaterialId,
  ProceduralPattern,
} from './types'

/**
 * Metres per tile for the ORANGE-PEEL PLASTER normal (PLASTER-STRETCH,
 * v0.31.5.56).
 *
 * This shipped at `2.5` — one 256-square tile stretched across 2.5 m of wall —
 * which is why the flat's single largest surface (walls are ~45% of the walk
 * view) rendered as decimetre-scale grey cloud rather than paint. Orange peel is
 * a MILLIMETRE texture; stretched 2.5 m it stops reading as texture at all. Same
 * mechanism as DOOR-GRAIN (v0.31.5.50), on a much bigger surface.
 *
 * 0.6 is a principled value rather than a tuned one: at a 256-square tile it puts
 * one texel at ~2.3 mm, which is the size of a real orange-peel bump. Measured on
 * the drawn wall (`dev-probes/wall-mottle.mjs`), masked microcontrast goes
 * 0.442 -> 0.961 (+117%) with mean and sigma unmoved — i.e. the change is purely
 * the high-frequency channel, which is exactly the claim.
 *
 * **Do not chase the peak.** 0.3 m measures slightly higher (1.072) but 0.15 m
 * FALLS BACK to 0.913 — the NYQUIST-AUDIT rolloff, the tile aliasing against the
 * screen. 0.6 sits a full octave clear of that edge.
 *
 * Deliberately NOT applied to `limewash`, which keeps 2.5: limewash really is a
 * broad cloudy finish, and the same number is right there for the same reason it
 * was wrong here.
 */
export const PLASTER_UV_SCALE: [number, number] = [0.6, 0.6]

/**
 * SPECIFIED floor modules (mm) — `moduleMm`, consumed by
 * `floorplan/tileCoursing.ts` for the tile setting-out table and the tiling
 * layout plan sheet.
 *
 * **Why these and only these.** Before v0.31.5.288 no FLOOR material carried a
 * module at all — only three wall tiles did — so `planTileCoursing`, which reads
 * FLOOR finishes, could never produce a single row. The setting-out table has
 * been rendering empty since it shipped, and the layout sheet would have too:
 * the feature was complete except for the data it needs.
 *
 * A module is a PRODUCT DIMENSION and is never inferred from `uvScale` (see
 * `MaterialDef.moduleMm` and `tileCoursing.ts`'s header — the rendered tile size
 * is `uvScale ÷ the painter's internal grid count`, a texture-authoring
 * constant). So a module is set ONLY where a real, citeable SG format exists:
 *
 *  - **600 × 600 porcelain** — the dominant Singapore whole-home and HDB
 *    bathroom format ("most homeowners now opt for porcelain in formats of
 *    600 mm by 600 mm or larger"; "60x60 cm matte porcelain … the best balance
 *    of durability, slip resistance and visual space in Singapore's humidity").
 *  - **300 × 1200 vinyl plank** — the SG planked-vinyl format ("vinyl tiles come
 *    in two sizes … 30x120 cm, the latter reserved entirely for planked
 *    flooring").
 *
 * Deliberately left WITHOUT a module, because guessing one would put a fake
 * dimension on a contractor's drawing:
 *  - hexagon tiles — the coursing model is rectangular; a hex field is not a
 *    rectangular module and would be silently wrong, not merely imprecise;
 *  - marble, terrazzo — slab/in-situ, sizes vary per supplier or are poured;
 *  - timber planks, parquet, herringbone, checker — pattern-dependent, and the
 *    sources found gave no firm SG standard plank size;
 *  - concrete, screed, carpet — not modular at all.
 *
 * A room whose finish has no module is REPORTED as omitted by
 * `planTileCoursing`, never silently dropped, so the gaps stay visible.
 *
 * Sources: homeanddecor.com.sg "Big or Small Tiles"; thedesignfactory.studio
 * "HDB Bathroom Tiles Singapore (2026)"; tsd.sg "Floor Tiles in Singapore";
 * weiken.com "A Complete Guide To Floor Tiles In Singapore".
 */
const PORCELAIN_600: [number, number] = [600, 600]
/** SG planked-vinyl format (300 x 1200 mm). */
const VINYL_PLANK: [number, number] = [300, 1200]

/**
 * SPECIFIED floor build-up by pattern family (mm) — see `MaterialDef.buildUp`.
 *
 * Applied inside `floor()` so every finish in a covered family carries it BY
 * CONSTRUCTION, the same design as `EMULSION_COVERAGE` inside `wall()`. A
 * per-item list of 37 finishes drifts; a family map cannot.
 *
 * Where a source gives a range these take the THICKER end, because the figures
 * feed the HDB 50 mm limit: understating a build-up clears a floor that fails
 * on site. Reasoning and sources in
 * `docs/research/2026-09-03-floor-build-up.md`.
 *
 * **Families deliberately absent** — `carpet` and `terrazzo`. I found no
 * citable figure for either (SG terrazzo is usually the original poured or
 * precast floor, not a 15 mm tile), and `analysis/floorBuildUp.ts` reports an
 * unassessed room rather than assuming one. `concrete` maps to ZERO, which is
 * a real answer and not a missing one: bare screed and bare concrete ARE the
 * substrate the other build-ups sit on.
 */
const BUILD_UP_BY_PATTERN: Partial<Record<ProceduralPattern, FloorBuildUp>> = {
  // 10 mm is "a common choice for floor applications"; 5 mm is the max bed
  // depth quoted for a tile up to 600x600. The regulation's own arithmetic
  // agrees at the thin end — 10 mm tile + 3 mm adhesive is exactly the 13 mm
  // overlay limit — so 5 mm is the bedded-on-screed figure, not the overlay one.
  tile: { finishMm: 10, beddingMm: 5, note: '10 mm tile body on a 5 mm adhesive bed' },
  // Engineered timber runs 6-12 mm; 12 mm is the thicker end, plus a 3 mm
  // acoustic underlay, which HDB effectively requires for a floating floor.
  wood: { finishMm: 12, beddingMm: 3, note: '12 mm engineered board on 3 mm underlay' },
  // Home LVT/LVP is "4 mm to 6 mm for the best balance"; 6 mm is the thicker
  // end of that band, on a 1 mm underlay.
  vinyl: { finishMm: 6, beddingMm: 1, note: '6 mm LVT on 1 mm underlay' },
  // Bare substrate — a real zero, not an unknown.
  concrete: { finishMm: 0, beddingMm: 0, note: 'bare substrate — nothing laid over it' },
}
/** Patterns that are tile products, so they share the tile build-up. */
const TILE_PATTERNS: readonly ProceduralPattern[] = [
  'tile',
  'porcelain',
  'stoneTile',
  'porcelainStone',
  'marble',
  'hexagon',
  'subway',
  'checker',
  'peranakan',
]
/** Patterns that are timber-board products. */
const WOOD_PATTERNS: readonly ProceduralPattern[] = ['wood', 'parquet', 'herringbone']

function buildUpForPattern(pattern: ProceduralPattern): FloorBuildUp | undefined {
  if (TILE_PATTERNS.includes(pattern)) return BUILD_UP_BY_PATTERN.tile
  if (WOOD_PATTERNS.includes(pattern)) return BUILD_UP_BY_PATTERN.wood
  return BUILD_UP_BY_PATTERN[pattern]
}

function floor(
  id: string,
  name: string,
  swatch: string,
  pattern: ProceduralPattern,
  uvScale: [number, number],
  sourceUrl?: string,
  /** SPECIFIED module in mm for a modular finish — see `MaterialDef.moduleMm`.
   *  A product dimension, NOT derived from `uvScale`. */
  moduleMm?: [number, number],
): MaterialDef {
  return {
    id,
    name,
    category: 'floor',
    kind: 'procedural',
    pattern,
    swatch,
    uvScale,
    sourceUrl,
    ...(moduleMm ? { moduleMm } : {}),
    ...(buildUpForPattern(pattern) ? { buildUp: buildUpForPattern(pattern) } : {}),
  }
}

/** Painted plaster wall in an arbitrary colour (shares the plaster normal,
 *  tinted by `swatch`) — used to widen the curated wall palette. */
/**
 * SPECIFIED coverage for the painted-plaster finishes below, consumed by
 * `analysis/paintQuantities.ts`.
 *
 * **12 m²/L per coat, 2 coats.** Standard interior emulsion covers 12-14 m²/L
 * per coat on a smooth, primed or previously-painted surface, and two topcoats
 * is the standard assumption for full opacity. The LOWER end of the band is
 * taken deliberately: a paint quantity that runs short mid-wall costs a second
 * trip and a possible batch mismatch, while over-ordering slightly costs a part
 * tin. (Note the direction is opposite to `deliveryAccess.ts`, which takes the
 * TIGHTER aperture — in both cases the choice is the one whose error is
 * cheaper, which is not the same as "always the smaller number".)
 *
 * Bare/new-plaster coverage and the sealer coat are properties of the SUBSTRATE
 * rather than of the product, so they live in `paintQuantities.ts` instead of
 * being repeated on all 19 paints here.
 *
 * Applied inside this helper rather than per entry, so every painted finish
 * carries it by construction — the `.288` failure mode (a feature complete
 * except for unauthored data) cannot recur for paints added later.
 *
 * Sources: sleeplesstradesman.com "Paint Coverage Calculator UK"; squote.app
 * "Paint Coverage Calculator"; dulux.com.au paint calculator (2 coats).
 */
const EMULSION_COVERAGE = { spreadingRateM2PerL: 12, coats: 2 } as const

function wall(id: string, name: string, swatch: string): MaterialDef {
  return {
    id,
    name,
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch,
    uvScale: PLASTER_UV_SCALE,
    paint: EMULSION_COVERAGE,
  }
}

/** Patterned wallpaper finish (stripe / grasscloth). Tiles at ~1 m. */
function wallpaper(
  id: string,
  name: string,
  swatch: string,
  pattern: ProceduralPattern,
): MaterialDef {
  return { id, name, category: 'wall', kind: 'procedural', pattern, swatch, uvScale: [1.2, 1.2] }
}

export const BUILTIN_MATERIALS: Record<MaterialId, MaterialDef> = {
  // ── Floors (procedural PBR) ─────────────────────────────────────────────
  'floor-concrete': floor('floor-concrete', 'Concrete (bare)', '#bcb9b3', 'concrete', [2.2, 2.2]),
  // Raw cement screed — the unfinished floor an HDB BTO is handed over with when
  // the buyer does NOT opt into the Optional Component Scheme (BSJ-4). A flat,
  // dusty grey cement topping over the structural slab; distinct from the smoother
  // `floor-concrete` microcement look (HDB Group Reno / 9creation bare-handover).
  'floor-screed': floor('floor-screed', 'Cement screed (bare)', '#a7a29a', 'concrete', [3.2, 3.2]),
  'floor-wood-oak': floor('floor-wood-oak', 'Oak planks', '#b88f5d', 'wood', [1.9, 1.2]),
  'floor-wood-walnut': floor('floor-wood-walnut', 'Walnut planks', '#6b4428', 'wood', [1.9, 1.2]),
  'floor-tile-white': floor(
    'floor-tile-white',
    'White tiles',
    '#e6e3dc',
    'tile',
    [0.6, 0.6],
    undefined,
    PORCELAIN_600,
  ),
  'floor-tile-marble': floor('floor-tile-marble', 'Marble', '#dcd6c8', 'marble', [1.6, 1.6]),
  'floor-carpet-grey': floor('floor-carpet-grey', 'Grey carpet', '#7a7c7e', 'carpet', [1.5, 1.5]),
  'floor-vinyl-light': floor(
    'floor-vinyl-light',
    'Light vinyl',
    '#c9b99c',
    'vinyl',
    [1.4, 0.9],
    undefined,
    VINYL_PLANK,
  ),
  'floor-terrazzo': floor('floor-terrazzo', 'Terrazzo', '#d7d2c6', 'terrazzo', [1.0, 1.0]),
  // Honeycomb hex tile — a kitchen/bath staple (Coohom/Planner-5D parity).
  'floor-tile-hex': floor('floor-tile-hex', 'Hexagon tiles', '#e4e0d6', 'hexagon', [0.5, 0.5]),
  'floor-tile-hex-charcoal': floor(
    'floor-tile-hex-charcoal',
    'Charcoal hex tiles',
    '#3c3e42',
    'hexagon',
    [0.5, 0.5],
  ),
  // Large-format porcelain — ubiquitous in modern HDB renovations.
  'floor-tile-grey': floor(
    'floor-tile-grey',
    'Grey porcelain',
    '#b9b9b6',
    'tile',
    [0.8, 0.8],
    undefined,
    PORCELAIN_600,
  ),
  'floor-tile-charcoal': floor(
    'floor-tile-charcoal',
    'Charcoal porcelain',
    '#4c4e52',
    'tile',
    [0.8, 0.8],
    undefined,
    PORCELAIN_600,
  ),
  'floor-wood-teak': floor('floor-wood-teak', 'Teak planks', '#9a6b3f', 'wood', [1.9, 1.2]),
  'floor-wood-ash': floor('floor-wood-ash', 'Pale ash planks', '#cdb696', 'wood', [1.9, 1.2]),
  'floor-wood-ebony': floor('floor-wood-ebony', 'Ebony planks', '#43342a', 'wood', [1.9, 1.2]),
  'floor-tile-sand': floor(
    'floor-tile-sand',
    'Sand porcelain',
    '#cdbfa6',
    'tile',
    [0.8, 0.8],
    undefined,
    PORCELAIN_600,
  ),
  'floor-wood-merbau': floor('floor-wood-merbau', 'Merbau', '#7a3f2a', 'wood', [1.9, 1.2]),
  'floor-wood-maple': floor('floor-wood-maple', 'Maple', '#d8c19a', 'wood', [1.9, 1.2]),
  // Basketweave parquet — one block ≈ 0.5 m, so it tiles at 0.5 m.
  'floor-parquet-oak': floor('floor-parquet-oak', 'Oak parquet', '#b88f5d', 'parquet', [0.5, 0.5]),
  'floor-parquet-walnut': floor(
    'floor-parquet-walnut',
    'Walnut parquet',
    '#6b4428',
    'parquet',
    [0.5, 0.5],
  ),
  // Herringbone parquet — premium 45° interlocking planks. The tile holds 16
  // plank-widths, so at a 2 m tile each plank is ~0.5 m × 0.125 m (realistic).
  'floor-herringbone-oak': floor(
    'floor-herringbone-oak',
    'Oak herringbone',
    '#b88f5d',
    'herringbone',
    [2.0, 2.0],
  ),
  'floor-herringbone-walnut': floor(
    'floor-herringbone-walnut',
    'Walnut herringbone',
    '#6b4428',
    'herringbone',
    [2.0, 2.0],
  ),
  'floor-checker-mono': floor(
    'floor-checker-mono',
    'Checkerboard',
    '#e8e6e0',
    'checker',
    [1.2, 1.2],
  ),
  'floor-checker-terracotta': floor(
    'floor-checker-terracotta',
    'Checker terracotta',
    '#c79a78',
    'checker',
    [1.2, 1.2],
  ),
  'floor-terrazzo-dark': floor(
    'floor-terrazzo-dark',
    'Dark terrazzo',
    '#5a564e',
    'terrazzo',
    [1.0, 1.0],
  ),
  // Heritage checkerboard colourways (jade / cobalt) — the classic Peranakan
  // shophouse floor. Two tiles ≈ 0.6 m each at this uvScale.
  'floor-checker-jade': floor(
    'floor-checker-jade',
    'Heritage checker (jade)',
    '#3f7d6a',
    'checker',
    [1.2, 1.2],
  ),
  'floor-checker-cobalt': floor(
    'floor-checker-cobalt',
    'Heritage checker (cobalt)',
    '#2f4d8a',
    'checker',
    [1.2, 1.2],
  ),
  // Peranakan / Nyonya majolica encaustic tiles — the named 2026 heritage trend.
  // Small cement tiles (~0.2 m each; 2 tiles per texture → 0.4 m uvScale).
  'floor-peranakan-jade': floor(
    'floor-peranakan-jade',
    'Peranakan tile (jade)',
    '#3f7d6a',
    'peranakan',
    [0.4, 0.4],
  ),
  'floor-peranakan-cobalt': floor(
    'floor-peranakan-cobalt',
    'Peranakan tile (cobalt)',
    '#2f4d8a',
    'peranakan',
    [0.4, 0.4],
  ),
  'floor-peranakan-rose': floor(
    'floor-peranakan-rose',
    'Peranakan tile (rose)',
    '#c56b6b',
    'peranakan',
    [0.4, 0.4],
  ),
  'floor-carpet-blue': floor('floor-carpet-blue', 'Navy carpet', '#3f4a63', 'carpet', [1.5, 1.5]),
  'floor-carpet-greige': floor(
    'floor-carpet-greige',
    'Greige carpet',
    '#b3a89a',
    'carpet',
    [1.5, 1.5],
  ),
  // ── Serangoon North Vista (SNV) 4-room HDB spec finishes ──────────────────
  // Sourced from the HDB sales/handover doc (assets/guidelines/specs.png).
  // Timber-look vinyl strip flooring — living/dining/bedroom/corridor. Real
  // strips run ~1.2 m × 0.18 m; the `wood` painter stacks 6 planks per tile,
  // so plank height = uvScaleY / 6 = 0.18 → uvScaleY 1.08, plank length =
  // uvScaleX = 1.2 (distinct from `floor-vinyl-light`'s [1.4, 0.9] wide-board
  // read — these are narrower, shorter strips, lighter oak tone).
  // RENDER-CALIBRATED swatch (SNV-BOARDS tone pass): the board's surface tone
  // is a warm grey-washed oak (~#b2a28e), but the midday light mix (cool sky
  // IBL + hemisphere fill) strips warmth — a measured per-channel response of
  // ~(0.56, 0.61, 0.68) R/G/B on this floor. The swatch is therefore solved
  // as target ÷ response (then peak-normalised), which is WHY it looks more
  // saturated than the board in isolation: rendered on the floor at midday it
  // lands on the board's exact colour proportions (verified by sampling GPU
  // screenshots). Don't "fix" it back toward the board hex — that re-greys
  // the floor. Same calibration applies to the other SNV swatches below.
  // Uniform per-strip colour (printed laminate) via the dedicated `vinyl`
  // pattern — the default L/D + corridor + bedroom finish, paired with the
  // laminated-UPVC skirting (`apartment/Skirting.tsx`).
  'floor-vinyl-oak': floor(
    'floor-vinyl-oak',
    'Timber vinyl strips',
    '#d6b38d',
    'vinyl',
    [1.2, 1.08],
  ),
  // Beige glazed porcelain, 600×600 — the SNV kitchen floor. SNV-BOARDS: the
  // dedicated `stoneTile` painter (honed warm-greige stone print, hairline
  // rectified joints) at the TRUE physical scale — 2×2 tiles per texture →
  // [1.2, 1.2] renders real 600 mm tiles (the earlier `tile`/[0.6, 0.6]
  // combo rendered glossy 300 mm tiles with dark grout, nothing like the
  // sample board).
  'floor-tile-beige': floor(
    'floor-tile-beige',
    'Beige glazed porcelain (600×600)',
    '#cfb38e',
    'stoneTile',
    [1.2, 1.2],
    undefined,
    [600, 600],
  ),
  // Same SNV stone print at 300×300 — the household-shelter / service-yard
  // floor per the sample board ("Kitchen 600×600; Household Shelter/Service
  // Yard 300×300"). Same painter, half the physical tile size.
  'floor-tile-beige-300': floor(
    'floor-tile-beige-300',
    'Beige glazed porcelain (300×300)',
    '#cfb38e',
    'stoneTile',
    [0.6, 0.6],
    undefined,
    [300, 300],
  ),
  // Mottled grey-green glazed porcelain, 300×600 — bathroom floor. SNV-BOARDS:
  // the `porcelainStone` painter (honed mottled stone print, running bond,
  // hairline light joints); a 0.6 × 0.3 m tile needs uvScale = tileSize ×
  // coursesPerAxis = [1.2, 1.2] (tile width 1.2/2 = 0.6 m, height 1.2/4 =
  // 0.3 m).
  'floor-tile-bath-green': floor(
    'floor-tile-bath-green',
    'Grey-green glazed porcelain (300×600)',
    '#a69e83',
    'porcelainStone',
    [1.2, 1.2],
    undefined,
    [300, 600],
  ),

  // ── Walls ───────────────────────────────────────────────────────────────
  // Default white is a subtly textured plaster (orange-peel normal) so walls
  // catch light like real painted plaster instead of reading dead flat.
  'wall-paint-white': {
    id: 'wall-paint-white',
    name: 'White paint',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#f5f5f0',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-warm': {
    id: 'wall-paint-warm',
    name: 'Warm cream',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#e9d8c4',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-sage': {
    id: 'wall-paint-sage',
    name: 'Sage',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#a7b59a',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-charcoal': {
    id: 'wall-paint-charcoal',
    name: 'Charcoal',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#3a3a3a',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-blue': {
    id: 'wall-paint-blue',
    name: 'Sky blue',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#a9c1d6',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-blush': {
    id: 'wall-paint-blush',
    name: 'Blush',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#e6c8c0',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-greige': {
    id: 'wall-paint-greige',
    name: 'Greige',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#cdc6ba',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-terracotta': {
    id: 'wall-paint-terracotta',
    name: 'Terracotta',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#c08763',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-navy': {
    id: 'wall-paint-navy',
    name: 'Navy',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#3b4a63',
    uvScale: PLASTER_UV_SCALE,
  },
  'wall-paint-forest': {
    id: 'wall-paint-forest',
    name: 'Forest green',
    category: 'wall',
    kind: 'procedural',
    pattern: 'plaster',
    swatch: '#4a5e4a',
    uvScale: PLASTER_UV_SCALE,
  },

  // Expanded curated palette — popular contemporary interior wall colours.
  'wall-paint-soft-white': wall('wall-paint-soft-white', 'Soft white', '#efece4'),
  'wall-paint-almond': wall('wall-paint-almond', 'Almond', '#e7ddca'),
  'wall-paint-oat': wall('wall-paint-oat', 'Oat', '#d8cdb8'),
  'wall-paint-mushroom': wall('wall-paint-mushroom', 'Mushroom', '#b6aa9a'),
  'wall-paint-clay': wall('wall-paint-clay', 'Clay', '#b98a6e'),
  'wall-paint-rust': wall('wall-paint-rust', 'Rust', '#a85a3c'),
  'wall-paint-mustard': wall('wall-paint-mustard', 'Mustard', '#c69a45'),
  'wall-paint-olive': wall('wall-paint-olive', 'Olive', '#7d7a4a'),
  'wall-paint-eucalyptus': wall('wall-paint-eucalyptus', 'Eucalyptus', '#8fa79a'),
  'wall-paint-teal': wall('wall-paint-teal', 'Teal', '#3f6b6a'),
  'wall-paint-petrol': wall('wall-paint-petrol', 'Petrol blue', '#345a66'),
  'wall-paint-denim': wall('wall-paint-denim', 'Denim', '#5a7088'),
  'wall-paint-lavender': wall('wall-paint-lavender', 'Lavender', '#b3aac4'),
  'wall-paint-mauve': wall('wall-paint-mauve', 'Mauve', '#9a7d86'),
  'wall-paint-dusty-rose': wall('wall-paint-dusty-rose', 'Dusty rose', '#c9a0a0'),
  'wall-paint-stone-grey': wall('wall-paint-stone-grey', 'Stone grey', '#a8a6a1'),
  'wall-paint-slate': wall('wall-paint-slate', 'Slate', '#6a6f76'),
  'wall-paint-graphite': wall('wall-paint-graphite', 'Graphite', '#454a50'),
  'wall-paint-ink': wall('wall-paint-ink', 'Ink', '#2b3340'),

  // Wallpapers — tone-on-tone vertical stripe + natural grasscloth weave.
  'wall-stripe-greige': wallpaper('wall-stripe-greige', 'Striped greige', '#cfc7ba', 'stripe'),
  'wall-stripe-sage': wallpaper('wall-stripe-sage', 'Striped sage', '#aebaa6', 'stripe'),
  'wall-stripe-blue': wallpaper('wall-stripe-blue', 'Striped blue', '#9fb1c4', 'stripe'),
  'wall-grasscloth-natural': wallpaper(
    'wall-grasscloth-natural',
    'Grasscloth natural',
    '#cdbf9e',
    'grasscloth',
  ),
  'wall-grasscloth-olive': wallpaper(
    'wall-grasscloth-olive',
    'Grasscloth olive',
    '#9a9466',
    'grasscloth',
  ),
  'wall-grasscloth-charcoal': wallpaper(
    'wall-grasscloth-charcoal',
    'Grasscloth charcoal',
    '#5a5852',
    'grasscloth',
  ),
  // Exposed-brick accent walls (running bond + recessed mortar).
  'wall-brick-red': wallpaper('wall-brick-red', 'Exposed brick', '#9c5a44', 'brick'),
  'wall-brick-white': wallpaper('wall-brick-white', 'White-washed brick', '#d9d3c8', 'brick'),
  'wall-brick-charcoal': wallpaper('wall-brick-charcoal', 'Charcoal brick', '#55504c', 'brick'),
  // Glossy subway/metro tile — the classic kitchen-backsplash + bathroom finish.
  // Smaller uvScale than wallpaper so the running-bond tiles read at metro size.
  'wall-subway-white': {
    id: 'wall-subway-white',
    name: 'Subway tile (white)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'subway',
    swatch: '#eceae4',
    uvScale: [0.7, 0.7],
  },
  'wall-subway-sage': {
    id: 'wall-subway-sage',
    name: 'Subway tile (sage)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'subway',
    swatch: '#b3bca9',
    uvScale: [0.7, 0.7],
  },
  // ── SNV 4-room HDB wall tiles (assets/guidelines/specs.png) ────────────────
  // Glazed porcelain wall tile, 300×600 — same `porcelain` painter/uvScale
  // derivation as `floor-tile-bath-green` above (0.6 × 0.3 m tile → [1.2, 1.2]),
  // distinct from the [0.7, 0.7] small-metro `wall-subway-*` pair.
  'wall-tile-white': {
    id: 'wall-tile-white',
    name: 'Glazed porcelain tile (white, 300×600)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'porcelain',
    swatch: '#eddfc4',
    uvScale: [1.2, 1.2],
    moduleMm: [300, 600],
  },
  'wall-tile-grey': {
    id: 'wall-tile-grey',
    name: 'Glazed porcelain tile (grey, 300×600)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'porcelain',
    swatch: '#c9cac6',
    uvScale: [1.2, 1.2],
    moduleMm: [300, 600],
  },
  // Fluted / reeded feature-wall panels (close-packed rounded ribs).
  'wall-fluted-oak': {
    id: 'wall-fluted-oak',
    name: 'Fluted oak panel',
    category: 'wall',
    kind: 'procedural',
    pattern: 'fluted',
    swatch: '#b88f5d',
    uvScale: [0.8, 0.8],
  },
  'wall-fluted-walnut': {
    id: 'wall-fluted-walnut',
    name: 'Fluted walnut panel',
    category: 'wall',
    kind: 'procedural',
    pattern: 'fluted',
    swatch: '#6b4428',
    uvScale: [0.8, 0.8],
  },
  'wall-fluted-white': {
    id: 'wall-fluted-white',
    name: 'Fluted plaster (white)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'fluted',
    swatch: '#e8e4dc',
    uvScale: [0.8, 0.8],
  },
  // Microcement / concrete accent walls (smooth, large-scale tiling).
  'wall-concrete-light': {
    id: 'wall-concrete-light',
    name: 'Microcement (light)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#cbc6bd',
    uvScale: [3, 3],
  },
  'wall-concrete-grey': {
    id: 'wall-concrete-grey',
    name: 'Microcement (grey)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#9d9a95',
    uvScale: [3, 3],
  },
  'wall-concrete-charcoal': {
    id: 'wall-concrete-charcoal',
    name: 'Microcement (charcoal)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'concrete',
    swatch: '#54524f',
    uvScale: [3, 3],
  },
  // Limewash / mineral-wash paint — soft cloudy tonal wash ("quiet luxury").
  // A distinct matte-paint patina, tiled broad like plaster.
  'wall-limewash-white': {
    id: 'wall-limewash-white',
    name: 'Limewash (soft white)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'limewash',
    swatch: '#e8e6dd',
    uvScale: [2.5, 2.5],
  },
  'wall-limewash-greige': {
    id: 'wall-limewash-greige',
    name: 'Limewash (greige)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'limewash',
    swatch: '#cdc6b8',
    uvScale: [2.5, 2.5],
  },
  'wall-limewash-clay': {
    id: 'wall-limewash-clay',
    name: 'Limewash (clay)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'limewash',
    swatch: '#bf8a6f',
    uvScale: [2.5, 2.5],
  },
  'wall-limewash-terracotta': {
    id: 'wall-limewash-terracotta',
    name: 'Limewash (terracotta)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'limewash',
    swatch: '#a8603f',
    uvScale: [2.5, 2.5],
  },
  // Peranakan majolica as a backsplash / feature-wall accent (same painter as
  // the floor tiles; tighter tiling for a wall).
  'wall-peranakan-jade': {
    id: 'wall-peranakan-jade',
    name: 'Peranakan tile (jade)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'peranakan',
    swatch: '#3f7d6a',
    uvScale: [0.4, 0.4],
  },
  'wall-peranakan-cobalt': {
    id: 'wall-peranakan-cobalt',
    name: 'Peranakan tile (cobalt)',
    category: 'wall',
    kind: 'procedural',
    pattern: 'peranakan',
    swatch: '#2f4d8a',
    uvScale: [0.4, 0.4],
  },
  // Board-and-batten panelling (vertical raised battens), tiles ~1.2 m wide.
  'wall-batten-white': wallpaper(
    'wall-batten-white',
    'Board & batten (white)',
    '#eceae3',
    'batten',
  ),
  'wall-batten-sage': wallpaper('wall-batten-sage', 'Board & batten (sage)', '#9aa88f', 'batten'),
  'wall-batten-navy': wallpaper('wall-batten-navy', 'Board & batten (navy)', '#3c4a60', 'batten'),
}

export const DEFAULT_FLOOR: MaterialId = 'floor-wood-oak'
export const DEFAULT_WALL: MaterialId = 'wall-paint-white'

/** Move-in-ready finishes per room, matching the Serangoon North Vista (SNV)
 *  4-room HDB sales/handover spec (assets/guidelines/specs.png): timber-look
 *  vinyl strips through the living/dining/bedrooms/corridor, beige glazed
 *  porcelain in the kitchen + household shelter + service yard, mottled
 *  grey-green glazed porcelain in both bathrooms. Rooms not listed fall back
 *  to DEFAULT_FLOOR. */
export const DEFAULT_ROOM_FLOOR: Partial<Record<RoomId, MaterialId>> = {
  mainBedroom: 'floor-vinyl-oak',
  bedroom2: 'floor-vinyl-oak',
  bedroom3: 'floor-vinyl-oak',
  livingDining: 'floor-vinyl-oak',
  corridor: 'floor-vinyl-oak',
  kitchen: 'floor-tile-beige',
  bath1: 'floor-tile-bath-green',
  bath2: 'floor-tile-bath-green',
  // 300×300 per the SNV sample board (kitchen keeps the 600×600 format).
  householdShelter: 'floor-tile-beige-300',
  serviceYard: 'floor-tile-beige-300',
  acLedge: 'floor-concrete',
}

/** SNV spec wall finishes: glazed porcelain wall tile in the kitchen AND both
 *  bathrooms — the sample boards (SNV-BOARDS) show a white-cream wall tile in
 *  the bathroom too, not the grey the earlier guess used; everything else
 *  stays painted plaster (skim-coat + paint, per spec), i.e. `DEFAULT_WALL`.
 *  `wall-tile-grey` stays in the catalog as an option.
 *
 *  **`livingDining` no longer overrides to `wall-paint-warm` (WARM-WALL-CAST).**
 *  That cream (#e9d8c4, HSV saturation 0.16) was a legacy override, not a spec
 *  finish — HDB hands a flat over skim-coated and painted off-white. It was also
 *  the largest single surface in the app: `scripts/dev-probes/chroma-audit.mjs`
 *  measured it covering **21.8% of the living-room walk view and 33.6% of the
 *  dining view**, more than any other material. And it was the measured reason
 *  the picture was more colourful than anything in it — at 09:00/Medium the
 *  highest-coverage surfaces all sit at 0.00–0.22 saturation, yet the rendered
 *  frame carried mean chroma 0.206 with 14.6% of pixels above 0.35. A cream wall
 *  under a warm morning illuminant is orange twice over, and an overall colour
 *  cast on the neutral surfaces is the most reliable giveaway that an image was
 *  rendered rather than photographed. Dropping the override
 *  (`scripts/dev-probes/warm-cast.mjs`, walk/Medium/09:00) took mean chroma
 *  **0.206 → 0.180** and pixels above 0.35 saturation **14.6% → 11.1%**, with
 *  contrast (σ) unchanged at 54.8 → 54.5 and the clipped fraction flat at ~1.9%.
 *  For contrast, forcing the sun/hemisphere/ambient colours to neutral white in
 *  the same run moved it only 0.206 → 0.203 — so the cast lived in the FINISH,
 *  not in the light, and the day/night warmth that carries time-of-day is
 *  untouched. `wall-paint-warm` remains in the catalog and in the style presets
 *  (Warm Minimal, Japandi, …), where a user is choosing it deliberately. */
export const DEFAULT_ROOM_WALL: Partial<Record<RoomId, MaterialId>> = {
  bath1: 'wall-tile-white',
  bath2: 'wall-tile-white',
  kitchen: 'wall-tile-white',
}

export const BUILTIN_MATERIALS_BY_CATEGORY: Readonly<Record<MaterialCategory, MaterialDef[]>> =
  Object.freeze(
    (Object.values(BUILTIN_MATERIALS) as MaterialDef[]).reduce(
      (acc, m) => {
        if (!acc[m.category]) acc[m.category] = []
        acc[m.category].push(m)
        return acc
      },
      {} as Record<MaterialCategory, MaterialDef[]>,
    ),
  )
