import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Exercises the optimize worker POOL itself (`pickWorker`/`spawn`/retire/idle
 * teardown in `runOptimize.ts`) with a mock `Worker` — `computePoolMax` (pure
 * math) is covered in `runOptimize.test.ts`; this file drives the pool's
 * actual queueing/lifecycle behaviour, which needs a constructible `Worker`
 * (unavailable in the default node test environment, so production code
 * always takes the direct-call fallback branch there — see `pickWorker`
 * returning `null` when `new Worker` throws).
 *
 * Each test re-imports a fresh module instance (`vi.resetModules` + dynamic
 * `import`) since the pool (`pool`/`poolBroken`/`seq`) is module-level mutable
 * state — without this, tests would leak workers/ids into each other.
 */

interface PostedMsg {
  id: number
  input: ArrayBuffer
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessageerror: ((e: unknown) => void) | null = null
  posted: PostedMsg[] = []
  terminated = false

  constructor(_url: unknown, _opts?: unknown) {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: PostedMsg): void {
    this.posted.push(msg)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Simulate a successful optimize reply for message `id`. */
  replyOk(id: number, afterBytes = 40): void {
    this.onmessage?.({
      data: { id, ok: true, data: new ArrayBuffer(4), report: { beforeBytes: 100, afterBytes } },
    })
  }

  /** Simulate the worker crashing (native `onerror`) — retires it. */
  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

/** Fresh module instance with a `navigator.hardwareConcurrency` of `cores`
 *  (drives `POOL_MAX` via `computePoolMax`). */
async function freshModule(cores = 3) {
  vi.stubGlobal('navigator', { hardwareConcurrency: cores })
  vi.resetModules()
  return import('./runOptimize')
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('optimize worker pool (mock Worker)', () => {
  it('caps worker growth at POOL_MAX and queues extra concurrent calls onto existing workers', async () => {
    const { runOptimize } = await freshModule(3) // computePoolMax(3) = 2
    const input = new Uint8Array([1, 2, 3])
    const promises = Array.from({ length: 5 }, () => runOptimize(input))

    expect(FakeWorker.instances).toHaveLength(2)
    const totalPosted = FakeWorker.instances.reduce((n, w) => n + w.posted.length, 0)
    expect(totalPosted).toBe(5)

    for (const w of FakeWorker.instances) {
      for (const msg of w.posted) w.replyOk(msg.id)
    }
    const results = await Promise.all(promises)
    expect(results).toHaveLength(5)
    for (const r of results) expect(r.report.afterBytes).toBe(40)
  })

  it('falls back to the original bytes when a worker errors mid-task, and a fresh worker is spawned next call', async () => {
    const { runOptimize } = await freshModule(3)
    const input = new Uint8Array([9, 9, 9])

    const p1 = runOptimize(input)
    expect(FakeWorker.instances).toHaveLength(1)
    const workerA = FakeWorker.instances[0]
    workerA.fail()

    const r1 = await p1
    expect(r1.data).toEqual(input) // best-effort fallback: unoptimized original
    expect(workerA.terminated).toBe(true) // retired worker is actually torn down

    // The failed worker was dropped from the pool — the next call spawns fresh.
    const p2 = runOptimize(input)
    expect(FakeWorker.instances).toHaveLength(2)
    const workerB = FakeWorker.instances[1]
    workerB.replyOk(workerB.posted[0].id)
    const r2 = await p2
    expect(r2.report.afterBytes).toBe(40)
  })

  it('resolves every call queued on a worker (not just the first) when it errors — teardown while queued', async () => {
    const { runOptimize } = await freshModule(1) // computePoolMax(1) = 1: everything queues on one worker
    const input = new Uint8Array([5])

    const p1 = runOptimize(input)
    const p2 = runOptimize(input)
    const p3 = runOptimize(input)
    expect(FakeWorker.instances).toHaveLength(1)
    const w = FakeWorker.instances[0]
    expect(w.posted).toHaveLength(3)

    w.fail()
    const results = await Promise.all([p1, p2, p3])
    expect(results).toHaveLength(3)
    for (const r of results) expect(r.data).toEqual(input)
    expect(w.terminated).toBe(true)
  })

  it('tears down an idle worker after IDLE_TEARDOWN_MS and respawns fresh on the next call', async () => {
    const { runOptimize, IDLE_TEARDOWN_MS } = await freshModule(3)
    const input = new Uint8Array([1])

    const p1 = runOptimize(input)
    const w = FakeWorker.instances[0]
    w.replyOk(w.posted[0].id)
    await p1
    expect(w.terminated).toBe(false)

    vi.advanceTimersByTime(IDLE_TEARDOWN_MS + 1)
    expect(w.terminated).toBe(true)

    const p2 = runOptimize(input)
    expect(FakeWorker.instances).toHaveLength(2) // fresh worker, old one is gone
    const w2 = FakeWorker.instances[1]
    w2.replyOk(w2.posted[0].id)
    await p2
  })

  it('cancels a worker’s idle-teardown timer if it is reclaimed before the timer fires', async () => {
    const { runOptimize, IDLE_TEARDOWN_MS } = await freshModule(3)
    const input = new Uint8Array([1])

    const p1 = runOptimize(input)
    const w = FakeWorker.instances[0]
    w.replyOk(w.posted[0].id)
    await p1
    expect(vi.getTimerCount()).toBe(1) // idle-teardown timer armed

    // Advance partway (not enough to fire), then reclaim the same worker —
    // this must cancel the outstanding timer, not just rely on the
    // "still pending" guard inside it.
    vi.advanceTimersByTime(IDLE_TEARDOWN_MS / 2)
    const p2 = runOptimize(input)
    expect(FakeWorker.instances).toHaveLength(1) // reused, not respawned
    expect(vi.getTimerCount()).toBe(0) // stale timer cancelled on reclaim
    expect(w.terminated).toBe(false)

    // Even past the original deadline, the reclaimed worker must not be torn
    // down mid-task.
    vi.advanceTimersByTime(IDLE_TEARDOWN_MS)
    expect(w.terminated).toBe(false)

    w.replyOk(w.posted[1].id)
    await p2
  })
})
