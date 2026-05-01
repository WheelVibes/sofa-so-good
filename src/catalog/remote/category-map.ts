import type { FurnitureCategory } from '../../furniture/types';

const RULES: { match: RegExp; cat: FurnitureCategory }[] = [
  { match: /\b(seating|sofa|chair|bench|stool|armchair)\b/i, cat: 'seating' },
  { match: /\bbed\b/i, cat: 'beds' },
  { match: /\b(table|desk)\b/i, cat: 'tables' },
  { match: /\b(cabinet|shelf|shelves|storage|wardrobe|drawer)\b/i, cat: 'storage' },
  { match: /\b(kitchen|appliance|fridge|stove|oven)\b/i, cat: 'kitchen' },
  { match: /\b(lamp|lighting|light)\b/i, cat: 'lighting' },
];

export function mapPolyHavenFurnitureCategory(
  categories: readonly string[],
): FurnitureCategory {
  for (const c of categories) {
    for (const r of RULES) if (r.match.test(c)) return r.cat;
  }
  return 'decor';
}
