import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../types';

export interface DesignBlock {
  placement: 'floor' | 'wall' | 'ceiling' | 'surface';
  semantics?: {
    back_to_wall?: boolean;
    front_clearance_m?: number;
    mounted?: boolean;
    no_clip?: boolean;
  };
}

export interface PlacementFlags {
  mounted?: boolean;
  noClip?: boolean;
  verticalSpan?: { base: number; top: number };
  frontClearance?: number;
}

/** Map the scraper's functional category to the app enum. Known categories
 *  (including textiles/outdoor/electronics/kids/laundry) pass through; anything
 *  else → others/low (the catch-all for un-categorised imports). */
export function mapCategory(
  scraperCategory: string,
): { category: FurnitureCategory; confidence: 'high' | 'low' } {
  if ((FURNITURE_CATEGORIES as readonly string[]).includes(scraperCategory)) {
    return { category: scraperCategory as FurnitureCategory, confidence: 'high' };
  }
  return { category: 'others', confidence: 'low' };
}

/** Translate design.placement + semantics into collision flags. `footprint.h`
 *  lifts a ceiling item's vertical span so it hangs near the ceiling. */
export function placementFlags(
  design: DesignBlock,
  footprint?: { h: number },
): PlacementFlags {
  const out: PlacementFlags = {};
  const sem = design.semantics ?? {};
  if (design.placement === 'wall' || design.placement === 'ceiling' || sem.mounted) {
    out.mounted = true;
  }
  if (design.placement === 'ceiling') {
    // Hang from the ceiling: a default Singapore ceiling is ~2.6 m; lift the
    // base so the item sits just under it. Use a conservative base if no height.
    const h = footprint?.h ?? 0.3;
    const base = Math.max(0, 2.6 - h);
    out.verticalSpan = { base, top: base + h };
  }
  if (sem.no_clip) out.noClip = true;
  if (typeof sem.front_clearance_m === 'number' && sem.front_clearance_m > 0) {
    out.frontClearance = sem.front_clearance_m;
  }
  return out;
}

/** Display label for a finish: capitalise the first letter, keep the rest. */
export function titleCaseFinish(finish: string): string {
  if (!finish) return finish;
  return finish.charAt(0).toUpperCase() + finish.slice(1);
}
