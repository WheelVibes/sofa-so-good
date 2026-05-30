/**
 * Turn a cached GLB bounding box (from GltfModel's FOOTPRINT_CACHE) into the
 * collision shape the placement system understands: a footprint (w×d×h) and a
 * floor-anchored verticalSpan. Wall/ceiling-mounted models can pass an
 * explicit base Y so their span starts where the geometry actually sits.
 */

export interface CachedBox {
  w: number;
  d: number;
  h: number;
  // ox/oz mirror the GltfModel FOOTPRINT_CACHE shape (geometric center offset
  // from the mesh origin in the XZ plane). spanFromFootprint intentionally
  // ignores them — placement.ts applies the center offset when computing the
  // OBB, so it must NOT be baked into defaultFootprint here (else it would be
  // double-counted).
  ox: number;
  oz: number;
}

export interface SpanResult {
  defaultFootprint: { w: number; d: number; h: number };
  verticalSpan: { base: number; top: number };
}

export function spanFromFootprint(box: CachedBox, opts?: { baseY?: number }): SpanResult {
  const base = opts?.baseY ?? 0;
  return {
    defaultFootprint: { w: box.w, d: box.d, h: box.h },
    verticalSpan: { base, top: base + box.h },
  };
}
