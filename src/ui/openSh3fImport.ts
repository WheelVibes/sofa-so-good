/**
 * Sweet Home 3D furniture-library (`.sh3f`) import entry point (DOM glue,
 * PARITY-SH3F).
 *
 * Opens a file picker, parses the chosen `.sh3f` via the pure core
 * (`furniture/import/sh3f.ts`), then for each catalog entry whose model is a
 * supported/convertible format resolves the model (+ its sibling MTL/textures,
 * or the nested per-model zip) to `File`s, converts it to a self-contained GLB
 * through the shared upload conversion path (`convert/convertModel` →
 * `GLTFExporter`), and persists it as a regular user furniture def
 * (`persistUserGlb`). Unsupported model formats and per-model conversion
 * failures are SKIPPED with a per-entry note and an end-of-import summary
 * ("Imported 12 of 18 — 6 skipped"). `.sh3f` content is user-supplied, so it is
 * treated like any other user upload (no bundled-asset licence/attribution).
 *
 * Shared by the desktop File menu, the mobile File sheet, and the ⌘K command so
 * the behaviour stays in one place, mirroring `openSh3dImport.ts`.
 */

import { unzipSync } from 'fflate'
import { ConvertError, convertModel } from '../furniture/convert/convertModel'
import { modelFormatFromName } from '../furniture/convert/formats'
import {
  parseSh3f,
  resolveArchivePath,
  type Sh3fEntry,
  Sh3fParseError,
  type Sh3fParseResult,
} from '../furniture/import/sh3f'
import type { FurnitureCategory } from '../furniture/types'
import { persistUserGlb } from '../furniture/upload/persist'
import { useStore } from '../state/store'

/** Fallback category for an entry we couldn't map to a real one. */
const DEFAULT_CATEGORY: FurnitureCategory = 'decor'

/** Outcome of importing one library — surfaced in the summary toast + tests. */
export interface Sh3fImportSummary {
  total: number
  imported: number
  duplicates: number
  skipped: { name: string; reason: string }[]
}

/** Strip the extension from a file name for the library label. */
export function libraryNameFromFile(fileName: string): string {
  return fileName.replace(/\.sh3f$/i, '').trim() || 'Imported library'
}

/** Build the entry `File` + sibling `File`s for one entry from the archive.
 *  A multi-part (nested-zip) model is inflated and its 3D entry chosen; a loose
 *  model gathers the other files in its archive folder as siblings (for MTL /
 *  texture resolution). Returns `null` when no loadable model is found. */
function filesForEntry(
  entry: Sh3fEntry,
  files: Record<string, Uint8Array>,
): { entryFile: File; siblings: File[] } | null {
  if (!entry.modelPath) return null
  const modelBytes = resolveArchivePath(files, entry.modelPath)
  if (!modelBytes) return null

  const isZip = entry.multiPartModel || /\.zip$/i.test(entry.modelPath)
  if (isZip) {
    let inner: Record<string, Uint8Array>
    try {
      inner = unzipSync(modelBytes)
    } catch {
      return null
    }
    const names = Object.keys(inner)
    // Prefer OBJ, else the first recognized model entry inside the bundle.
    const modelName =
      names.find((n) => modelFormatFromName(n) === 'obj') ??
      names.find((n) => modelFormatFromName(n) != null)
    if (!modelName) return null
    const toFile = (n: string) => new File([toArrayBuffer(inner[n]!)], n.split('/').pop() ?? n)
    return {
      entryFile: toFile(modelName),
      siblings: names.filter((n) => n !== modelName).map(toFile),
    }
  }

  const modelBase = (entry.modelPath.split('/').pop() ?? entry.modelPath).toLowerCase()
  const dir = entry.modelPath.includes('/')
    ? entry.modelPath.slice(0, entry.modelPath.lastIndexOf('/') + 1).toLowerCase()
    : ''
  const entryFile = new File([toArrayBuffer(modelBytes)], modelBase)
  const siblings: File[] = []
  for (const [name, bytes] of Object.entries(files)) {
    const lower = name.toLowerCase()
    const base = lower.split('/').pop() ?? lower
    if (base === modelBase) continue
    // Same folder as the model (or root-level when the model is at root).
    const nameDir = lower.includes('/') ? lower.slice(0, lower.lastIndexOf('/') + 1) : ''
    if (nameDir === dir) siblings.push(new File([toArrayBuffer(bytes)], base))
  }
  return { entryFile, siblings }
}

/** Copy a possibly-shared `Uint8Array` view into a standalone `ArrayBuffer`
 *  (fflate can return views onto a larger buffer). */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

/**
 * Convert + persist every supported entry of a parsed library. Pure of any file
 * picker / toast so tests and the dev hook can drive it directly. Commits all
 * imported defs in ONE batch (`addManyUserFurniture`) to avoid per-item catalog
 * rebuilds. Returns a summary (imported / duplicate / skipped counts).
 */
export async function importSh3fResult(result: Sh3fParseResult): Promise<Sh3fImportSummary> {
  const skipped: { name: string; reason: string }[] = []
  const pendingDefs = [] as Parameters<
    ReturnType<typeof useStore.getState>['addManyUserFurniture']
  >[0]
  let duplicates = 0

  for (const entry of result.entries) {
    if (!entry.modelFormat) {
      skipped.push({
        name: entry.name,
        reason: `unsupported model format (${entry.modelPath ?? 'none'})`,
      })
      continue
    }
    const resolved = filesForEntry(entry, result.files)
    if (!resolved) {
      skipped.push({ name: entry.name, reason: 'model file missing from the archive' })
      continue
    }
    try {
      const { glb } = await convertModel(resolved.entryFile, resolved.siblings)
      const footprint =
        entry.width != null && entry.depth != null && entry.height != null
          ? { w: entry.width, d: entry.depth, h: entry.height }
          : undefined
      const persistResult = await persistUserGlb(glb, {
        name: entry.name,
        category: entry.category ?? DEFAULT_CATEGORY,
        mounted: entry.doorOrWindow || undefined,
        footprint,
        commit: false,
      })
      if (!persistResult.ok) {
        skipped.push({ name: entry.name, reason: persistResult.reason })
      } else if (persistResult.duplicate) {
        duplicates++
      } else {
        pendingDefs.push(persistResult.def)
      }
    } catch (e) {
      const reason =
        e instanceof ConvertError ? e.message : e instanceof Error ? e.message : String(e)
      skipped.push({ name: entry.name, reason })
    }
  }

  if (pendingDefs.length > 0) useStore.getState().addManyUserFurniture(pendingDefs)

  return {
    total: result.entries.length,
    imported: pendingDefs.length,
    duplicates,
    skipped,
  }
}

/** Apply a parsed result to the store + report through the notification system.
 *  Exposed for the dev hook + alternate callers; the file-picker flow wraps it. */
export async function applySh3fResult(
  result: Sh3fParseResult,
  libraryName: string,
): Promise<Sh3fImportSummary> {
  const s = useStore.getState()
  const summary = await importSh3fResult(result)

  const parts = [`${summary.imported} of ${summary.total} imported`]
  if (summary.duplicates > 0) parts.push(`${summary.duplicates} already in library`)
  if (summary.skipped.length > 0) parts.push(`${summary.skipped.length} skipped`)
  const message = parts.join(', ')

  const allNotes = [...result.warnings, ...summary.skipped.map((sk) => `${sk.name}: ${sk.reason}`)]
  if (allNotes.length === 0) {
    s.notify.start({ title: `Imported “${libraryName}”`, kind: 'success', message })
    return summary
  }
  const id = s.notify.start({
    title: `Imported “${libraryName}” with notes`,
    kind: 'info',
    message: `${message}.`,
    autoDismissMs: null,
  })
  s.notify.error(
    id,
    'Some entries need attention',
    allNotes.slice(0, 50).map((w) => ({ name: 'Note', reason: w })),
  )
  return summary
}

/** Read + parse + apply one `.sh3f` File. */
async function importSh3fFile(file: File): Promise<void> {
  const s = useStore.getState()
  const libraryName = libraryNameFromFile(file.name)
  const progressId = s.notify.start({ title: `Importing “${libraryName}”…`, kind: 'progress' })
  try {
    const buf = await file.arrayBuffer()
    const result = parseSh3f(new Uint8Array(buf), libraryName)
    await applySh3fResult(result, libraryName)
  } catch (e) {
    const message =
      e instanceof Sh3fParseError
        ? e.message
        : `Could not read this .sh3f file: ${(e as Error).message}`
    s.notify.start({ title: 'Import failed', kind: 'error', message })
  } finally {
    s.notify.dismiss(progressId)
  }
}

/** Open a native file picker for a single `.sh3f`, parse + import it. */
export function openSh3fImport(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sh3f,application/octet-stream'
  input.style.display = 'none'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.remove()
    if (!file) return
    void importSh3fFile(file)
  })
  document.body.appendChild(input)
  input.click()
}
