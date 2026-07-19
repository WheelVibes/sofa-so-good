/**
 * Pure layout maths for a window's optional bar/cable/slat overlay
 * (`PlanOpening.style`, `openingStyles`) — shared by the safety `grille`
 * (chunky visible bars), `invisible-grille` (hair-thin near-transparent
 * cables), and `louvre` (horizontal slats) window styles so `PlanShell`'s
 * `FadeWindow` stays pure geometry description. Kept render-agnostic (no
 * three/React imports) so it's unit-testable without a GPU, following the
 * furniture `slatLayout.ts` pattern.
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

/** Chunky vertical safety-grille bars, one `InstancedBoxes` bucket. Each bar is
 *  a `[GRILLE_BAR_W, height*0.98, GRILLE_BAR_D]` box at the interior bay
 *  boundary — byte-identical to the old per-bar mesh. */
export function grilleBarInstances(width: number, height: number): GrilleMemberInstance[] {
  return verticalBarOffsets(width, 0.16).map((z) => ({
    position: [0, 0, z],
    size: [GRILLE_BAR_W, height * 0.98, GRILLE_BAR_D],
  }))
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
