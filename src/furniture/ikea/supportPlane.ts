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

/** Fraction of bbox height below which a surface can be the mattress support
 *  (excludes the headboard/upper structure). */
const SUPPORT_CUTOFF_FRAC = 0.6;
/** A band qualifies as a real surface if its area is at least this fraction of
 *  the largest band's area. RELATIVE (not an absolute m^2 floor) so the same
 *  threshold works on dense original geometry and sparse decimated LOD meshes. */
const AREA_FRAC = 0.3;

export function detectSupportPlaneY(bands: HorizontalBand[], bboxHeight: number): number | null {
  const maxArea = bands.reduce((m, b) => Math.max(m, b.area), 0);
  if (maxArea <= 0) return null;
  const cutoff = bboxHeight * SUPPORT_CUTOFF_FRAC;
  const candidates = bands.filter((b) => b.y <= cutoff && b.area >= maxArea * AREA_FRAC);
  if (!candidates.length) return null;
  // The mattress rests on the HIGHEST qualifying interior surface (the slat
  // plane sits above any lower structural shelf / the floor-contact feet).
  return candidates.reduce((best, b) => (b.y > best.y ? b : best)).y;
}
