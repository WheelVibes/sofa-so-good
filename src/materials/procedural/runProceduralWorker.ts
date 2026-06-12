/**
 * Main-thread entry point for OffscreenCanvas procedural texture generation.
 *
 * Strategy
 * --------
 * 1. Feature-detect OffscreenCanvas once. If absent, `workerAvailable` stays
 *    false and every call falls back immediately to the synchronous path.
 * 2. On the first call, spin up a single shared Worker (lazy init).
 * 3. Requests with the same cache key are coalesced: the second caller gets
 *    the same Promise as the first, so the worker generates each texture
 *    exactly once per key.
 * 4. If the worker errors on any message, all pending calls are rejected (and
 *    will fall back in the caller), and `workerBroken` is set so future calls
 *    skip the worker entirely.
 *
 * The returned ImageBitmaps are transferred zero-copy; the caller is
 * responsible for disposing them (via `bmp.close()`) after uploading to GPU.
 */

import type { ProceduralPattern } from '../types'
import type { WorkerError, WorkerReply, WorkerRequest } from './procedural.worker'

/** Feature-detect OffscreenCanvas: present in Chrome 69+, Firefox 105+,
 *  Safari 17+, but absent in older browsers and some headless environments.
 *  Mutable so unit tests can override the detection result via
 *  `_setOffscreenAvailableForTest`. */
let offscreenAvailable = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined'

interface WorkerResult {
  albedo: ImageBitmap
  normal: ImageBitmap
  roughness: ImageBitmap
  metalness: number
}

let worker: Worker | null = null
let workerBroken = false
let seq = 0

/** Injected worker factory — overrides `new Worker(...)` in tests. */
let _workerFactory: (() => Worker) | null = null

/** In-flight requests keyed by request id. */
const pending = new Map<number, (r: WorkerResult | null) => void>()

/** Coalescing map: key → Promise already in flight for that exact generation. */
const inflight = new Map<string, Promise<WorkerResult | null>>()

/** Build the cache key that uniquely identifies a generation request. */
export function proceduralWorkerKey(
  matId: string,
  pattern: ProceduralPattern,
  swatch: string,
  size: number,
): string {
  return `${matId}:${pattern}:${swatch}:${size}`
}

function ensureWorker(): Worker | null {
  if (!offscreenAvailable || workerBroken) return null
  if (worker) return worker
  try {
    worker = _workerFactory
      ? _workerFactory()
      : new Worker(new URL('./procedural.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerReply | WorkerError>) => {
      const resolve = pending.get(e.data.id)
      if (!resolve) return
      pending.delete(e.data.id)
      if (e.data.ok) {
        const r = e.data as WorkerReply
        resolve({
          albedo: r.albedo,
          normal: r.normal,
          roughness: r.roughness,
          metalness: r.metalness,
        })
      } else {
        resolve(null)
      }
    }
    worker.onerror = () => {
      workerBroken = true
      for (const resolve of pending.values()) resolve(null)
      pending.clear()
      worker = null
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/**
 * Request OffscreenCanvas generation of a procedural texture set.
 *
 * Returns `null` when the worker is unavailable or fails — the caller must
 * fall back to the synchronous `generateProcedural` path.
 *
 * Calls with the same `{matId, pattern, swatch, size}` that arrive before
 * the first resolves share the same Promise (request coalescing).
 */
export function requestProceduralWorker(
  matId: string,
  pattern: ProceduralPattern,
  swatch: string,
  size: number,
): Promise<WorkerResult | null> {
  const w = ensureWorker()
  if (!w) return Promise.resolve(null)

  const key = proceduralWorkerKey(matId, pattern, swatch, size)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = new Promise<WorkerResult | null>((resolve) => {
    const id = ++seq
    pending.set(id, (result) => {
      inflight.delete(key)
      resolve(result)
    })
    const msg: WorkerRequest = { id, matId, pattern, swatch, size }
    w.postMessage(msg)
  })

  inflight.set(key, promise)
  return promise
}

/** True when OffscreenCanvas + Worker are available in this environment. */
export function isProceduralWorkerAvailable(): boolean {
  return offscreenAvailable && !workerBroken
}

/** Reset all worker state — for unit tests only. */
export function _resetProceduralWorker(): void {
  worker?.terminate()
  worker = null
  workerBroken = false
  seq = 0
  pending.clear()
  inflight.clear()
  _workerFactory = null
  offscreenAvailable = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined'
}

/** Override the OffscreenCanvas feature-detection result — for unit tests only.
 *  Must be called BEFORE any `requestProceduralWorker` call in the test. */
export function _setOffscreenAvailableForTest(value: boolean): void {
  offscreenAvailable = value
}

/** Inject a worker factory — for unit tests only. */
export function _setWorkerFactoryForTest(factory: (() => Worker) | null): void {
  _workerFactory = factory
}
