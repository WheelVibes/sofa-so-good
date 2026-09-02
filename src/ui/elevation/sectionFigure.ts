/**
 * Bridge between the impure furniture footprint helpers and the pure section
 * core (`floorplan/section.ts`). Builds the `SectionItemInput[]` (footprint
 * corners + above-floor height) the section's furniture-silhouette projection
 * consumes, so `buildSection` itself never touches the GLB/three-tied helpers.
 * Shared by the drawing set + report so both render the same section.
 */
import { obbCorners } from '../../collision/obb'
import { itemFootprint } from '../../collision/placement'
import { itemHeight } from '../../elevation/projectElevation'
import type { SectionItemInput } from '../../floorplan/section'
import type { FurnitureDef, FurnitureItem } from '../../furniture/types'

/** Project furniture to section silhouette inputs (footprint corners + height);
 *  items with no resolvable def are skipped. */
export function sectionSilhouettes(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): SectionItemInput[] {
  const out: SectionItemInput[] = []
  for (const item of items) {
    const def = catalog[item.defId]
    if (!def?.defaultFootprint) continue
    out.push({
      id: item.id,
      label: item.label ?? def.name,
      corners: obbCorners(itemFootprint(item, def)),
      height: itemHeight(item, def),
      // Carry the storey through (F13) so a stacked section can place the piece
      // on its OWN floor; `buildSection` filters by it per level.
      ...(item.levelId ? { levelId: item.levelId } : {}),
    })
  }
  return out
}
