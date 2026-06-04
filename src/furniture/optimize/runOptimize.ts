import { type OptimizeOptions, type OptimizeReport, optimizeGlb } from './optimizeGlb'

/**
 * Main-thread entry point for the optimize pass. Runs {@link optimizeGlb} in a
 * dedicated Web Worker so the Draco re-pack + texture re-encode never stall the
 * render loop during a bulk import. Falls back to a direct call when a Worker
 * can't be constructed (e.g. headless tests) or when the worker errors.
 */

interface WorkerReply {
  id: number
  ok: boolean
  data?: ArrayBuffer
  report?: OptimizeReport
}

let worker: Worker | null = null
let workerBroken = false
let seq = 0
const pending = new Map<number, (r: { data: Uint8Array; report: OptimizeReport } | null) => void>()

function ensureWorker(): Worker | null {
  if (worker || workerBroken) return worker
  try {
    worker = new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const { id, ok, data, report } = e.data
      const resolve = pending.get(id)
      if (!resolve) return
      pending.delete(id)
      resolve(ok && data && report ? { data: new Uint8Array(data), report } : null)
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
): Promise<{ data: Uint8Array; report: OptimizeReport }> {
  const fallback = (): { data: Uint8Array; report: OptimizeReport } => ({
    data: input,
    report: { beforeBytes: input.byteLength, afterBytes: input.byteLength },
  })

  const w = ensureWorker()
  if (!w) return optimizeGlb(input, opts)

  const result = await new Promise<{ data: Uint8Array; report: OptimizeReport } | null>(
    (resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      // Transfer a copy so the caller keeps its own buffer intact.
      const copy = input.slice()
      w.postMessage({ id, input: copy.buffer, opts }, [copy.buffer])
    },
  )
  // null ⇒ worker failed/unavailable for this call: keep the original GLB.
  return result ?? fallback()
}
