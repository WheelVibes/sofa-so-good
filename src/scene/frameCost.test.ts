import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetFrameCostMeter,
  closeFrameCostSample,
  installFrameCostMeter,
  percentileSorted,
  summariseCosts,
  takeCostWindow,
  uninstallFrameCostMeter,
} from './frameCost'

describe('percentileSorted', () => {
  it('picks the nearest rank', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentileSorted(a, 0.5)).toBe(6)
    expect(percentileSorted(a, 0.9)).toBe(10)
    expect(percentileSorted(a, 0)).toBe(1)
  })

  it('clamps at the top rank instead of running off the end', () => {
    expect(percentileSorted([1, 2, 3], 1)).toBe(3)
  })

  it('reports -1 for no data, so "no samples" is distinguishable from 0ms', () => {
    // A 0 would read as a free frame and make every tier look promotable.
    expect(percentileSorted([], 0.9)).toBe(-1)
  })

  it('handles a single sample', () => {
    expect(percentileSorted([7], 0.9)).toBe(7)
  })
})

describe('summariseCosts', () => {
  it('summarises unsorted input', () => {
    const s = summariseCosts([9, 1, 5, 3, 7])
    expect(s.n).toBe(5)
    expect(s.p50).toBe(5)
  })

  it('returns the empty summary for no samples', () => {
    expect(summariseCosts([])).toEqual({ n: 0, p50: -1, p90: -1 })
  })

  it('drops non-finite and negative samples rather than poisoning percentiles', () => {
    // Infinity is not finite, so it is dropped too — only the two real 5ms
    // samples survive.
    const s = summariseCosts([5, Number.NaN, -3, 5, Number.POSITIVE_INFINITY])
    expect(s.n).toBe(2)
    expect(s.p50).toBe(5)
  })

  it('returns the empty summary when every sample is invalid', () => {
    expect(summariseCosts([Number.NaN, -1]).n).toBe(0)
  })

  it('puts p90 at or above p50', () => {
    const s = summariseCosts([1, 2, 3, 4, 5, 6, 7, 8, 9, 40])
    expect(s.p90).toBeGreaterThanOrEqual(s.p50)
  })
})

describe('the live meter', () => {
  beforeEach(() => {
    __resetFrameCostMeter()
  })

  /** A renderer stub whose `render` burns a measurable amount of wall time. */
  function fakeGl(busyMs: number) {
    const calls = { n: 0 }
    return {
      calls,
      gl: {
        render: () => {
          calls.n++
          const until = performance.now() + busyMs
          while (performance.now() < until) {
            /* burn */
          }
        },
      } as { render: (...a: never[]) => unknown },
    }
  }

  it('times renders and still calls through', () => {
    const { gl, calls } = fakeGl(2)
    installFrameCostMeter(gl)
    gl.render()
    closeFrameCostSample()
    expect(calls.n).toBe(1)
    const w = takeCostWindow()
    expect(w.n).toBe(1)
    expect(w.p50).toBeGreaterThan(0)
  })

  it('SUMS every render inside one displayed frame', () => {
    // The load-bearing behaviour: the post stack issues ~18 sibling render()
    // calls per frame, so per-call timing would report the parts, not the whole,
    // and inflate the apparent render rate ~18x.
    const { gl } = fakeGl(2)
    installFrameCostMeter(gl)
    gl.render()
    gl.render()
    gl.render()
    closeFrameCostSample()
    const w = takeCostWindow()
    expect(w.n).toBe(1)
    expect(w.p50).toBeGreaterThanOrEqual(5)
  })

  it('contributes NO sample for a frame that rendered nothing', () => {
    // Demand mode idles constantly; a 0ms non-frame would drag every percentile
    // toward zero and make any tier look free.
    const { gl } = fakeGl(1)
    installFrameCostMeter(gl)
    closeFrameCostSample()
    closeFrameCostSample()
    expect(takeCostWindow()).toEqual({ n: 0, p50: -1, p90: -1 })
  })

  it('separates frames', () => {
    const { gl } = fakeGl(1)
    installFrameCostMeter(gl)
    for (let i = 0; i < 4; i++) {
      gl.render()
      closeFrameCostSample()
    }
    expect(takeCostWindow().n).toBe(4)
  })

  it('drains on take, so windows do not overlap', () => {
    const { gl } = fakeGl(1)
    installFrameCostMeter(gl)
    gl.render()
    closeFrameCostSample()
    expect(takeCostWindow().n).toBe(1)
    expect(takeCostWindow().n).toBe(0)
  })

  it('is idempotent for the same renderer (no double-wrapping)', () => {
    const { gl } = fakeGl(2)
    installFrameCostMeter(gl)
    const wrapped = gl.render
    installFrameCostMeter(gl)
    expect(gl.render).toBe(wrapped)
  })

  it('re-wraps a NEW renderer after a context loss rebuild', () => {
    const a = fakeGl(1)
    const b = fakeGl(1)
    installFrameCostMeter(a.gl)
    installFrameCostMeter(b.gl)
    b.gl.render()
    closeFrameCostSample()
    expect(takeCostWindow().n).toBe(1)
    // The old renderer must have been restored, not left wrapped.
    a.gl.render()
    closeFrameCostSample()
    expect(takeCostWindow().n).toBe(0)
  })

  it('restores the original render on uninstall', () => {
    const { gl, calls } = fakeGl(1)
    const original = gl.render
    installFrameCostMeter(gl)
    uninstallFrameCostMeter()
    expect(gl.render).toBe(original)
    gl.render()
    closeFrameCostSample()
    expect(calls.n).toBe(1)
    expect(takeCostWindow().n).toBe(0)
  })
})
