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
  /**
   * Window sill height (metres AFL) below which an item is short enough to
   * sit in front of a window without blocking it. Matches the SG norm for a
   * standard bedroom/living casement or sliding window sill (900–1000 mm AFL —
   * see docs/interior-design-guidelines.md); a wardrobe, bookcase, or tall
   * cabinet taller than this shouldn't be pushed against a windowed wall. A
   * near-zero sill (a balcony sliding door / full-height window) is a hard
   * keep-out for every floor item regardless of height (see
   * `clearance.ts:windowFrontRects`).
   */
  windowSillTall: 0.95,
} as const

/** Fallback support-surface heights (metres) for stacking a compatible model
 *  onto a base when the base exposes no usable measurement. Keyed by the base's
 *  FurnitureCategory. `supportY` is where the BOTTOM of the stacked item rests. */
export const STACK = {
  /** Slatted-base top for a bed frame with no "Footboard height" field. */
  bedSlatDefault: 0.13,
  /** Seat height for a sofa accepting seat cushions. */
  seatDefault: 0.42,
} as const
