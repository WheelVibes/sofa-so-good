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

interface PoolWorker {
  worker: Worker
  /** In-flight call resolvers keyed by message id (worker processes serially). */
  pending: Map<number, (r: RunOptimizeResult | null) => void>
}

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

function spawn(): PoolWorker | null {
  try {
    const pw: PoolWorker = {
      worker: new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' }),
      pending: new Map(),
    }
    pw.worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const resolve = pw.pending.get(e.data.id)
      if (!resolve) return
      pw.pending.delete(e.data.id)
      resolve(replyToResult(e.data))
    }
    // Retire only THIS worker on failure: fall its own in-flight calls back to
    // the direct/unoptimized path and drop it from the pool (a fresh one is
    // spawned on demand). `messageerror` fires when a reply can't be
    // structured-cloned — without handling it that call would hang forever and
    // wedge a bulk-import slot (IO-008); we can't tell which id, so fail this
    // worker's whole queue.
    const retire = () => {
      for (const [, resolve] of pw.pending) resolve(null)
      pw.pending.clear()
      pool = pool.filter((p) => p !== pw)
    }
    pw.worker.onerror = retire
    pw.worker.onmessageerror = retire
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
    pw.pending.set(id, resolve)
    // Transfer a copy so the caller keeps its own buffer intact.
    const copy = input.slice()
    pw.worker.postMessage({ id, input: copy.buffer, opts, lodTiers: runOpts.lodTiers }, [
      copy.buffer,
    ])
  })
  // null ⇒ worker failed/unavailable for this call: keep the original GLB.
  return result ?? fallback()
}
