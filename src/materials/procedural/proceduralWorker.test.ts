/**
 * Unit tests for the OffscreenCanvas procedural texture worker subsystem.
 * Tests:
 *   1. Request coalescing — same key generates once in the worker
 *   2. Fallback on worker failure (null returned → caller falls back to sync)
 *   3. Seed determinism — generateProceduralRaw is pixel-identical for same inputs
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateProceduralRaw } from './generators'
import {
  _resetProceduralWorker,
  _setOffscreenAvailableForTest,
  _setWorkerFactoryForTest,
  isProceduralWorkerAvailable,
  proceduralWorkerKey,
  requestProceduralWorker,
} from './runProceduralWorker'

// ── Seed determinism ──────────────────────────────────────────────────────────

describe('generateProceduralRaw — seed determinism', () => {
  it('produces identical pixel output for identical inputs', { timeout: 15000 }, () => {
    const a = generateProceduralRaw('floor-wood', 'wood', '#a07850', 256)
    const b = generateProceduralRaw('floor-wood', 'wood', '#a07850', 256)
    expect(a.size).toBe(b.size)
    expect(a.metalness).toBe(b.metalness)
    // Compare a representative slice (first 256 bytes) of each map.
    expect(Array.from(a.albedo.slice(0, 256))).toEqual(Array.from(b.albedo.slice(0, 256)))
    expect(Array.from(a.normal.slice(0, 256))).toEqual(Array.from(b.normal.slice(0, 256)))
    expect(Array.from(a.roughness.slice(0, 256))).toEqual(Array.from(b.roughness.slice(0, 256)))
  })

  it('produces different pixel output for different material ids (different seeds)', {
    timeout: 15000,
  }, () => {
    const a = generateProceduralRaw('mat-a', 'wood', '#a07850', 256)
    const b = generateProceduralRaw('mat-b', 'wood', '#a07850', 256)
    // The seed is derived from id+pattern, so different ids → different textures.
    const aSlice = Array.from(a.albedo.slice(0, 64))
    const bSlice = Array.from(b.albedo.slice(0, 64))
    expect(aSlice).not.toEqual(bSlice)
  })

  it('size parameter is respected and reflected in output arrays', { timeout: 15000 }, () => {
    const r256 = generateProceduralRaw('carpet-test', 'carpet', '#888888', 256)
    const r512 = generateProceduralRaw('carpet-test', 'carpet', '#888888', 512)
    expect(r256.size).toBe(256)
    expect(r512.size).toBe(512)
    expect(r256.albedo.length).toBe(256 * 256 * 4)
    expect(r512.albedo.length).toBe(512 * 512 * 4)
  })

  it('all supported patterns produce non-trivial output', () => {
    const patterns = ['tile', 'carpet', 'concrete', 'marble', 'wood', 'brick'] as const
    for (const p of patterns) {
      const r = generateProceduralRaw(`test-${p}`, p, '#8B7355', 64)
      // Non-trivial: the albedo is not all zeroes.
      const nonZero = r.albedo.some((v) => v > 0)
      expect(nonZero, `${p} albedo should be non-zero`).toBe(true)
    }
  })
})

// ── Worker key ────────────────────────────────────────────────────────────────

describe('proceduralWorkerKey', () => {
  it('returns a stable string for the same inputs', () => {
    expect(proceduralWorkerKey('a', 'tile', '#fff', 256)).toBe(
      proceduralWorkerKey('a', 'tile', '#fff', 256),
    )
  })

  it('differs when any input differs', () => {
    const base = proceduralWorkerKey('a', 'tile', '#fff', 256)
    expect(proceduralWorkerKey('b', 'tile', '#fff', 256)).not.toBe(base)
    expect(proceduralWorkerKey('a', 'wood', '#fff', 256)).not.toBe(base)
    expect(proceduralWorkerKey('a', 'tile', '#000', 256)).not.toBe(base)
    expect(proceduralWorkerKey('a', 'tile', '#fff', 512)).not.toBe(base)
  })
})

// ── Worker availability & coalescing ─────────────────────────────────────────

describe('requestProceduralWorker — fallback when worker unavailable', () => {
  beforeEach(() => {
    _resetProceduralWorker()
    // Force the feature-detection flag off so the worker path is skipped.
    _setOffscreenAvailableForTest(false)
  })
  afterEach(() => {
    _resetProceduralWorker()
  })

  it('returns null when OffscreenCanvas/Worker is unavailable', async () => {
    const result = await requestProceduralWorker('mat-x', 'tile', '#fff', 256)
    expect(result).toBeNull()
  })

  it('isProceduralWorkerAvailable returns false when feature not detected', () => {
    expect(isProceduralWorkerAvailable()).toBe(false)
  })
})

describe('requestProceduralWorker — coalescing', () => {
  // We inject a fake Worker factory to count how many distinct worker messages are sent.
  let workerMessages: number

  beforeEach(() => {
    _resetProceduralWorker()
    workerMessages = 0

    // Inject a factory that creates a Worker-like object replying to each
    // postMessage with a success result.
    _setWorkerFactoryForTest(() => {
      const fakeBmp = () => ({ width: 256, height: 256, close: () => {} })
      let _handler: ((e: MessageEvent) => void) | null = null
      const w = {
        get onmessage() {
          return _handler
        },
        set onmessage(v: ((e: MessageEvent) => void) | null) {
          _handler = v
        },
        set onerror(_v: unknown) {},
        postMessage(msg: unknown) {
          workerMessages++
          const req = msg as { id: number }
          Promise.resolve().then(() => {
            _handler?.({
              data: {
                id: req.id,
                ok: true,
                albedo: fakeBmp(),
                normal: fakeBmp(),
                roughness: fakeBmp(),
                metalness: 0,
              },
            } as unknown as MessageEvent)
          })
        },
        terminate() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false
        },
      }
      return w as unknown as Worker
    })
    _setOffscreenAvailableForTest(true)
  })

  afterEach(() => {
    _resetProceduralWorker()
  })

  it('sends only one worker message for two concurrent identical requests', async () => {
    const p1 = requestProceduralWorker('mat-c', 'tile', '#fff', 256)
    const p2 = requestProceduralWorker('mat-c', 'tile', '#fff', 256)
    const [r1, r2] = await Promise.all([p1, p2])
    // Same Promise → same result → only one message sent.
    expect(workerMessages).toBe(1)
    expect(r1).toBe(r2)
  })

  it('sends two worker messages for two different requests', async () => {
    const p1 = requestProceduralWorker('mat-d', 'tile', '#fff', 256)
    const p2 = requestProceduralWorker('mat-e', 'tile', '#fff', 256)
    await Promise.all([p1, p2])
    expect(workerMessages).toBe(2)
  })

  it('sends a new message for the same key after the first resolves', async () => {
    await requestProceduralWorker('mat-f', 'tile', '#fff', 256)
    await requestProceduralWorker('mat-f', 'tile', '#fff', 256)
    expect(workerMessages).toBe(2)
  })
})

describe('requestProceduralWorker — worker error fallback', () => {
  beforeEach(() => {
    _resetProceduralWorker()

    // Inject a factory that always replies with ok:false.
    _setWorkerFactoryForTest(() => {
      let _handler: ((e: MessageEvent) => void) | null = null
      const w = {
        get onmessage() {
          return _handler
        },
        set onmessage(v: ((e: MessageEvent) => void) | null) {
          _handler = v
        },
        set onerror(_v: unknown) {},
        postMessage(msg: unknown) {
          const req = msg as { id: number }
          Promise.resolve().then(() => {
            _handler?.({
              data: { id: req.id, ok: false, error: 'OffscreenCanvas not supported' },
            } as unknown as MessageEvent)
          })
        },
        terminate() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false
        },
      }
      return w as unknown as Worker
    })
    _setOffscreenAvailableForTest(true)
  })

  afterEach(() => {
    _resetProceduralWorker()
  })

  it('returns null when the worker replies with ok:false', async () => {
    const result = await requestProceduralWorker('mat-g', 'wood', '#886644', 256)
    expect(result).toBeNull()
  })
})
