import { useStore } from '../../state/store'
import type { FurnitureCategory } from '../types'
import { hashFile } from './hashFile'
import { persistUserGlb } from './persist'

export interface BulkImportOptions {
  category: FurnitureCategory
  mounted?: boolean
  noClip?: boolean
  concurrency?: number
}

export interface SkippedFile {
  name: string
  reason: string
}

export interface BulkImportResult {
  total: number
  imported: number
  /** Files whose content was already in the catalog (skipped, not an error). */
  duplicates: number
  skipped: SkippedFile[]
}

interface PlannedFile {
  file: File
  errorName: string
  name: string
}

/** Imports a batch of user-selected files. Filters to .glb/.gltf, dedupes
 *  display names, and runs persistUserGlb through a bounded pool. One bad
 *  file never aborts the batch — it is recorded in `skipped`. */
export async function importGlbFiles(
  files: File[],
  opts: BulkImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkImportResult> {
  const total = files.length
  const skipped: SkippedFile[] = []
  let done = 0
  const tick = () => onProgress?.(++done, total)

  // Dedupe set is snapshotted once at call start; assumes importGlbFiles is not
  // invoked concurrently with itself (the UI enforces single-import at a time).
  const used = new Set(useStore.getState().userFurniture.map((d) => d.name))

  const planned: PlannedFile[] = []
  for (const file of files) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = relPath || file.name
    if (!isModelFile(path)) {
      skipped.push({ name: file.name, reason: 'not-a-model' })
      tick()
      continue
    }
    // When a folder-pick gives us a path like "folder/sub/Name.glb", the
    // browser may expose the blob under a generic name without the extension.
    // Reconstruct a File with the correct basename so validateGlbFile's
    // extension check works, then persist under the derived display name.
    const basename = path.split('/').pop() ?? file.name
    const fileForPersist =
      relPath && file.name !== basename
        ? new File([file], basename, { type: file.type, lastModified: file.lastModified })
        : file
    planned.push({
      file: fileForPersist,
      errorName: basename,
      name: dedupeName(modelName(path), used),
    })
  }

  let imported = 0
  let duplicates = 0
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  let cursor = 0
  // Hashes already imported THIS batch — guards the concurrent race where two
  // identical files both pass persist's not-yet-committed existence check.
  const seenHashes = new Set<string>()

  async function worker(): Promise<void> {
    while (cursor < planned.length) {
      const job = planned[cursor++]
      try {
        const contentHash = await hashFile(job.file)
        if (seenHashes.has(contentHash)) {
          duplicates++
          tick()
          continue
        }
        seenHashes.add(contentHash)
        const result = await persistUserGlb(job.file, {
          name: job.name,
          category: opts.category,
          mounted: opts.mounted,
          noClip: opts.noClip,
          contentHash,
        })
        if (result.ok && result.duplicate) duplicates++
        else if (result.ok) imported++
        else skipped.push({ name: job.errorName, reason: result.reason })
      } catch (e) {
        skipped.push({ name: job.errorName, reason: e instanceof Error ? e.message : String(e) })
      }
      tick()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, planned.length) }, () => worker()))

  return { total, imported, duplicates, skipped }
}

/** True when the basename ends in .glb or .gltf (case-insensitive). */
export function isModelFile(nameOrPath: string): boolean {
  return /\.(glb|gltf)$/i.test(nameOrPath)
}

/** Basename without the .glb/.gltf extension, for the catalog display name.
 *  Falls back to the basename with extension if stripping leaves an empty string. */
export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  const stripped = base.replace(/\.(glb|gltf)$/i, '')
  return stripped || base
}

/** Returns `base`, or `base (2)`, `base (3)`… if already in `used`.
 *  Mutates `used` to reserve whatever it returns. */
export function dedupeName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let n = 2
  while (used.has(`${base} (${n})`)) n++
  const result = `${base} (${n})`
  used.add(result)
  return result
}
