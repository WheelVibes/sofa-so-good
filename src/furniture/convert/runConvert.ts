import { computePoolMax } from '../optimize/runOptimize'
import { WorkerPool } from '../worker/workerPool'
import { ConvertError, convertModel } from './convertModel'
import type { ModelFormat } from './formats'

/**
 * Main-thread entry point for model conversion (OBJ/FBX/STL/PLY/DAE/3DS/3MF/
 * USDZ/gltf → GLB). Runs {@link convertModel} in a pooled Web Worker so
 * three.js loaders + `GLTFExporter` never stall the render loop during a bulk
 * import — mirrors the optimize pass (`optimize/runOptimize.ts`), which had
 * the same problem for the Draco/texture re-encode step. Reuses the generic
 * `WorkerPool` (`furniture/worker/workerPool.ts`) rather than a bespoke
 * implementation; see that file's header comment for why `runOptimize.ts`
 * itself wasn't refactored onto it.
 *
 * Falls back to a direct main-thread `convertModel` call — for that ONE
 * file only, never the whole batch — when: no Worker can be constructed
 * (e.g. the default Node/happy-dom test environment), a worker crashes
 * mid-task, or a worker reports an *unexpected* in-worker failure (anything
 * other than a `ConvertError`, i.e. not a genuine "this file is invalid"
 * result, which would just fail the same way again on retry).
 */

export interface RunConvertResult {
  glb: File
  format: ModelFormat
  /** Which path actually produced this result — dev/harness observability. */
  usedWorker: boolean
}

interface WorkerOkReply {
  ok: true
  buffer: ArrayBuffer
  format: ModelFormat
  name: string
}
interface WorkerErrReply {
  ok: false
  error: string
  /** True when the worker's `convertModel` call threw a `ConvertError` (a
   *  real validation failure — unsupported format, over-size, zip bomb — that
   *  would reproduce identically on a main-thread retry). False for anything
   *  else, which the caller treats as "worth retrying on the main thread". */
  expected: boolean
}
type WorkerReply = WorkerOkReply | WorkerErrReply

/** Same sizing heuristic as the optimize pool (cores‑1, hard-capped, downshift
 *  on low-RAM devices) — reused rather than re-derived so the two pools agree
 *  on what "a capable machine" means. The two pools size independently (each
 *  can reach this ceiling on its own), which is fine: convert and optimize
 *  run one-after-the-other per file in `bulkImport.prepareGlb`, so the two
 *  pools are busy on DIFFERENT files at any moment during a concurrent batch,
 *  not doubling up on the same file. */
function poolMax(): number {
  if (typeof navigator === 'undefined') return 4
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4
  return computePoolMax(cores, nav.deviceMemory)
}

/** Mirrors optimize's `IDLE_TEARDOWN_MS` — how long an idle convert worker
 *  survives before teardown. Each worker keeps the three.js loader stack
 *  (OBJLoader/FBXLoader/ColladaLoader/…, dynamically imported on first use)
 *  resident, so shedding idle workers after a burst matters here too. */
export const IDLE_TEARDOWN_MS = 30_000

let pool: WorkerPool<WorkerReply> | null = null

function getPool(): WorkerPool<WorkerReply> {
  if (!pool) {
    pool = new WorkerPool<WorkerReply>(
      {
        spawnWorker: () => {
          try {
            return new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' })
          } catch {
            return null
          }
        },
        parseReply: (data) => {
          const d = data as { id: number } & WorkerReply
          return { id: d.id, reply: d }
        },
      },
      { poolMax: poolMax(), idleTeardownMs: IDLE_TEARDOWN_MS },
    )
  }
  return pool
}

/** Dev-only observability seam (mirrors `ui/openSceneExport.ts`'s
 *  `__lastSceneExport`): records which path produced the most recent
 *  conversion, so the scenario harness can prove the worker actually ran
 *  (a mocked `Worker` in unit tests can't tell us that — only a real browser
 *  can construct one). Inert / never installed in a production build. */
interface ConvertDebugWindow {
  __lastConvertRun?: { name: string; format: ModelFormat; usedWorker: boolean }
}

function debugWindow(): ConvertDebugWindow | null {
  return import.meta.env.DEV && typeof window !== 'undefined'
    ? (window as unknown as ConvertDebugWindow)
    : null
}

function recordDebug(result: RunConvertResult): void {
  const dbg = debugWindow()
  if (dbg)
    dbg.__lastConvertRun = {
      name: result.glb.name,
      format: result.format,
      usedWorker: result.usedWorker,
    }
}

async function mainThreadFallback(entry: File, siblings: File[]): Promise<RunConvertResult> {
  const { glb, format } = await convertModel(entry, siblings)
  const result: RunConvertResult = { glb, format, usedWorker: false }
  recordDebug(result)
  return result
}

/** Convert a non-GLB model file to GLB, off the main thread when possible.
 *  See the module header for the fallback rules. */
export async function runConvert(entry: File, siblings: File[]): Promise<RunConvertResult> {
  const reply = await getPool().call((id) => ({ message: { id, entry, siblings } }))

  if (reply === null) {
    // No worker available/usable for this call at all (construction failed,
    // or the worker that was handling it crashed) — main-thread fallback.
    return mainThreadFallback(entry, siblings)
  }
  if (reply.ok) {
    const glb = new File([reply.buffer], reply.name, { type: 'model/gltf-binary' })
    const result: RunConvertResult = { glb, format: reply.format, usedWorker: true }
    recordDebug(result)
    return result
  }
  if (reply.expected) {
    // A genuine validation failure — surface it as-is, no point retrying.
    throw new ConvertError(reply.error)
  }
  // Unexpected in-worker failure (e.g. an environment quirk this worker
  // couldn't handle) — give the file one real shot on the main thread before
  // giving up on it, exactly like any other per-file failure in the batch.
  return mainThreadFallback(entry, siblings)
}
