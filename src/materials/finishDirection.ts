/**
 * Does a finish have a DIRECTION — a grain, a plank run, a course, a stripe?
 *
 * The RD-406 repetition break-up hides tiling by giving each tile cell a
 * deterministic quarter-turn (0/90/180/270°). That is right for a material with
 * no orientation — terrazzo, concrete, carpet, a square ceramic tile — and
 * WRONG for one that has: rotating a plank floor 90° every other cell lays the
 * planks across each other in a patchwork, and a running-bond tile ends up
 * bonding vertically in places. Real floors are laid in ONE direction; only the
 * end stagger varies.
 *
 * So the break-up asks here first. Directional finishes keep their orientation
 * (rotations limited to 180°, which leaves a plank running the same way while
 * still re-phasing the cell); isotropic ones get the full quarter-turn set.
 *
 * **The answer is MEASURED from the texture** (`analyzeTextureDirection.ts` →
 * `textureDirection.ts`): gradient coherence says whether the pattern has a
 * dominant direction, and an axis-period comparison says whether its lattice is
 * square. That covers every finish the app can show — including ones that do
 * not exist yet: a new pattern, a fresh ambientCG scan, a user upload — with no
 * list to maintain.
 *
 * The pattern table below is only the FALLBACK for when the pixels cannot be
 * read (no 2D context in tests/SSR, an image still decoding, a tainted
 * cross-origin canvas). It is a prior, not the source of truth; adding a
 * material needs no entry here.
 *
 * The safe answer for anything unrecognised is "directional": a needless
 * 180°-only cell is invisible, a wrongly rotated plank is not.
 *
 * Pure data + predicates. No three, no React.
 */

import type { MeshStandardMaterial } from 'three'
import { measuredQuarterTurnSafe } from './analyzeTextureDirection'
import type { MaterialDef, ProceduralPattern } from './types'

/**
 * Patterns a quarter-turn cannot spoil, because they have no lay direction at
 * all (a random aggregate or noise field) or a square 4-fold grid where a 90°
 * turn maps the pattern onto itself.
 *
 * Everything else is directional and only ever gets a 180° turn. Grounded in
 * how these materials are actually installed:
 *  - **Plank floors (wood, vinyl) run one way across the whole floor** —
 *    parallel to the longest wall, the light source, or perpendicular to the
 *    joists; changing direction between adjacent rooms is called out as a
 *    mistake, not a texture trick. What varies is the END STAGGER, which is
 *    exactly what the sub-tile offset gives us. A 180° turn is fine: a board
 *    can be laid either end first.
 *  - **Rectangular tile is laid to the arrow on its back.** Directional tiles
 *    are packed with an orientation arrow precisely so the whole floor reads
 *    one way; installers are told to check batches for tiles packed rotated.
 *    Even "random-look" ranges get their randomness from mixing FACES across
 *    boxes, not from rotating tiles on the floor.
 *  - So `brick`/`subway`/`porcelain`/`porcelainStone` (running-bond, 300×600),
 *    `stoneTile` (striated), `marble` (veined — veined stone is laid to a vein
 *    direction), `parquet`/`herringbone`, `stripe`/`grasscloth`/`batten`/
 *    `fluted` all stay directional. `hexagon` too: a hex lattice survives 180°
 *    but not 90°.
 */
export const ISOTROPIC_PATTERNS: ReadonlySet<ProceduralPattern> = new Set<ProceduralPattern>([
  'terrazzo',
  'concrete',
  'carpet',
  'plaster',
  'limewash',
  'tile',
  'checker',
  'peranakan',
])

/**
 * The fallback verdict from the pattern table — used only when the texture
 * cannot be measured. A textured (photo) finish has no pattern label to reason
 * from, so it takes the safe path.
 */
export function patternAllowsQuarterTurns(
  def: Pick<MaterialDef, 'kind'> & { pattern?: string },
): boolean {
  if (def.kind !== 'procedural' || !def.pattern) return false
  return ISOTROPIC_PATTERNS.has(def.pattern as ProceduralPattern)
}

/**
 * May the break-up turn this finish's cells by a quarter turn?
 *
 * Measured from the material's own albedo when it can be read — so a finish
 * added tomorrow is classified by what it looks like, not by an entry someone
 * remembered to add — and only otherwise from the pattern prior above.
 */
export function allowsQuarterTurns(
  def: Pick<MaterialDef, 'kind'> & { pattern?: string },
  material?: MeshStandardMaterial | null,
): boolean {
  const measured = measuredQuarterTurnSafe(material)
  return measured ?? patternAllowsQuarterTurns(def)
}
