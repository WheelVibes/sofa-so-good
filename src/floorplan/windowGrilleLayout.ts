/**
 * Pure layout maths for a window's optional bar/cable/slat overlay
 * (`PlanOpening.style`, `openingStyles`) — shared by the safety `grille`
 * (chunky visible bars), `invisible-grille` (hair-thin near-transparent
 * cables), `louvre` (horizontal slats), and the sash-type family (`casement`/
 * `awning`/`hopper`/`transom`) window styles so `PlanShell`'s `FadeWindow` and
 * the curated flat's `Window.tsx` stay pure geometry description. Also hosts
 * `glassBlockInstances` (the `glass-block` glazing kind) and
 * `windowGlassKindParams` (the pure appearance params for the window GLASS
 * kind — `PlanOpening.material` reused on windows: `clear`/`frosted`/
 * `textured`/`glass-block`). Kept render-agnostic (no three/React imports) so
 * it's unit-testable without a GPU, following the furniture `slatLayout.ts`
 * pattern.
 *
 * **Frame convention for the sash/glass-block helpers below** (distinct from
 * the pre-existing grille/louvre/cable helpers above, which are already
 * fixed to `PlanShell`'s native window-local frame — position[2]/size[2] =
 * width): `sashFrameInstances`/`glassBlockInstances` use the more common
 * `x = width, y = height, z = depth (out-of-plane)` convention, matching the
 * curated flat's `Window.tsx` local frame directly (no remap needed there);
 * `PlanShell` must swap the x/z components of both `position` and `size`
 * when feeding these two into its own (x=depth, y=height, z=width) frame.
 */

/** Interior vertical count for a run of `width` spaced roughly every `pitch`
 *  metres, floored at `min` so a narrow window still reads as barred. Shared
 *  by the safety grille (chunky bars, ~0.16 m pitch) and invisible grille
 *  (hair-thin cables, ~0.10 m pitch, the denser modern convention). */
export function verticalBarCount(width: number, pitch: number, min = 2): number {
  return Math.max(min, Math.round(width / pitch))
}

/** Z-offsets (window-local, centred) of the `n-1` INTERIOR bars/cables spanning
 *  `width` in `n` equal bays — verticals sit AT the bay boundaries, excluding
 *  the two window jambs (bay 0's start and bay n's end are the frame itself,
 *  not barred). */
export function verticalBarOffsets(width: number, pitch: number, min = 2): number[] {
  const n = verticalBarCount(width, pitch, min)
  const offsets: number[] = []
  for (let i = 1; i < n; i++) offsets.push(-width / 2 + (width * i) / n)
  return offsets
}

/** Horizontal louvre-slat count for a run of `height` spaced roughly every
 *  `pitch` metres, floored at `min` (a louvre reads as slats even on a short
 *  window). */
export function louvreSlatCount(height: number, pitch: number, min = 3): number {
  return Math.max(min, Math.round(height / pitch))
}

/** Y-offsets (window-local, centred) of `n` evenly-spaced louvre slats
 *  spanning `height`, each centred in its own equal band (unlike the vertical
 *  bars, every band gets a slat — a louvre has no un-slatted top/bottom
 *  band). */
export function louvreSlatOffsets(height: number, pitch: number, min = 3): number[] {
  const n = louvreSlatCount(height, pitch, min)
  const offsets: number[] = []
  for (let i = 0; i < n; i++) offsets.push(-height / 2 + (height * (i + 0.5)) / n)
  return offsets
}

// ── Instanced-member transforms ──────────────────────────────────────────────
// Each of the three window styles collapses its identical, axis-aligned members
// (vertical bars / horizontal slats / hair-thin cables) into ONE InstancedMesh
// per window in `PlanShell`'s `FadeWindow` — the bars/cables were previously one
// `<mesh>` each. These builders describe the members render-agnostically so the
// layout stays unit-testable without a GPU (the AE=0 equivalence bar, matching
// `slatLayout.ts`). Every member is in the window-local frame (local Z = width,
// Y = height); the box/cylinder scale is `[w, h, d]` — for a cable this is the
// unit-cylinder `[radius, length, radius]`. No rotation: grille members are all
// axis-aligned in that frame, so the transform is a pure translate + scale.

/** One instanced grille member: window-local centre + box/cylinder scale.
 *  Structurally a furniture `BoxInstance` (no rotation) so `PlanShell` can feed
 *  it straight to `InstancedBoxes` / `InstancedCylinders`. */
export interface GrilleMemberInstance {
  position: [number, number, number]
  size: [number, number, number]
}

/** Visible safety-grille bar cross-section (m) — chunky, reads at a glance. */
const GRILLE_BAR_W = 0.018
const GRILLE_BAR_D = 0.012
/** Hair-thin invisible-grille cable radius (m). */
const INVISIBLE_CABLE_R = 0.004
/** Horizontal-rail pitch (m) — the SNV-approved grille design (a rectangular
 *  GRID: dense verticals + a handful of horizontal ties) spaces its rails
 *  every ~0.45 m, so a typical 1.85 m service-yard window reads 3 rails. */
const GRILLE_RAIL_PITCH = 0.45

/** Horizontal-rail count for a run of `height` spaced roughly every `pitch`
 *  metres, floored at `min` (a grid grille always reads at least a couple of
 *  ties even on a short window). */
export function horizontalRailCount(height: number, pitch: number, min = 3): number {
  return Math.max(min, Math.round(height / pitch))
}

/** Y-offsets (window-local, centred) of the `n-1` INTERIOR horizontal rails
 *  spanning `height` in `n` equal bays — mirrors `verticalBarOffsets`'s bay-
 *  boundary layout (rails sit at the bay boundaries, excluding the top/bottom
 *  frame itself). */
export function horizontalRailOffsets(height: number, pitch: number, min = 3): number[] {
  const n = horizontalRailCount(height, pitch, min)
  const offsets: number[] = []
  for (let i = 1; i < n; i++) offsets.push(-height / 2 + (height * i) / n)
  return offsets
}

/** Approved SNV grille design: a rectangular GRID — dense vertical safety
 *  bars (unchanged from the pre-existing vertical-only layout) PLUS evenly
 *  spaced horizontal rails tying them together, both in the SAME instanced
 *  bucket (mixed member sizes bake fine into one `InstancedBoxes` draw call).
 *  Each vertical bar is a `[GRILLE_BAR_W, height*0.98, GRILLE_BAR_D]` box at
 *  an interior bay boundary (byte-identical to the pre-existing vertical-only
 *  bars); each horizontal rail is a `[GRILLE_BAR_W, GRILLE_BAR_D, width*0.98]`
 *  box spanning the window's width at an interior height-bay boundary. */
export function grilleBarInstances(width: number, height: number): GrilleMemberInstance[] {
  const verticals: GrilleMemberInstance[] = verticalBarOffsets(width, 0.16).map((z) => ({
    position: [0, 0, z],
    size: [GRILLE_BAR_W, height * 0.98, GRILLE_BAR_D],
  }))
  const horizontals: GrilleMemberInstance[] = horizontalRailOffsets(height, GRILLE_RAIL_PITCH).map(
    (y) => ({
      position: [0, y, 0],
      size: [GRILLE_BAR_W, GRILLE_BAR_D, width * 0.98],
    }),
  )
  return [...verticals, ...horizontals]
}

/** Horizontal louvre slats, one `InstancedBoxes` bucket. Each slat is a
 *  `[0.05, 0.02, width*0.98]` box centred in its band. */
export function louvreSlatInstances(width: number, height: number): GrilleMemberInstance[] {
  return louvreSlatOffsets(height, 0.14).map((y) => ({
    position: [0, y, 0],
    size: [0.05, 0.02, width * 0.98],
  }))
}

/** Hair-thin invisible-grille cables, one `InstancedCylinders` bucket. Each
 *  cable scales the unit cylinder as `[radius, length, radius]` — equivalent to
 *  the old `cylinderGeometry(r, r, height*0.98, 6)` per-cable mesh. */
export function invisibleGrilleCableInstances(
  width: number,
  height: number,
): GrilleMemberInstance[] {
  return verticalBarOffsets(width, 0.1).map((z) => ({
    position: [0, 0, z],
    size: [INVISIBLE_CABLE_R, height * 0.98, INVISIBLE_CABLE_R],
  }))
}

// ── Sash-type windows (casement/awning/hopper/transom) ──────────────────────

/** Window styles that get a perimeter sash frame + (for casement) a central
 *  stile / (for transom) a top rail — the four "sash type" additions joining
 *  the pre-existing plain/grille/invisible-grille/louvre family. */
const SASH_STYLES = new Set(['casement', 'awning', 'hopper', 'transom', 'sliding'])

/** Sash frame member cross-section (m): ~45 mm wide (in the run direction the
 *  member is thin across) × 35 mm deep (out of plane) — a chunkier, warmer
 *  member than the safety-grille bars (this is the window's own sash/frame,
 *  not a security overlay). */
const SASH_FRAME_W = 0.045
const SASH_FRAME_D = 0.035

/**
 * Perimeter sash frame (4 members, corners simply overlapping like the
 * curated flat's existing outer `Bar` frame) for the sash-type window styles,
 * plus a style-specific addition: `casement` gets a central vertical stile
 * when `width > 0.8` (splitting it into two side-hinged panels); `transom`
 * gets a horizontal rail near the top (`y = height/2 − height*0.28`) framing
 * a fixed top vent pane over the main pane. `awning`/`hopper` are a single
 * sash — perimeter only. Non-sash styles (`plain`/`grille`/`louvre`/
 * `invisible-grille`, or `undefined`) return `[]`.
 *
 * Frame convention: `x = width, y = height, z = depth` (see module header) —
 * matches `Window.tsx`'s local frame directly; `PlanShell` must swap x/z.
 */
export function sashFrameInstances(
  width: number,
  height: number,
  style: string | undefined,
): GrilleMemberInstance[] {
  if (!style || !SASH_STYLES.has(style)) return []
  const inset = SASH_FRAME_W / 2
  const out: GrilleMemberInstance[] = [
    { position: [0, height / 2 - inset, 0], size: [width, SASH_FRAME_W, SASH_FRAME_D] },
    { position: [0, -height / 2 + inset, 0], size: [width, SASH_FRAME_W, SASH_FRAME_D] },
    { position: [-width / 2 + inset, 0, 0], size: [SASH_FRAME_W, height, SASH_FRAME_D] },
    { position: [width / 2 - inset, 0, 0], size: [SASH_FRAME_W, height, SASH_FRAME_D] },
  ]
  if (style === 'casement' && width > 0.8) {
    out.push({ position: [0, 0, 0], size: [SASH_FRAME_W, height, SASH_FRAME_D] })
  }
  if (style === 'sliding') {
    // Two overlapping sashes meeting at a centre stile — drawn as one double-
    // depth central member (the overlap), the SG sliding-window norm.
    out.push({ position: [0, 0, 0], size: [SASH_FRAME_W, height, SASH_FRAME_D * 1.8] })
  }
  if (style === 'transom') {
    out.push({
      position: [0, height / 2 - height * 0.28, 0],
      size: [width, SASH_FRAME_W, SASH_FRAME_D],
    })
  }
  return out
}

/**
 * Hinge-tilt description for an "open" sash, or `null` for a style that
 * doesn't tilt (every style except `awning`/`hopper` — including the
 * casement/transom sashes, which are drawn closed). `pivotY` is the sign of
 * the hinge edge (`+1` = hinged at the top edge, `height/2`; `-1` = hinged at
 * the bottom edge, `-height/2`); `angleRad` is the open tilt about that edge.
 * `awning`: top-hinged, bottom swings OUTWARD (the tilted-open vents in the
 * reference render). `hopper`: bottom-hinged, top tips INWARD.
 */
export function sashOpenTilt(
  style: string | undefined,
): { pivotY: 1 | -1; angleRad: number } | null {
  if (style === 'awning') return { pivotY: 1, angleRad: 0.3 }
  if (style === 'hopper') return { pivotY: -1, angleRad: 0.25 }
  return null
}

/** Glass-block pitch (m) — nominal block module, incl. the mortar joint. */
const GLASS_BLOCK_PITCH = 0.2
/** Mortar joint gap (m) between adjacent blocks. */
const GLASS_BLOCK_GAP = 0.012
/** Block depth (m) — thick, translucent, load-bearing glazing unit. */
const GLASS_BLOCK_D = 0.08

/**
 * A grid of thick translucent glass blocks filling the opening (the
 * `glass-block` glazing kind) — one `InstancedBoxes` bucket. Block pitch is
 * ~0.2 m (`cols`/`rows` = `max(1, round(size/pitch))`), each cell shrunk by
 * `GLASS_BLOCK_GAP` on every side for the mortar joint. Frame convention:
 * `x = width, y = height, z = depth` (see module header).
 */
export function glassBlockInstances(width: number, height: number): GrilleMemberInstance[] {
  const cols = Math.max(1, Math.round(width / GLASS_BLOCK_PITCH))
  const rows = Math.max(1, Math.round(height / GLASS_BLOCK_PITCH))
  const cellW = width / cols
  const cellH = height / rows
  const blockW = Math.max(0, cellW - GLASS_BLOCK_GAP)
  const blockH = Math.max(0, cellH - GLASS_BLOCK_GAP)
  const out: GrilleMemberInstance[] = []
  for (let r = 0; r < rows; r++) {
    const y = -height / 2 + cellH * (r + 0.5)
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + cellW * (c + 0.5)
      out.push({ position: [x, y, 0], size: [blockW, blockH, GLASS_BLOCK_D] })
    }
  }
  return out
}

/** Pure appearance params for a window's GLASS kind (`PlanOpening.material`
 *  reused on windows — doors use the same field for leaf material, windows
 *  ignore that meaning and use this vocabulary instead): `clear` (default,
 *  the pre-existing look) / `frosted` / `textured` / `glass-block`. Consumed
 *  by both `PlanShell`'s `FadeWindow` and `Window.tsx` for the pane's
 *  color/roughness (cheap-tier opacity, physical-tier transmission cap). */
export interface WindowGlassKindParams {
  color: string
  roughness: number
  opacityCheap: number
  transmission: number
}

export function windowGlassKindParams(kind: string | undefined): WindowGlassKindParams {
  switch (kind) {
    case 'frosted':
      return { color: '#e3eaec', roughness: 0.6, opacityCheap: 0.6, transmission: 0.55 }
    case 'textured':
      return { color: '#dfe8e6', roughness: 0.75, opacityCheap: 0.55, transmission: 0.5 }
    case 'glass-block':
      return { color: '#d8e4e8', roughness: 0.35, opacityCheap: 0.45, transmission: 0.45 }
    default:
      return { color: '#bcd4e6', roughness: 0.1, opacityCheap: 0.32, transmission: 0.9 }
  }
}
