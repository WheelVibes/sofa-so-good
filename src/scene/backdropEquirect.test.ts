import { describe, expect, it } from 'vitest'
import {
  bakeBackdropEquirect,
  bakeSkyEquirect,
  EQUIRECT_H,
  EQUIRECT_W,
  SKY_EQUIRECT_H,
  SKY_EQUIRECT_W,
} from './backdropEquirect'

// happy-dom has no real 2D canvas context, so the bakers paint nothing; we assert
// the texture-object contract (a correctly-sized 2:1 canvas) exactly like the
// guarded `bakeBackdropEquirect` path, not pixel contents (covered by the pure
// `skyGradient` / `backdropHorizon` tests).

describe('bakeSkyEquirect (RD-412 sun-driven sky adapter)', () => {
  it('returns a 2:1 equirect canvas at the sky resolution', () => {
    const canvas = bakeSkyEquirect([0, 1, 0], 4)
    expect(canvas.width).toBe(SKY_EQUIRECT_W)
    expect(canvas.height).toBe(SKY_EQUIRECT_H)
    expect(SKY_EQUIRECT_W).toBe(SKY_EQUIRECT_H * 2)
  })

  it('does not throw for night / extreme sun directions', () => {
    expect(() => bakeSkyEquirect([0, -1, 0], 10)).not.toThrow()
    expect(() => bakeSkyEquirect([1, 0, 0], 2)).not.toThrow()
  })
})

describe('bakeBackdropEquirect (static photo presets, unchanged)', () => {
  it('still returns the full-resolution 2:1 equirect canvas', () => {
    const canvas = bakeBackdropEquirect('city')
    expect(canvas.width).toBe(EQUIRECT_W)
    expect(canvas.height).toBe(EQUIRECT_H)
  })
})
