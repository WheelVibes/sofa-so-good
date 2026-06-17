import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleOnIdle } from './preloadOnIdle'

// Drive requestIdleCallback manually so the one-task-per-idle scheduling is
// deterministic. Each queued callback is run explicitly via flushIdle().
let idleQueue: Array<(() => void) | null>

function installManualIdle() {
  idleQueue = []
  ;(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (cb: () => void) => {
    idleQueue.push(cb)
    return idleQueue.length
  }
  ;(globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = (id: number) => {
    idleQueue[id - 1] = null
  }
}

/** Run queued idle callbacks one at a time, draining microtasks between each so
 *  the task's `.finally()` can queue the next idle callback. */
async function flushIdle(maxSteps = 100) {
  for (let step = 0; step < maxSteps; step++) {
    const idx = idleQueue.findIndex(Boolean)
    if (idx === -1) return
    const cb = idleQueue[idx]
    idleQueue[idx] = null
    cb?.()
    // A macrotask boundary drains all pending microtasks so the task promise's
    // .catch/.finally runs and queues the next idle callback.
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('scheduleOnIdle', () => {
  beforeEach(installManualIdle)
  afterEach(() => {
    ;(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = undefined
    ;(globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = undefined
  })

  it('runs every task in order after one idle tick', async () => {
    const order: number[] = []
    const tasks = [0, 1, 2, 3].map((n) => () => {
      order.push(n)
      return Promise.resolve()
    })
    scheduleOnIdle(tasks)
    await flushIdle()
    expect(order).toEqual([0, 1, 2, 3])
  })

  it('keeps going when a task rejects', async () => {
    const ran: number[] = []
    const tasks = [
      () => {
        ran.push(0)
        return Promise.reject(new Error('boom'))
      },
      () => {
        ran.push(1)
        return Promise.resolve()
      },
    ]
    scheduleOnIdle(tasks)
    await flushIdle()
    expect(ran).toEqual([0, 1])
  })

  it('stops mid-run once cancelled', async () => {
    const ran: number[] = []
    let cancel: () => void = () => undefined
    const tasks = [
      () => {
        ran.push(0)
        return Promise.resolve()
      },
      () => {
        ran.push(1)
        cancel() // cancel partway through the batch
        return Promise.resolve()
      },
      () => {
        ran.push(2)
        return Promise.resolve()
      },
    ]
    cancel = scheduleOnIdle(tasks)
    await flushIdle()
    expect(ran).toEqual([0, 1])
  })

  it('cancels cleanly before any task runs', async () => {
    const ran: number[] = []
    const cancel = scheduleOnIdle([
      () => {
        ran.push(0)
        return Promise.resolve()
      },
    ])
    cancel()
    await flushIdle()
    expect(ran).toEqual([])
  })

  it('falls back to a timer when requestIdleCallback is unavailable', async () => {
    ;(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = undefined
    vi.useFakeTimers()
    const ran: number[] = []
    scheduleOnIdle([
      () => {
        ran.push(0)
        return Promise.resolve()
      },
    ])
    await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    expect(ran).toEqual([0])
  })
})
