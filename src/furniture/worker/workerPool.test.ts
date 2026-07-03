import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerPool, type WorkerPoolHooks } from './workerPool'

/**
 * Exercises the generic `WorkerPool` primitive with a mock `Worker` — this is
 * the shared engine behind both the optimize pool (`optimize/runOptimize.ts`,
 * its own from-scratch implementation, tested separately in
 * `runOptimize.pool.test.ts`) and the convert pool (`convert/runConvert.ts`).
 * Mirrors that file's five scenarios (pool cap + queueing, error mid-task
 * fallback + respawn, error resolving every queued call, idle teardown +
 * respawn, idle-timer cancel-on-reclaim) against this generic class instead.
 */

interface Reply {
  value: number
}
interface Posted {
  id: number
  value: number
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessageerror: ((e: unknown) => void) | null = null
  posted: Posted[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: Posted): void {
    this.posted.push(msg)
  }

  terminate(): void {
    this.terminated = true
  }

  /** Simulate a successful reply for message `id`. */
  replyOk(id: number, value = 40): void {
    this.onmessage?.({ data: { id, value } })
  }

  /** Simulate the worker crashing (native `onerror`) — retires it. */
  fail(): void {
    this.onerror?.(new Event('error'))
  }
}

function makePool(poolMax: number, idleTeardownMs = 30_000): WorkerPool<Reply> {
  const hooks: WorkerPoolHooks<Reply> = {
    spawnWorker: () => new FakeWorker() as unknown as Worker,
    parseReply: (data) => {
      const d = data as { id: number; value: number }
      return { id: d.id, reply: { value: d.value } }
    },
  }
  return new WorkerPool<Reply>(hooks, { poolMax, idleTeardownMs })
}

function call(pool: WorkerPool<Reply>, value: number) {
  return pool.call((id) => ({ message: { id, value } }))
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.instances = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WorkerPool (mock Worker)', () => {
  it('caps worker growth at poolMax and queues extra concurrent calls onto existing workers', async () => {
    const pool = makePool(2)
    const promises = Array.from({ length: 5 }, (_, i) => call(pool, i))

    expect(FakeWorker.instances).toHaveLength(2)
    const totalPosted = FakeWorker.instances.reduce((n, w) => n + w.posted.length, 0)
    expect(totalPosted).toBe(5)

    for (const w of FakeWorker.instances) {
      for (const msg of w.posted) w.replyOk(msg.id)
    }
    const results = await Promise.all(promises)
    expect(results).toHaveLength(5)
    for (const r of results) expect(r?.value).toBe(40)
  })

  it('resolves null when a worker errors mid-task, and a fresh worker is spawned next call', async () => {
    const pool = makePool(2)
    const p1 = call(pool, 1)
    expect(FakeWorker.instances).toHaveLength(1)
    const workerA = FakeWorker.instances[0]
    workerA.fail()

    const r1 = await p1
    expect(r1).toBeNull()
    expect(workerA.terminated).toBe(true)

    const p2 = call(pool, 2)
    expect(FakeWorker.instances).toHaveLength(2)
    const workerB = FakeWorker.instances[1]
    workerB.replyOk(workerB.posted[0].id)
    const r2 = await p2
    expect(r2?.value).toBe(40)
  })

  it('resolves every call queued on a worker (not just the first) when it errors — teardown while queued', async () => {
    const pool = makePool(1) // everything queues on one worker
    const p1 = call(pool, 1)
    const p2 = call(pool, 2)
    const p3 = call(pool, 3)
    expect(FakeWorker.instances).toHaveLength(1)
    const w = FakeWorker.instances[0]
    expect(w.posted).toHaveLength(3)

    w.fail()
    const results = await Promise.all([p1, p2, p3])
    expect(results).toEqual([null, null, null])
    expect(w.terminated).toBe(true)
  })

  it('tears down an idle worker after idleTeardownMs and respawns fresh on the next call', async () => {
    const IDLE = 30_000
    const pool = makePool(2, IDLE)
    const p1 = call(pool, 1)
    const w = FakeWorker.instances[0]
    w.replyOk(w.posted[0].id)
    await p1
    expect(w.terminated).toBe(false)

    vi.advanceTimersByTime(IDLE + 1)
    expect(w.terminated).toBe(true)

    const p2 = call(pool, 2)
    expect(FakeWorker.instances).toHaveLength(2)
    const w2 = FakeWorker.instances[1]
    w2.replyOk(w2.posted[0].id)
    await p2
  })

  it('cancels a worker’s idle-teardown timer if it is reclaimed before the timer fires', async () => {
    const IDLE = 30_000
    const pool = makePool(2, IDLE)
    const p1 = call(pool, 1)
    const w = FakeWorker.instances[0]
    w.replyOk(w.posted[0].id)
    await p1
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(IDLE / 2)
    const p2 = call(pool, 2)
    expect(FakeWorker.instances).toHaveLength(1) // reused, not respawned
    expect(vi.getTimerCount()).toBe(0)
    expect(w.terminated).toBe(false)

    vi.advanceTimersByTime(IDLE)
    expect(w.terminated).toBe(false)

    w.replyOk(w.posted[1].id)
    await p2
  })

  it('resolves null immediately (no worker) when Worker construction fails', async () => {
    const hooks: WorkerPoolHooks<Reply> = {
      spawnWorker: () => null,
      parseReply: (data) => data as { id: number; reply: Reply | null },
    }
    const pool = new WorkerPool<Reply>(hooks, { poolMax: 4, idleTeardownMs: 1000 })
    const result = await call(pool, 1)
    expect(result).toBeNull()
    expect(pool.size).toBe(0)
  })
})
