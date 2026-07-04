import { Group, Mesh, MeshStandardMaterial } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setSceneExportWorkerFactoryForTest,
  runWorkerSceneExport,
  WORKER_EXPORT_TIMEOUT_MS,
} from './runSceneExport'

/** Mirrors `runOptimize.pool.test.ts`'s FakeWorker (instances tracked on a
 *  static array, rather than reassigning an outer `let`, sidesteps TS's
 *  control-flow narrowing quirks with closures) — Workers aren't
 *  constructible in the default node vitest environment, so this drives the
 *  actual message/timeout/error plumbing in `runWorkerSceneExport`. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false
  posted: unknown[] = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: unknown): void {
    this.posted.push(msg)
  }
  terminate(): void {
    this.terminated = true
  }
  replyOk(data: ArrayBuffer | string = new ArrayBuffer(4)): void {
    this.onmessage?.({ data: { id: 1, ok: true, format: 'glb', data } })
  }
  replyError(error = 'boom'): void {
    this.onmessage?.({ data: { id: 1, ok: false, error } })
  }
  crash(): void {
    this.onerror?.()
  }
}

function simpleScene(): Group {
  const root = new Group()
  root.add(new Mesh(undefined, new MeshStandardMaterial()))
  return root
}

beforeEach(() => {
  FakeWorker.instances = []
  _setSceneExportWorkerFactoryForTest(() => new FakeWorker() as unknown as Worker)
})

afterEach(() => {
  _setSceneExportWorkerFactoryForTest(null)
  vi.useRealTimers()
})

describe('runWorkerSceneExport', () => {
  it('rejects immediately when no Worker can be constructed', async () => {
    _setSceneExportWorkerFactoryForTest(() => {
      throw new Error('no Worker in this environment')
    })
    await expect(runWorkerSceneExport(simpleScene(), 'glb')).rejects.toThrow()
  })

  it('resolves with the worker reply data on success', async () => {
    const promise = runWorkerSceneExport(simpleScene(), 'glb')
    expect(FakeWorker.instances).toHaveLength(1)
    const worker = FakeWorker.instances[0]
    const buf = new ArrayBuffer(8)
    worker.replyOk(buf)
    await expect(promise).resolves.toBe(buf)
    expect(worker.terminated).toBe(true)
  })

  it('rejects with the worker-reported error on a failed reply', async () => {
    const promise = runWorkerSceneExport(simpleScene(), 'obj')
    const worker = FakeWorker.instances[0]
    worker.replyError('exporter threw')
    await expect(promise).rejects.toThrow('exporter threw')
    expect(worker.terminated).toBe(true)
  })

  it('rejects when the worker crashes (native onerror)', async () => {
    const promise = runWorkerSceneExport(simpleScene(), 'stl')
    const worker = FakeWorker.instances[0]
    worker.crash()
    await expect(promise).rejects.toThrow()
    expect(worker.terminated).toBe(true)
  })

  it('never hangs forever — rejects after the timeout if the worker never replies', async () => {
    vi.useFakeTimers()
    const promise = runWorkerSceneExport(simpleScene(), 'usdz')
    const assertion = expect(promise).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(WORKER_EXPORT_TIMEOUT_MS + 1)
    await assertion
  })
})
