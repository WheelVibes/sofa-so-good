/**
 * Geometric detection of the support surface a stacked item rests on (e.g. a
 * bed frame's slatted-base plane). IKEA publishes no slat height and ships no
 * anchor data, so we derive it from the GLB mesh: a histogram of horizontal
 * triangle area by Y. The support plane is the HIGHEST Y band with substantial
 * horizontal area that lies BELOW the head/footboard region (so we pick the
 * slats, not the headboard top). Pure + unit-tested with synthetic bands; the
 * GLB→bands extraction lives in GltfModel (it needs the loaded geometry).
 */
export interface HorizontalBand {
  /** Bin centre Y in metres. */
  y: number;
  /** Summed near-horizontal triangle area (m^2) in this Y bin, interior only. */
  area: number;
}

/** Minimum horizontal area (m^2) for a band to count as a real surface. */
const MIN_AREA = 0.05;
/** Fraction of bbox height below which a surface can be the mattress support
 *  (excludes the headboard/upper structure). */
const SUPPORT_CUTOFF_FRAC = 0.6;

export function detectSupportPlaneY(bands: HorizontalBand[], bboxHeight: number): number | null {
  const cutoff = bboxHeight * SUPPORT_CUTOFF_FRAC;
  const candidates = bands.filter((b) => b.area >= MIN_AREA && b.y <= cutoff);
  if (!candidates.length) return null;
  // Return the highest Y among candidates with substantial area (the slats, not the frame edges)
  return candidates.reduce((best, b) => (b.area > best.area ? b : best)).y;
}
