/**
 * Classifies an IKEA "Complete with" accepted-category phrase into how the
 * accepted item is physically placed relative to the base:
 *   - 'vertical' — rests ON the base's support surface (mattress on a frame).
 *   - 'around'   — placed BESIDE/around the base on the floor (chairs at a table).
 *   - 'modular'  — sofa sections that snap edge-to-edge (handled via modular
 *                  metadata, not this rule; reserved here for completeness).
 *   - null       — unclassified; callers gate the combine action off so nothing
 *                  is ever wrongly stacked.
 * Keyword table is informed by the scraper phrase index (see plan Phase 3).
 */
export type PlacementKind = 'vertical' | 'around' | 'modular';

const VERTICAL = ['mattress', 'mattresses', 'bed base', 'bed bases', 'slatted',
  'cushion', 'cushions', 'seat pad', 'pad', 'topper', 'mattress pad'];
const AROUND = ['chair', 'chairs', 'stool', 'stools', 'bench', 'benches'];

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function placementKind(acceptedCategory: string): PlacementKind | null {
  const p = norm(acceptedCategory);
  if (AROUND.some((k) => p.includes(k))) return 'around';
  if (VERTICAL.some((k) => p.includes(k))) return 'vertical';
  return null;
}
