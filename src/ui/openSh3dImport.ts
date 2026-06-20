/**
 * Sweet Home 3D (`.sh3d`) import entry point (DOM glue, PARITY-SH3D).
 *
 * Opens a file picker, parses the chosen `.sh3d` via the pure core
 * (`floorplan/import/sh3d.ts`), applies the resulting plan through the store
 * (`setFloorPlan`, undoable), and surfaces any furniture-mapping warnings as a
 * notification. Geometry (walls + rooms) is imported in this first slice;
 * furniture is parsed + reported but not yet placed (the warnings list tells the
 * user what was skipped).
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
import { useStore } from '../state/store'

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

  s.pushHistory()
  s.setItems([])
  s.setFloorPlan(plan)
  s.setPlanSelection(null)
  // Loading a new plan replaces the world — frame it like template loads do.
  s.requestHomeView()

  const wallCount = plan.walls.length
  const roomCount = plan.rooms.length
  const mapped = result.items.filter((i) => i.category != null).length
  const unmapped = result.items.length - mapped

  if (result.warnings.length === 0) {
    s.notify.start({
      title: `Imported “${planName}”`,
      kind: 'success',
      message: `${wallCount} walls, ${roomCount} rooms`,
    })
    return
  }

  // Geometry imported, but some furniture/elements could not be brought in.
  const id = s.notify.start({
    title: `Imported “${planName}” with notes`,
    kind: 'info',
    message:
      `${wallCount} walls, ${roomCount} rooms.` +
      (result.items.length > 0
        ? ` ${mapped} of ${result.items.length} furniture pieces recognised` +
          (unmapped > 0 ? ` (${unmapped} unmatched).` : '.')
        : ''),
    autoDismissMs: null,
  })
  // Surface each warning as an expandable detail line.
  s.notify.error(
    id,
    'Some elements need attention',
    result.warnings.slice(0, 50).map((w) => ({ name: 'Note', reason: w })),
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
