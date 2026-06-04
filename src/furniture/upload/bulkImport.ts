import { useStore } from '../../state/store'
import { convertModel, needsConversion } from '../convert/convertModel'
import { detectModelFormat, isModelEntryFile } from '../convert/formats'
import { runOptimize } from '../optimize/runOptimize'
import type { FurnitureCategory, UserGltfDef } from '../types'
import { hashFile } from './hashFile'
import { inferCollisionFlags } from './inferFlags'
import { persistUserGlb } from './persist'

/** How many built defs to commit to the store per write during a bulk import.
 *  One catalog rebuild per batch instead of per file — keeps the main thread
 *  responsive so a huge import can't starve the render loop / WebGL context. */
export const COMMIT_BATCH = 25

export interface BulkImportOptions {
  category: FurnitureCategory
  mounted?: boolean
  noClip?: boolean
  /** Infer mounted/noClip per file from its name (OR'd with the batch flags),
   *  so a mixed folder gets sensible per-item collision without manual tagging. */
  autoFlags?: boolean
  concurrency?: number
  /** Every dropped file, for sibling (.mtl/.bin/texture) resolution when a
   *  non-GLB model references external files. Defaults to the imported files. */
  allFiles?: File[]
  /** Opt-in KTX2/UASTC texture encode (falls back to WebP if unavailable). */
  ktx2?: boolean
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
  /** Folder prefix of the original path (with trailing slash; '' if top-level),
   *  used to scope sibling resolution for multi-file model formats. */
  dir: string
}

/** Folder prefix (with trailing slash) of a path; '' if none. */
function dirOfPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

function pathOfFile(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
}

/**
 * Convert (if needed) + optimize a single entry file into an optimized GLB File.
 * GLB/glTF entries skip conversion but still run the optimize pass; non-GLB
 * formats convert to GLB first (resolving .mtl/.bin/textures from `allFiles`
 * within the same folder). Quality-first: codec compression, no decimation.
 */
async function prepareGlb(
  entry: File,
  dir: string,
  allFiles: File[],
  ktx2: boolean,
): Promise<File> {
  const format = await detectModelFormat(entry)
  let glb = entry
  if (format && needsConversion(format)) {
    const siblings = allFiles.filter((f) => f !== entry && dirOfPath(pathOfFile(f)) === dir)
    glb = (await convertModel(entry, siblings)).glb
  }
  const buf = new Uint8Array(await glb.arrayBuffer())
  const { data } = await runOptimize(buf, { ktx2 })
  const name = glb.name.replace(/\.[a-z0-9]+$/i, '.glb')
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return new File([ab], name, { type: 'model/gltf-binary' })
}

/** Convert (if needed) + optimize one entry file into an optimized GLB File.
 *  Public wrapper over the bulk pipeline's prepare step so the single-file
 *  upload path runs the same conversion/optimization. `allFiles` supplies the
 *  sibling pool (.mtl/.bin/textures) for multi-file model formats. */
export function prepareModelFile(entry: File, allFiles: File[], ktx2 = false): Promise<File> {
  return prepareGlb(entry, dirOfPath(pathOfFile(entry)), allFiles, ktx2)
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
      dir: dirOfPath(path),
    })
  }
  const allFiles = opts.allFiles ?? files
  const ktx2 = opts.ktx2 ?? false

  let imported = 0
  let duplicates = 0
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  let cursor = 0
  // Hashes already imported THIS batch — guards the concurrent race where two
  // identical files both pass persist's not-yet-committed existence check.
  const seenHashes = new Set<string>()
  // Persist blobs WITHOUT committing each def to the store; collect + flush in
  // batches so the catalog rebuilds a few times, not once per file (the O(n²)
  // render-loop starvation that costs the WebGL context — white flicker).
  const { addManyUserFurniture } = useStore.getState()
  let pending: UserGltfDef[] = []
  const flush = () => {
    if (pending.length === 0) return
    addManyUserFurniture(pending)
    pending = []
  }

  async function worker(): Promise<void> {
    while (cursor < planned.length) {
      const job = planned[cursor++]
      try {
        // Dedupe on the SOURCE bytes (deterministic), not the optimized output
        // (Draco/WebP encoding can vary run-to-run) — so re-importing the same
        // file is reliably recognised as a duplicate.
        const contentHash = await hashFile(job.file)
        if (seenHashes.has(contentHash)) {
          duplicates++
          tick()
          continue
        }
        seenHashes.add(contentHash)
        const prepared = await prepareGlb(job.file, job.dir, allFiles, ktx2)
        const auto = opts.autoFlags ? inferCollisionFlags(job.file.name) : null
        const result = await persistUserGlb(prepared, {
          name: job.name,
          category: opts.category,
          mounted: opts.mounted || auto?.mounted || undefined,
          noClip: opts.noClip || auto?.noClip || undefined,
          contentHash,
          commit: false,
        })
        if (result.ok && result.duplicate) duplicates++
        else if (result.ok) {
          imported++
          pending.push(result.def)
          if (pending.length >= COMMIT_BATCH) flush()
        } else skipped.push({ name: job.errorName, reason: result.reason })
      } catch (e) {
        skipped.push({ name: job.errorName, reason: e instanceof Error ? e.message : String(e) })
      }
      tick()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, planned.length) }, () => worker()))
  flush() // commit the tail

  return { total, imported, duplicates, skipped }
}

/** True when the basename is a supported model entry file (GLB/glTF or any
 *  convertible format: OBJ/FBX/STL/PLY/DAE/3MF/USDZ). */
export function isModelFile(nameOrPath: string): boolean {
  return isModelEntryFile(nameOrPath)
}

/** Basename without its model extension, for the catalog display name.
 *  Falls back to the basename with extension if stripping leaves an empty string. */
export function modelName(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  const stripped = base.replace(/\.[a-z0-9]+$/i, '')
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
