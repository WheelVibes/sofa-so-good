/**
 * Classifies an IKEA "Complete with" accepted-category phrase into how the
 * accepted item is physically placed relative to the base:
 *   - 'vertical' — rests ON the base's support surface (mattress on a frame).
 *   - 'around'   — placed BESIDE/around the base on the floor (chairs at a table).
 *   - 'modular'  — sofa sections that snap edge-to-edge (handled via modular
 *                  metadata, not this rule; reserved here for completeness).
 *   - null       — unclassified; callers gate the combine action off so nothing
 *                  is ever wrongly stacked.
 * Keyword table is built from IKEA's "Complete with" category taxonomy (the same
 * phrases the scraper's phrase-index harvests). Unknown phrases stay null so an
 * unforeseen relationship is never wrongly combined.
 */
export type PlacementKind = 'vertical' | 'around' | 'modular';

// MODULAR is checked FIRST: a "corner section" contains neither chair/stool nor
// mattress keywords, but a hypothetical "section stool" should read as modular.
const MODULAR = ['section', 'sections', 'corner section', 'chaise', 'armrest'];
// VERTICAL — items that rest ON the base's support surface.
const VERTICAL = [
  'mattress', 'bed base', 'slatted', 'topper', 'mattress pad', 'mattress protector',
  'cushion', 'seat pad', 'chair pad', 'back cushion', 'seat cushion', 'pad',
  'quilt', 'pillow',
];
// AROUND — floor-standing seating placed beside/around the base (e.g. a table).
const AROUND = ['chair', 'stool', 'bench'];

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function placementKind(acceptedCategory: string): PlacementKind | null {
  const p = norm(acceptedCategory);
  if (MODULAR.some((k) => p.includes(k))) return 'modular';
  // VERTICAL before AROUND: a "chair pad" / "seat pad" rests ON a chair (vertical)
  // and contains "chair"/"seat"; bare seating phrases ("dining chairs", "stools",
  // "benches") carry no vertical keyword, so AROUND still wins for them.
  if (VERTICAL.some((k) => p.includes(k))) return 'vertical';
  if (AROUND.some((k) => p.includes(k))) return 'around';
  return null;
}
