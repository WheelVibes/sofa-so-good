/**
 * Interior-design clearance & space-planning rules, in metres.
 *
 * Sourced from standard residential space-planning guides (see
 * docs/interior-design-guidelines.md). These are the single source of truth
 * for furniture spacing across the app — the auto-arranger and any future
 * default/preset authoring should reference them rather than hard-coding gaps.
 */
export const CLEARANCE = {
  /** Main circulation path between large pieces — ideal vs. tight minimum. */
  walkwayIdeal: 0.9,
  walkwayMin: 0.6,
  /** A through-passage / doorway route people walk single-file. */
  passage: 0.75,
  /** Sofa front ↔ coffee table (close enough to reach, easy to pass). */
  sofaToCoffee: 0.4,
  /** Clear floor a hinged door / drawer / cabinet front needs to open. */
  doorSwing: 0.85,
  /** Walking access around a bed (at least one long side + the foot). */
  bedSurround: 0.6,
  /** Small gap left when snapping a piece "flush" to a wall (skirting/AC). */
  wallGap: 0.05,
  /** Clear floor in front of storage so it can be opened and passed. */
  storageFront: 0.75,
} as const;

/** Comfortable TV viewing distance band for a screen of `diagonalInches`
 *  (4K rule of thumb: 1.2–1.6× the diagonal). Returns metres. */
export function tvViewingDistance(diagonalInches: number): { min: number; max: number } {
  const diagM = diagonalInches * 0.0254;
  return { min: diagM * 1.2, max: diagM * 1.6 };
}
