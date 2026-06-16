/**
 * Hand-authored starter floor plans, selectable in the editor so the user can
 * begin from a sensible apartment shell instead of a blank box. Each is a
 * complete, self-consistent FloorPlan (perimeter + partitions + rooms +
 * openings) with clean orthogonal walls.
 *
 * The plan builders live in co-located modules — `templates/hdb.ts` (HDB flat
 * types), `templates/condo.ts` (condominium / landed), and `templates/shared.ts`
 * (the geometry helpers they share). This file is the registry: it assembles
 * `PLAN_TEMPLATES` and derives the picker's category tree.
 */
import {
  condo1Bed,
  condo1Study,
  condo2Bed,
  condo3Bed,
  condo4Bed,
  condoPenthouse,
  condoStudio,
  condoTerrace,
  loft,
  oneBed,
  studio,
} from './templates/condo'
import {
  hdb2Room,
  hdb3Gen,
  hdb3Room,
  hdb4Room,
  hdb5Room,
  hdbExecutive,
  hdbJumbo,
  hdbMaisonette,
} from './templates/hdb'
import { cat } from './templates/shared'
import type { FloorPlan, HousingType } from './types'

export const PLAN_TEMPLATES: FloorPlan[] = [
  // HDB — grouped by BTO/estate project name. The 4-Room is the app default.
  cat(hdb2Room(), 'HDB', 'Tampines GreenVerge', '2-Room Flexi'),
  cat(hdb3Room(), 'HDB', 'Tampines GreenVerge', '3-Room'),
  cat(hdb4Room(), 'HDB', 'Serangoon North Vista', '4-Room'),
  cat(hdb5Room(), 'HDB', 'Serangoon North Vista', '5-Room'),
  cat(hdbExecutive(), 'HDB', 'Bishan Ridges', 'Executive Apartment'),
  cat(hdb3Gen(), 'HDB', 'Punggol Point Cove', '3Gen'),
  cat(hdbJumbo(), 'HDB', 'Bishan Ridges', 'Jumbo'),
  cat(hdbMaisonette(), 'HDB', 'Bishan Ridges', 'Executive Maisonette'),
  // Condominium / landed — grouped by development.
  cat(studio(), 'Condominium', 'The Sail @ Marina Bay', 'Studio'),
  cat(oneBed(), 'Condominium', 'The Sail @ Marina Bay', '1-Bedroom'),
  cat(loft(), 'Condominium', 'Sky Habitat', 'Loft'),
  cat(condo1Bed(), 'Condominium', 'Sky Habitat', '1-Bedroom'),
  cat(condo1Study(), 'Condominium', 'Sky Habitat', '1+Study'),
  cat(condo2Bed(), 'Condominium', "d'Leedon", '2-Bedroom'),
  cat(condo3Bed(), 'Condominium', "d'Leedon", '3-Bedroom'),
  cat(condo4Bed(), 'Condominium', "d'Leedon", '4-Bedroom'),
  cat(condoStudio(), 'Condominium', "d'Leedon", 'Studio'),
  cat(condoPenthouse(), 'Condominium', 'Marina One Residences', 'Penthouse'),
  cat(condoTerrace(), 'Condominium', 'Landed Terraces', 'Terrace House'),
]

/** Build the housing-type → project → templates tree for the cascading picker.
 *  Insertion order of `PLAN_TEMPLATES` is preserved at every level. Templates
 *  without a category (shouldn't happen for built-ins) are skipped. Pure +
 *  unit-tested. */
export function templateCategoryTree(
  templates: FloorPlan[] = PLAN_TEMPLATES,
): Map<HousingType, Map<string, FloorPlan[]>> {
  const tree = new Map<HousingType, Map<string, FloorPlan[]>>()
  for (const t of templates) {
    if (!t.category) continue
    const { housingType, projectName } = t.category
    let projects = tree.get(housingType)
    if (!projects) {
      projects = new Map<string, FloorPlan[]>()
      tree.set(housingType, projects)
    }
    const list = projects.get(projectName)
    if (list) list.push(t)
    else projects.set(projectName, [t])
  }
  return tree
}
