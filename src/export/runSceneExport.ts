/**
 * Main-thread entry point for the worker-backed whole-scene 3D export
 * (Q-3DEXPORT tail). Spawns a single-shot `exportWorker.worker.ts`, marshals
 * the (already-pruned) export root onto it (`sceneMarshal.ts`), and resolves
 * with the exported bytes/text — or REJECTS on any failure (worker
 * unconstructible, crash, malformed reply, or timeout) so the caller
 * (`ui/openSceneExport.ts`) can fall back to the direct synchronous path
 * rather than ever leaving the export hanging silently.
 */
import type { Object3D } from 'three'
import type {
  SceneExportWorkerFormat,
  SceneExportWorkerReply,
  SceneExportWorkerRequest,
} from './exportWorker.worker'
import { marshalSceneForWorker } from './sceneMarshal'

export type { SceneExportWorkerFormat }

/** Give up and reject if the worker hasn't replied within this long — a
 *  stuck worker must never hang the export forever (graceful-failure
 *  mandate: "if something is expected to be slow, it should not block or
 *  break other things"). Large-scene exports are expected to take real time,
 *  so this is generous, not a tight perf budget. */
export const WORKER_EXPORT_TIMEOUT_MS = 60_000

/** Injectable worker factory for tests — Workers aren't constructible in the
 *  default node vitest environment, so production always takes the
 *  direct-fallback branch there (mirrors `runOptimize.ts`/
 *  `runProceduralWorker.ts`'s test seams). */
let workerFactory: (() => Worker) | null = null
export function _setSceneExportWorkerFactoryForTest(factory: (() => Worker) | null): void {
  workerFactory = factory
}

function spawnWorker(): Worker | null {
  try {
    return workerFactory
      ? workerFactory()
      : new Worker(new URL('./exportWorker.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

/**
 * Run a whole-scene export on a dedicated Worker so the exporter's
 * synchronous work never touches the main thread. `exportRoot` must already
 * be pruned (`buildExportRoot`) — marshalling happens here, synchronously, on
 * the caller's thread (cheap: it copies typed-array references + triggers
 * `postMessage`'s structured clone, it does not run the exporter itself).
 */
export function runWorkerSceneExport(
  exportRoot: Object3D,
  format: SceneExportWorkerFormat,
): Promise<ArrayBuffer | string> {
  const worker = spawnWorker()
  if (!worker) return Promise.reject(new Error('3D export worker unavailable'))

  const { json } = marshalSceneForWorker(exportRoot)

  return new Promise<ArrayBuffer | string>((resolve, reject) => {
    let settled = false
    const finish = (run: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      run()
    }
    const timer = setTimeout(() => {
      finish(() => reject(new Error('3D export timed out')))
    }, WORKER_EXPORT_TIMEOUT_MS)

    worker.onmessage = (e: MessageEvent<SceneExportWorkerReply>) => {
      const reply = e.data
      finish(() => {
        if (reply.ok) resolve(reply.data)
        else reject(new Error(reply.error))
      })
    }
    worker.onerror = () => finish(() => reject(new Error('3D export worker crashed')))
    worker.onmessageerror = () =>
      finish(() => reject(new Error('3D export worker reply was not transferable')))

    const request: SceneExportWorkerRequest = { id: 1, json, format }
    worker.postMessage(request)
  })
}
