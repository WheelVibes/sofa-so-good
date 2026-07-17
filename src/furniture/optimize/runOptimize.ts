import type { LodVariantSet } from './lodVariants'
import type { OptimizeOptions, OptimizeReport } from './optimizeGlb'

/**
 * Main-thread entry point for the optimize pass. Runs {@link optimizeGlb} in a
 * dedicated Web Worker so the Draco re-pack + texture re-encode never stall the
 * render loop during a bulk import. Falls back to a direct call when a Worker
 * can't be constructed (e.g. headless tests) or when the worker errors.
 *
 * With `runOpts.lodTiers` the same pass also emits `-low`/`-medium` LOD
 * variants of the optimized GLB (see `lodVariants.ts`) — best-effort: a tier
 * that fails is simply absent from `lods`.
 */

export interface RunOptimizeResult {
  data: Uint8Array
  report: OptimizeReport
  /** Generated LOD variants, when requested (and where generation succeeded). */
  lods?: LodVariantSet
}

export interface RunOptimizeOpts {
  /** Also generate -low/-medium LOD tier variants. */
  lodTiers?: boolean
}

interface WorkerReply {
  id: number
  ok: boolean
  data?: ArrayBuffer
  report?: OptimizeReport
  lodLow?: ArrayBuffer
  lodMedium?: ArrayBuffer
}

/** One in-flight call on a worker: its resolver plus a per-job watchdog timer
 *  that reclaims the worker if it never answers (see {@link JOB_TIMEOUT_MS}). */
interface PendingJob {
  resolve: (r: RunOptimizeResult | null) => void
  watchdog: ReturnType<typeof setTimeout>
}

interface PoolWorker {
  worker: Worker
  /** In-flight jobs keyed by message id (worker processes serially, but the
   *  pool can queue several calls on it while busy). */
  pending: Map<number, PendingJob>
  /** Pending idle-teardown timer, armed once `pending` empties; cleared if a
   *  new job claims this worker before the timer fires. */
  idleTimer?: ReturnType<typeof setTimeout>
}

/**
 * How long a worker sits idle (0 pending calls) before it's terminated and
 * dropped from the pool. Each worker keeps the heavy @gltf-transform/Draco/
 * Basis WASM stack resident (hundreds of MB) for as long as it's alive, so
 * once a bulk-import burst subsides the pool should shed workers back down
 * instead of holding the peak allocation for the rest of the session. A new
 * job re-spawns a worker on demand (`pickWorker`), so this only costs a little
 * re-init latency on the next burst. Exported so tests can drive it with fake
 * timers instead of a real 30s wait.
 */
export const IDLE_TEARDOWN_MS = 30_000

/**
 * Per-job watchdog (IO-008 follow-up). A `messageerror`/`error` retires a worker,
 * but a worker that simply NEVER answers (a hung Draco/Basis WASM stack — the same
 * class of failure `saveOptimize`'s 20 s race guards against) fires no event at
 * all, so its `pending` resolver would sit forever and permanently occupy a pool
 * slot. Each posted job arms a watchdog; on expiry the whole worker is reclaimed
 * (terminated, all its pending jobs rejected to the fail-soft `null` path, dropped
 * from the pool → a fresh one respawns lazily on the next call). Set slightly ABOVE
 * the caller's own timeout ({@link OPTIMIZE_SAVE_TIMEOUT_MS} = 20 s in
 * `glbEdit/saveOptimize.ts`) so a legitimately-slow-but-eventual job is claimed by
 * the caller's race first and this only ever fires on a genuinely stuck worker.
 * A normal fast job clears its watchdog on reply — no cost beyond arming one timer.
 * Exported so tests can drive it with fake timers instead of a real 30 s wait.
 */
export const JOB_TIMEOUT_MS = 30_000

/**
 * Upper bound on the optimize-worker pool, derived from the device's capability
 * so it scales UP on capable machines and stays tolerable on constrained/mobile
 * ones. Workers are spawned lazily and only under contention (see `pickWorker`),
 * so this is a ceiling, not an eager allocation.
 *
 * - Leave the main thread + a core free (`cores - 1`).
 * - Hard-cap at {@link HARD_POOL_MAX}: each worker loads the heavy
 *   @gltf-transform / Draco / Basis WASM stack (hundreds of MB), so beyond a
 *   handful the memory cost outweighs the throughput gain, and oversubscribing
 *   logical cores can starve the render/UI thread.
 * - Downshift on low-memory devices (`navigator.deviceMemory`, GB — Chromium
 *   only, privacy-clamped to ≤8) so a phone/low-RAM tab doesn't OOM.
 *
 * Pure + exported for unit testing (Workers aren't constructible in jsdom).
 */
export const HARD_POOL_MAX = 8

export function computePoolMax(cores: number, deviceMemoryGB?: number): number {
  const c = Number.isFinite(cores) && cores > 0 ? Math.floor(cores) : 4
  let max = Math.max(1, Math.min(HARD_POOL_MAX, c - 1))
  if (typeof deviceMemoryGB === 'number' && deviceMemoryGB > 0) {
    if (deviceMemoryGB <= 2) max = Math.min(max, 2)
    else if (deviceMemoryGB <= 4) max = Math.min(max, 4)
  }
  return max
}

const POOL_MAX = (() => {
  if (typeof navigator === 'undefined') return 4
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4
  return computePoolMax(cores, nav.deviceMemory)
})()

let pool: PoolWorker[] = []
let poolBroken = false
let seq = 0

function replyToResult(r: WorkerReply): RunOptimizeResult | null {
  if (!r.ok || !r.data || !r.report) return null
  const lods: LodVariantSet = {}
  if (r.lodLow) lods.low = new Uint8Array(r.lodLow)
  if (r.lodMedium) lods.medium = new Uint8Array(r.lodMedium)
  return {
    data: new Uint8Array(r.data),
    report: r.report,
    lods: lods.low || lods.medium ? lods : undefined,
  }
}

/** Best-effort worker termination — never throw out of a teardown path. */
function terminate(pw: PoolWorker): void {
  try {
    pw.worker.terminate()
  } catch {
    // already gone / unsupported — nothing more to do
  }
}

/** Clear (if armed) this worker's idle-teardown timer — called both when a
 *  new job claims an idle worker and when it's torn down some other way
 *  (error/messageerror), so a stale timer can never fire twice. */
function clearIdleTimer(pw: PoolWorker): void {
  if (pw.idleTimer === undefined) return
  clearTimeout(pw.idleTimer)
  pw.idleTimer = undefined
}

/** Arm the idle-teardown timer once a worker's queue empties. */
function scheduleIdleTeardown(pw: PoolWorker): void {
  pw.idleTimer = setTimeout(() => {
    pw.idleTimer = undefined
    if (pw.pending.size > 0) return // claimed again in the meantime
    pool = pool.filter((p) => p !== pw)
    terminate(pw)
  }, IDLE_TEARDOWN_MS)
}

/**
 * Retire ONE worker: clear its idle + per-job watchdog timers, fall all its
 * in-flight calls back to the direct/unoptimized path (`null`), drop it from the
 * pool (a fresh one respawns on demand), and terminate it. Shared by the
 * `error`/`messageerror` handlers (a crash / un-cloneable reply) AND the per-job
 * watchdog (a silently-hung worker) — both retire the whole worker's queue, since
 * a serial worker stuck on one job can never drain the calls queued behind it.
 */
function retireWorker(pw: PoolWorker): void {
  clearIdleTimer(pw)
  for (const [, job] of pw.pending) {
    clearTimeout(job.watchdog)
    job.resolve(null)
  }
  pw.pending.clear()
  pool = pool.filter((p) => p !== pw)
  terminate(pw)
}

function spawn(): PoolWorker | null {
  try {
    const pw: PoolWorker = {
      worker: new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' }),
      pending: new Map(),
    }
    pw.worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const job = pw.pending.get(e.data.id)
      if (!job) return
      clearTimeout(job.watchdog)
      pw.pending.delete(e.data.id)
      job.resolve(replyToResult(e.data))
      if (pw.pending.size === 0) scheduleIdleTeardown(pw)
    }
    // Retire only THIS worker on failure: fall its own in-flight calls back to
    // the direct/unoptimized path and drop it from the pool (a fresh one is
    // spawned on demand). `messageerror` fires when a reply can't be
    // structured-cloned — without handling it that call would hang forever and
    // wedge a bulk-import slot (IO-008); we can't tell which id, so fail this
    // worker's whole queue. A worker that answers with NEITHER a reply nor an
    // error (a hung WASM stack) is instead reclaimed by the per-job watchdog.
    pw.worker.onerror = () => retireWorker(pw)
    pw.worker.onmessageerror = () => retireWorker(pw)
    return pw
  } catch {
    return null
  }
}

/**
 * Pick a worker for the next job, growing the pool **on contention**: reuse an
 * idle worker when one exists; otherwise, only if every existing worker is busy
 * AND we're under {@link POOL_MAX}, spin up another (so a light import keeps a
 * small pool and a heavy concurrent burst scales up to the tolerable maximum).
 * Falls back to the least-busy worker at the cap.
 */
function pickWorker(): PoolWorker | null {
  if (poolBroken) return null
  // Least-busy existing worker (an idle one, pending 0, wins).
  let best: PoolWorker | null = null
  for (const pw of pool) if (best === null || pw.pending.size < best.pending.size) best = pw
  const allBusy = best === null || best.pending.size > 0
  if (allBusy && pool.length < POOL_MAX) {
    const pw = spawn()
    if (pw) {
      pool.push(pw)
      return pw
    }
    // Worker construction failed with none yet available → no pool at all.
    if (pool.length === 0) {
      poolBroken = true
      return null
    }
  }
  // Claiming this worker for a new job — cancel any pending idle-teardown so
  // it isn't terminated out from under the in-flight call.
  if (best) clearIdleTimer(best)
  return best
}

export async function runOptimize(
  input: Uint8Array,
  opts: OptimizeOptions = {},
  runOpts: RunOptimizeOpts = {},
): Promise<RunOptimizeResult> {
  const fallback = (): RunOptimizeResult => ({
    data: input,
    report: { beforeBytes: input.byteLength, afterBytes: input.byteLength },
  })

  const pw = pickWorker()
  if (!pw) {
    // Direct-call fallback (no Worker available). Dynamic import keeps the
    // @gltf-transform optimize stack out of the boot bundle (P-CHUNK); if the
    // chunk itself can't load, keep the original GLB — optimize is best-effort.
    try {
      const { optimizeGlb } = await import('./optimizeGlb')
      const result = await optimizeGlb(input, opts)
      if (!runOpts.lodTiers) return result
      const { generateLodVariants } = await import('./lodVariants')
      const lods = await generateLodVariants(result.data)
      return { ...result, lods: lods.low || lods.medium ? lods : undefined }
    } catch {
      return fallback()
    }
  }

  const result = await new Promise<RunOptimizeResult | null>((resolve) => {
    const id = ++seq
    // Per-job watchdog: if this worker never answers (hung WASM stack), reclaim
    // it so its pool slot isn't held forever (callers already fail-soft on null).
    const watchdog = setTimeout(() => retireWorker(pw), JOB_TIMEOUT_MS)
    pw.pending.set(id, { resolve, watchdog })
    // Transfer a copy so the caller keeps its own buffer intact.
    const copy = input.slice()
    pw.worker.postMessage({ id, input: copy.buffer, opts, lodTiers: runOpts.lodTiers }, [
      copy.buffer,
    ])
  })
  // null ⇒ worker failed/unavailable for this call: keep the original GLB.
  return result ?? fallback()
}
