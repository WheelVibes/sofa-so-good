import { describe, expect, it } from 'vitest'
import { PHOTO_PROBE_WARMTH, tintHex, warmthTintRGB } from './look'

const rb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return ((n >> 16) & 255) / Math.max(1, n & 255)
}

describe('tintHex — warming the IBL probe', () => {
  it('returns the INPUT STRING at bias 0, so the shipped probe never re-bakes', () => {
    // Identity matters here beyond correctness: the Lightformer colours are React
    // props, and a new string would re-bake the probe's render target on every
    // render (see GPU-STARVE-2 in `SceneEnvironment`).
    for (const h of ['#cfe0f2', '#9fb0c4', '#6b5b48']) expect(tintHex(h, 0)).toBe(h)
  })

  it('warms: R/B rises, and it rises further with more bias', () => {
    const base = rb('#cfe0f2')
    const a = rb(tintHex('#cfe0f2', 0.2))
    const b = rb(tintHex('#cfe0f2', PHOTO_PROBE_WARMTH))
    expect(a).toBeGreaterThan(base)
    expect(b).toBeGreaterThan(a)
  })

  it('cools when asked to — the bias is signed', () => {
    expect(rb(tintHex('#cfe0f2', -0.4))).toBeLessThan(rb('#cfe0f2'))
  })

  it('matches `warmthTintRGB`, so probe and analytical lights agree', () => {
    const t = warmthTintRGB(0.3)
    const out = tintHex('#808080', 0.3)
    const n = Number.parseInt(out.slice(1), 16)
    expect((n >> 16) & 255).toBe(Math.round(128 * t[0]))
    expect(n & 255).toBe(Math.round(128 * t[2]))
  })

  it('clamps rather than wrapping, and never emits a malformed colour', () => {
    for (const [h, b] of [
      ['#ffffff', 1],
      ['#000000', -1],
      ['#ffe6c2', 1],
    ] as const) {
      expect(tintHex(h, b)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('passes a non-hex string through untouched', () => {
    expect(tintHex('rgba(1,2,3,0.5)', 0.4)).toBe('rgba(1,2,3,0.5)')
    expect(tintHex('#abc', 0.4)).toBe('#abc')
  })
})
