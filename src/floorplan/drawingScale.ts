/**
 * Pure scale-selection helper for the drawing set (TODO G2 — locked drawing
 * scale). Real construction drawings are printed at one stated, LOCKED ratio
 * from a standard ladder — never an arbitrary fit-to-page zoom — so a
 * contractor can measure straight off the paper with a scale rule. This picks
 * the largest-detail (smallest ratio number) standard ratio whose printed
 * extent still fits the sheet's printable area at the declared paper size.
 *
 * No I/O, no store references — pure math, easy to unit test in isolation.
 */

/** Standard architectural scale ratios used in SG interior-design practice
 *  (ascending by ratio number = descending by printed size). 1:20 is the
 *  most detailed/largest drawing; 1:200 the most zoomed-out. */
export const STANDARD_SCALE_RATIOS = [20, 25, 50, 75, 100, 125, 150, 200] as const

export interface PrintableAreaMm {
  /** Usable width in mm. */
  width: number
  /** Usable height in mm. */
  height: number
}

export interface DrawingScale {
  /** The chosen ratio's denominator, e.g. `50` for "1:50". */
  ratio: number
  /** mm printed per metre of real-world extent (`1000 / ratio`). */
  mmPerM: number
  /** Title-block label, e.g. `"1:50"`. */
  label: string
}

/** ISO 216 "A" series paper sizes the drawing set supports, portrait `[width,
 *  height]` in mm (swap for landscape). Single source of truth for both the
 *  scale-picker's printable-area math below AND `ui/drawingSet.ts`'s `@page`/
 *  sheet-box CSS, so the two can never drift apart. */
export const PAPER_SIZE_MM: Record<'a4' | 'a3' | 'a2' | 'a1', [width: number, height: number]> = {
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  a1: [594, 841],
}

/** `@page` margin (mm, each side) — matches `ui/drawingSet.ts`'s `@page { margin: … }`. */
export const PAGE_MARGIN_MM = 10
/** Sheet box inner padding (mm, each side) — matches `.sheet { padding: … }`. */
export const SHEET_PADDING_MM = 8
/** Vertical room reserved below the drawing area for the title block + gap
 *  (mm) — matches the empirically-sized `.draw svg { max-height: 150mm }`
 *  budget this table reproduces for A4 landscape (210mm page height − 2×10mm
 *  margin − 2×8mm padding − 24mm reserve = 150mm). */
export const TITLE_BLOCK_RESERVE_MM = 24

/** Real paper dimensions (mm) for a size + orientation — width is the long
 *  edge in landscape, the short edge in portrait. */
export function paperDimensionsMm(
  size: keyof typeof PAPER_SIZE_MM,
  orientation: 'landscape' | 'portrait',
): { widthMm: number; heightMm: number } {
  const [w, h] = PAPER_SIZE_MM[size]
  return orientation === 'landscape' ? { widthMm: h, heightMm: w } : { widthMm: w, heightMm: h }
}

/** Printable area (mm) for a paper size + orientation, derived from
 *  `paperDimensionsMm` minus the `@page` margin, sheet padding, and the
 *  title-block reserve (height only) — the single formula behind every
 *  entry in {@link PAPER_PRINTABLE_MM}. */
export function printableAreaMm(
  size: keyof typeof PAPER_SIZE_MM,
  orientation: 'landscape' | 'portrait',
): PrintableAreaMm {
  const { widthMm, heightMm } = paperDimensionsMm(size, orientation)
  const margin = (PAGE_MARGIN_MM + SHEET_PADDING_MM) * 2
  return {
    width: widthMm - margin,
    height: heightMm - margin - TITLE_BLOCK_RESERVE_MM,
  }
}

/** Printable area (mm) for every supported paper size × orientation combo —
 *  precomputed so callers don't have to re-derive it (used by `drawingSet.ts`
 *  + tests). Keyed `"<size>-<orientation>"`, e.g. `"a3-landscape"`. */
export const PAPER_PRINTABLE_MM: Record<string, PrintableAreaMm> = Object.fromEntries(
  (Object.keys(PAPER_SIZE_MM) as (keyof typeof PAPER_SIZE_MM)[]).flatMap((size) =>
    (['landscape', 'portrait'] as const).map((orientation) => [
      `${size}-${orientation}`,
      printableAreaMm(size, orientation),
    ]),
  ),
)

/**
 * A4-landscape printable area for the drawing set's `.draw` region — the
 * default paper/orientation, kept as a named constant (equal to
 * `PAPER_PRINTABLE_MM['a4-landscape']`) for callers/tests that don't need to
 * think about paper choice.
 */
export const A4_LANDSCAPE_PRINTABLE_MM: PrintableAreaMm = printableAreaMm('a4', 'landscape')

/**
 * Minimum printed radius (mm) for a fixed-pixel MEP/RCP plan symbol. At the
 * smallest paper formats (A4 at 1:100/1:125) the locked scale shrinks the
 * fixed-px symbols below comfortable on-screen/print legibility (contractor
 * re-review P3); this is the floor the symbol size is bumped up to hit.
 */
const MIN_SYMBOL_PRINT_MM = 1.7

/**
 * Scale factor (≥ 1) to apply to a fixed-pixel symbol so it prints at least
 * {@link MIN_SYMBOL_PRINT_MM}. A symbol of `basePx` radius in an SVG whose
 * internal px→metre scale is `pxPerM` prints at `basePx × printMmPerM / pxPerM`
 * mm; when that falls below the floor the factor scales it up, otherwise it's
 * exactly 1 (never shrinks a symbol, and always 1 in screen/non-print mode
 * where `printMmPerM` is undefined). Larger paper picks a bigger `printMmPerM`
 * so the floor only ever bites on the small (A4) formats. Pure.
 */
export function symbolPrintScale(basePx: number, pxPerM: number, printMmPerM?: number): number {
  if (printMmPerM == null || !(pxPerM > 0) || !(basePx > 0)) return 1
  const printedMm = (basePx * printMmPerM) / pxPerM
  return printedMm >= MIN_SYMBOL_PRINT_MM ? 1 : MIN_SYMBOL_PRINT_MM / printedMm
}

/**
 * Pick the largest-detail standard ratio (smallest number) from
 * {@link STANDARD_SCALE_RATIOS} whose printed extent — `extentM` scaled by
 * `1000 / ratio` mm-per-metre — still fits within `printableMm` on both
 * axes. Falls back to the smallest-detail ratio (`1:200`, the closest
 * available approximation) when even that overflows (an unusually large
 * plan/extent) — the caller still gets a locked, stated ratio, just not one
 * that's guaranteed to fit.
 */
export function pickDrawingScale(
  extentM: { w: number; d: number },
  printableMm: PrintableAreaMm = A4_LANDSCAPE_PRINTABLE_MM,
): DrawingScale {
  const toScale = (ratio: number): DrawingScale => ({
    ratio,
    mmPerM: 1000 / ratio,
    label: `1:${ratio}`,
  })
  for (const ratio of STANDARD_SCALE_RATIOS) {
    const mmPerM = 1000 / ratio
    const printedW = extentM.w * mmPerM
    const printedH = extentM.d * mmPerM
    if (printedW <= printableMm.width && printedH <= printableMm.height) {
      return toScale(ratio)
    }
  }
  return toScale(STANDARD_SCALE_RATIOS[STANDARD_SCALE_RATIOS.length - 1])
}
