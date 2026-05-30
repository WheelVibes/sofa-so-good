/**
 * Runtime compatibility resolver for scraped IKEA metadata.
 *
 * Faithful TS port of `python/scripts/compatibility.py`. The scraper stores a
 * *category rule* on each product (its `compatibility` block) instead of a
 * frozen list of compatible article numbers. This resolves that rule against a
 * local catalog of imported IKEA groups at runtime, so matches are limited to
 * models actually present and never go stale.
 *
 * A group P is compatible with the active group A when:
 *   - one of A.compatibility.acceptsCategories matches a P category label
 *     (its breadcrumb names + typeName), by whole-phrase depluralised match
 *   - P's size matches A.compatibility.size (when both declare a size)
 * Groups with no crawled variant (no GLB) and the active group itself are skipped.
 */

import type { IkeaGltfDef } from '../types';

function norm(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Singularise each word so 'spring mattresses' == 'spring mattress'. */
function depluralize(phrase: string): string {
  return norm(phrase).split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Category labels a product can be matched against: breadcrumb names + typeName. */
export function productCategories(def: IkeaGltfDef): Set<string> {
  const labels = new Set<string>();
  for (const crumb of def.productInfo?.categoryHierarchy ?? []) labels.add(norm(crumb));
  if (def.productInfo?.typeName) labels.add(norm(def.productInfo.typeName));
  return labels;
}

/**
 * An accepted category matches a product whose category label equals it
 * (depluralised), or contains it as a whole-word leaf. Matching is on the whole
 * phrase, not loose tokens, so 'Spring mattresses' does not match a
 * 'Foam & latex mattresses' product just because both contain 'mattress'.
 */
export function categoryMatches(acceptsCategory: string, labels: Set<string>): boolean {
  const want = depluralize(acceptsCategory);
  for (const label of labels) {
    const lab = depluralize(label);
    if (want === lab) return true;
    // Allow the accepted category to be the leaf within a longer label, but
    // require a full-word boundary match (mirrors python's (?:^|\W)…(?:\W|$)).
    const re = new RegExp(`(?:^|\\W)${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`);
    if (re.test(lab)) return true;
  }
  return false;
}

function hasCrawledVariant(def: IkeaGltfDef): boolean {
  return def.variants.some((v) => v.assetId);
}

export interface CompatibleMatch {
  def: IkeaGltfDef;
  finishes: { finish: string; label: string }[];
}

/** Groups in `catalog` compatible with `active`, keyed by accepted category.
 *  Size-gated (when both declare a size); skips the active group and any group
 *  with no crawled variant. Ported from compatibility.py. */
export function resolveCompatible(
  active: IkeaGltfDef,
  catalog: IkeaGltfDef[],
): Record<string, CompatibleMatch[]> {
  const accepts = active.compatibility?.acceptsCategories ?? [];
  const wantSize = active.compatibility?.size;
  const out: Record<string, CompatibleMatch[]> = {};
  for (const cat of accepts) out[cat] = [];

  for (const def of catalog) {
    if (def.groupKey === active.groupKey) continue;
    if (!hasCrawledVariant(def)) continue;
    const labels = productCategories(def);
    const gsize = def.productInfo?.size;
    for (const cat of accepts) {
      if (!categoryMatches(cat, labels)) continue;
      if (wantSize && gsize && wantSize !== gsize) continue;
      out[cat].push({
        def,
        finishes: def.variants.filter((v) => v.assetId).map((v) => ({ finish: v.finish, label: v.label })),
      });
    }
  }
  return out;
}
