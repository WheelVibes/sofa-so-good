/**
 * Sweet Home 3D (`.sh3d`) import entry point (DOM glue, PARITY-SH3D).
 *
 * Opens a file picker, parses the chosen `.sh3d` via the pure core
 * (`floorplan/import/sh3d.ts`), then applies the result through the store in one
 * undoable step: the plan geometry (walls + rooms) via `setFloorPlan`, plus the
 * second slice — the parsed furniture resolved to catalog defs + placed
 * collision-free (`setItems`), and door/window pieces associated to the nearest
 * wall as `PlanOpening`s on the plan. Unplaceable pieces (no category match, no
 * nearby wall, overlap) surface as warnings; nothing is dropped silently.
 *
 * Shared by the desktop File menu, the mobile File sheet, and the ⌘K command so
 * the import behaviour stays in one place.
 */

import {
  importResultToFloorPlan,
  parseSh3d,
  type Sh3dImportResult,
  Sh3dParseError,
} from '../floorplan/import/sh3d'
import { resolveSh3dImport } from '../floorplan/import/sh3dPlacement'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'

/** Fresh unique id for an imported item / opening. */
function genImportId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`
}

/** Strip the extension from a file name for the plan label. */
function planNameFromFile(fileName: string): string {
  return fileName.replace(/\.sh3d$/i, '').trim() || 'Imported plan'
}

/** Apply a parsed result to the store (undoable) + report. Exposed for tests /
 *  alternate callers; the file-picker flow below wraps it. */
export function applySh3dResult(result: Sh3dImportResult, planName: string): void {
  const s = useStore.getState()
  const plan = importResultToFloorPlan(result)
  plan.name = planName

  // Resolve parsed furniture → catalog items (collision-filtered against a fresh
  // scene) and door/window pieces → wall openings, against the imported plan's
  // walls. The merged catalog (built-ins + user/IKEA + remote + packs) is what
  // the rest of the app renders, so resolved imports render unchanged.
  const catalog = buildMergedCatalog({
    userFurniture: s.userFurniture,
    resolvedRemoteFurniture: s.resolvedRemoteFurniture,
    packFurniture: s.packFurniture,
  })
  const placement = resolveSh3dImport(result.items, plan.walls, catalog, [], genImportId)
  plan.openings = placement.openings

  // One undoable step: replace the world's items + plan together.
  s.pushHistory()
  s.setItems(placement.placedFurniture)
  s.setFloorPlan(plan)
  s.setPlanSelection(null)
  // Loading a new plan replaces the world — frame it like template loads do.
  s.requestHomeView()

  const wallCount = plan.walls.length
  const roomCount = plan.rooms.length
  const furnitureItems = result.items.filter((i) => !i.opening)
  const openingItems = result.items.filter((i) => i.opening)
  const placedCount = placement.placedFurniture.length
  const openingCount = plan.openings.length
  const unmatched = furnitureItems.length - placedCount
  const allWarnings = [...result.warnings, ...placement.warnings]

  const summary =
    `${wallCount} walls, ${roomCount} rooms` +
    (furnitureItems.length > 0 ? `, ${placedCount} furniture placed` : '') +
    (openingItems.length > 0 ? `, ${openingCount} openings` : '') +
    (unmatched > 0 ? ` (${unmatched} unmatched)` : '')

  if (allWarnings.length === 0) {
    s.notify.start({ title: `Imported “${planName}”`, kind: 'success', message: summary })
    return
  }

  // Geometry imported, but some furniture/elements could not be brought in.
  const id = s.notify.start({
    title: `Imported “${planName}” with notes`,
    kind: 'info',
    message: `${summary}.`,
    autoDismissMs: null,
  })
  // Surface each warning as an expandable detail line.
  s.notify.error(
    id,
    'Some elements need attention',
    allWarnings.slice(0, 50).map((w) => ({ name: 'Note', reason: w })),
  )
}

/** Open a native file picker for a single `.sh3d`, parse + apply it. */
export function openSh3dImport(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sh3d,application/octet-stream'
  input.style.display = 'none'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    void importSh3dFile(file)
  })
  document.body.appendChild(input)
  input.click()
}

/** Read + parse + apply one `.sh3d` File (exported for direct/drag callers). */
export async function importSh3dFile(file: File): Promise<void> {
  const s = useStore.getState()
  const planName = planNameFromFile(file.name)
  const progressId = s.notify.start({ title: `Importing “${planName}”…`, kind: 'progress' })
  try {
    const buf = await file.arrayBuffer()
    const result = parseSh3d(new Uint8Array(buf), planName)
    s.notify.dismiss(progressId)
    applySh3dResult(result, planName)
  } catch (e) {
    s.notify.dismiss(progressId)
    const message =
      e instanceof Sh3dParseError
        ? e.message
        : `Could not read this .sh3d file: ${(e as Error).message}`
    s.notify.start({ title: 'Import failed', kind: 'error', message })
  }
}
