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

let worker: Worker | null = null
let workerBroken = false
let seq = 0
const pending = new Map<number, (r: RunOptimizeResult | null) => void>()

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

function ensureWorker(): Worker | null {
  if (worker || workerBroken) return worker
  try {
    worker = new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const resolve = pending.get(e.data.id)
      if (!resolve) return
      pending.delete(e.data.id)
      resolve(replyToResult(e.data))
    }
    worker.onerror = () => {
      workerBroken = true
      // Reject all in-flight calls so they fall back to the direct path.
      for (const [, resolve] of pending) resolve(null)
      pending.clear()
      worker = null
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
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

  const w = ensureWorker()
  if (!w) {
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
    pending.set(id, resolve)
    // Transfer a copy so the caller keeps its own buffer intact.
    const copy = input.slice()
    w.postMessage({ id, input: copy.buffer, opts, lodTiers: runOpts.lodTiers }, [copy.buffer])
  })
  // null ⇒ worker failed/unavailable for this call: keep the original GLB.
  return result ?? fallback()
}
