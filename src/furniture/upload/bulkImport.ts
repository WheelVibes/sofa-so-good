import { useStore } from '../../state/store'
import { needsConversion } from '../convert/convertModel'
import { detectModelFormat, isModelEntryFile } from '../convert/formats'
import { runConvert } from '../convert/runConvert'
import type { LodVariantSet } from '../optimize/lodVariants'
import { computePoolMax, runOptimize } from '../optimize/runOptimize'
import type { FurnitureCategory, UserGltfDef } from '../types'
import { hashFile } from './hashFile'
import { inferCollisionFlags } from './inferFlags'
import { persistUserGlb } from './persist'
import { MAX_GLB_BYTES } from './validate'

/** How many built defs to commit to the store per write during a bulk import.
 *  One catalog rebuild per batch instead of per file — keeps the main thread
 *  responsive so a huge import can't starve the render loop / WebGL context. */
export const COMMIT_BATCH = 25

/**
 * IO-002 early-gate headroom: a pre-optimize GLB is only rejected up front
 * when it exceeds `EARLY_REJECT_MULTIPLIER × MAX_GLB_BYTES`. The multiplier
 * exists because the optimize pass routinely shrinks a model 5-10× (Draco
 * geometry re-pack + WebP texture re-encode), so a strict pre-optimize check
 * at `MAX_GLB_BYTES` would wrongly reject legitimately compressible uploads
 * (e.g. a 30 MB source that optimizes to 8 MB) — the post-optimize gate exists
 * precisely so those succeed. 3× keeps that chance open for any plausibly
 * compressible file (25-75 MB at the current 25 MB cap) while still cutting
 * off the hopeless case the early gate targets — a dense CAD-exported convert
 * lands in the hundreds of MB, far past this line, and would only burn an
 * optimize-pool slot to be rejected afterward anyway. The real cap is always
 * enforced post-optimize on the actual bytes that would be stored.
 */
export const EARLY_REJECT_MULTIPLIER = 3

/**
 * Default number of files whose convert→optimize→persist pipeline runs in
 * parallel in {@link importGlbFiles}, when the caller doesn't pass an
 * explicit `concurrency`. Previously a flat `4` regardless of hardware.
 *
 * `prepareGlb` runs each file through the convert pool THEN the optimize
 * pool, one after the other — both pools are sized by the same
 * `computePoolMax(cores, deviceMemory)` ceiling (`optimize/runOptimize.ts`,
 * reused by `convert/runConvert.ts`). Since at any instant during a batch
 * those two pools are busy on DIFFERENT in-flight files (never both stages
 * of the same one), matching the *import* concurrency to that same ceiling
 * keeps every pool worker fed without over-queueing: a flat 4 either starved
 * a many-core desktop's ~7-8 worker pool, or queued 4 files deep against a
 * 1-2 worker pool on a low-end/mobile device (each extra queued file just
 * waits behind an already-busy worker with no throughput gain, only more
 * Files/ArrayBuffers held in memory at once). Reusing `computePoolMax`
 * directly (rather than re-deriving the same clamp/downshift math) keeps the
 * two decisions from drifting apart.
 *
 * Pure + exported for unit testing (mirrors `computePoolMax`'s shape).
 */
export function defaultImportConcurrency(cores: number, deviceMemoryGB?: number): number {
  return computePoolMax(cores, deviceMemoryGB)
}

/** Reads live hardware signals to resolve the default import concurrency —
 *  same no-`navigator` (SSR/older-browser/test-environment) fallback to the
 *  legacy flat default of `4` as `runOptimize.ts`'s `POOL_MAX` / `runConvert
 *  .ts`'s `poolMax()`. Called fresh per `importGlbFiles` invocation rather
 *  than cached at module load, so it stays a plain function (not a frozen
 *  module-level constant) — simpler to drive in tests via `vi.stubGlobal`.
 *  Exported for unit testing the navigator-reading/SSR-fallback branch. */
export function readDefaultConcurrency(): number {
  if (typeof navigator === 'undefined') return 4
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4
  return defaultImportConcurrency(cores, nav.deviceMemory)
}

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
  /** Also generate -low/-medium LOD tier variants per model (stored alongside
   *  the full asset in IDB; the renderer picks them on low/medium asset tiers).
   *  Default-on in the upload dialog; opt-out for faster imports. */
  lodTiers?: boolean
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

export interface PreparedModel {
  file: File
  /** Generated -low/-medium LOD variants (when requested + generation worked). */
  lods?: LodVariantSet
}

/**
 * Convert (if needed) + optimize a single entry file into an optimized GLB File.
 * GLB/glTF entries skip conversion but still run the optimize pass; non-GLB
 * formats convert to GLB first (resolving .mtl/.bin/textures from `allFiles`
 * within the same folder). Quality-first for the main asset: codec compression,
 * no decimation. With `lodTiers`, decimated/downscaled -low/-medium variants
 * are additionally generated from the optimized output (best-effort).
 */
async function prepareGlb(
  entry: File,
  dir: string,
  allFiles: File[],
  opts: { ktx2?: boolean; lodTiers?: boolean },
): Promise<PreparedModel> {
  const format = await detectModelFormat(entry)
  let glb = entry
  if (format && needsConversion(format)) {
    const siblings = allFiles.filter((f) => f !== entry && dirOfPath(pathOfFile(f)) === dir)
    // Off the main thread when possible (pooled Worker) — see runConvert.ts.
    // Per-file fallback to a direct main-thread convert is handled inside it,
    // so a single bad/unsupported-environment file never aborts the batch.
    glb = (await runConvert(entry, siblings)).glb
  }
  const buf = new Uint8Array(await glb.arrayBuffer())
  // IO-002 (early gate): reject a HOPELESSLY oversized converted/raw GLB
  // BEFORE the optimize/LOD pass — Draco re-pack + texture re-encode is the
  // most expensive step in the pipeline (runs in a pooled Worker, but still
  // costs a slot + CPU), so a file that can't plausibly fit under the cap
  // even after optimizing shouldn't burn a slot only to be rejected
  // afterward anyway. "Hopeless" = over EARLY_REJECT_MULTIPLIER × the cap
  // (see that constant for the rationale) — a merely over-cap but plausibly
  // compressible file (e.g. 30 MB → 8 MB) is NOT rejected here; it proceeds
  // to optimize and the post-optimize gate below enforces the real limit.
  if (buf.byteLength > EARLY_REJECT_MULTIPLIER * MAX_GLB_BYTES) {
    const mb = (buf.byteLength / 1_048_576).toFixed(1)
    const cap = MAX_GLB_BYTES / 1_048_576
    throw new Error(
      `Converted model is ${mb} MB — even after optimization this can't fit under the ${cap} MB limit. Try a simpler model or fewer/smaller textures.`,
    )
  }
  const { data, lods } = await runOptimize(buf, { ktx2: opts.ktx2 }, { lodTiers: opts.lodTiers })
  // IO-002 (post-optimize gate): the REAL cap, enforced on the actual bytes
  // that would be stored, with a CLEAR, conversion-aware message — instead of
  // letting `persistUserGlb`'s generic "file too large" fire after the full
  // pipeline. Checking the final (post-shrink) size means a compressible
  // model that optimizes under the cap is never wrongly rejected — only a
  // model that stayed over the cap even after its optimize chance fails here.
  if (data.byteLength > MAX_GLB_BYTES) {
    const mb = (data.byteLength / 1_048_576).toFixed(1)
    const cap = MAX_GLB_BYTES / 1_048_576
    throw new Error(
      `Converted model is ${mb} MB — over the ${cap} MB limit even after optimization. Try a simpler model or fewer/smaller textures.`,
    )
  }
  const name = glb.name.replace(/\.[a-z0-9]+$/i, '.glb')
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return { file: new File([ab], name, { type: 'model/gltf-binary' }), lods }
}

/** Convert (if needed) + optimize one entry file into an optimized GLB File
 *  (+ optional LOD variants). Public wrapper over the bulk pipeline's prepare
 *  step so the single-file upload path runs the same conversion/optimization.
 *  `allFiles` supplies the sibling pool (.mtl/.bin/textures) for multi-file
 *  model formats. */
export function prepareModelFile(
  entry: File,
  allFiles: File[],
  opts: { ktx2?: boolean; lodTiers?: boolean } = {},
): Promise<PreparedModel> {
  return prepareGlb(entry, dirOfPath(pathOfFile(entry)), allFiles, opts)
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
  const prepOpts = { ktx2: opts.ktx2 ?? false, lodTiers: opts.lodTiers ?? false }

  let imported = 0
  let duplicates = 0
  // An explicit caller-supplied concurrency always wins; only the DEFAULT is
  // hardware-aware (see `defaultImportConcurrency`/`readDefaultConcurrency`).
  const concurrency = Math.max(1, opts.concurrency ?? readDefaultConcurrency())
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
        const prepared = await prepareGlb(job.file, job.dir, allFiles, prepOpts)
        const auto = opts.autoFlags ? inferCollisionFlags(job.file.name) : null
        const result = await persistUserGlb(prepared.file, {
          name: job.name,
          category: opts.category,
          mounted: opts.mounted || auto?.mounted || undefined,
          noClip: opts.noClip || auto?.noClip || undefined,
          contentHash,
          commit: false,
          lods: prepared.lods,
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
