import { describe, expect, it } from 'vitest'
import { nearestMeasurableHit } from './walkMeasureHit'

/** Minimal fake `Object3D` — only the fields `walkMeasureHit.ts` reads. */
function obj(opts: { visible?: boolean; noExport?: boolean; parent?: unknown } = {}) {
  return {
    visible: opts.visible ?? true,
    userData: opts.noExport ? { noExport: true } : {},
    parent: opts.parent ?? null,
  }
}

function hit(object: unknown, point: [number, number, number]) {
  return { object, point: { x: point[0], y: point[1], z: point[2] } }
}

describe('nearestMeasurableHit', () => {
  it('returns null for an empty hit list (aimed at empty sky)', () => {
    expect(nearestMeasurableHit([])).toBeNull()
  })

  it('returns the nearest hit point when it is a real, visible surface', () => {
    const result = nearestMeasurableHit([
      hit(obj(), [1, 2, 3]),
      hit(obj(), [5, 5, 5]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([1, 2, 3])
  })

  it('skips an invisible hit (a faded-out wall reveal) and falls through to the next', () => {
    const result = nearestMeasurableHit([
      hit(obj({ visible: false }), [1, 2, 3]),
      hit(obj(), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([4, 5, 6])
  })

  it('skips a hit whose ANCESTOR is invisible, not just the mesh itself', () => {
    const parent = obj({ visible: false })
    const child = obj({ parent })
    const result = nearestMeasurableHit([
      hit(child, [1, 2, 3]),
      hit(obj(), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([4, 5, 6])
  })

  it('skips a noExport-tagged auxiliary overlay (the measure tool cannot measure to its own markers)', () => {
    const result = nearestMeasurableHit([
      hit(obj({ noExport: true }), [1, 2, 3]),
      hit(obj(), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([4, 5, 6])
  })

  it('skips a hit whose ANCESTOR carries the noExport tag', () => {
    const parent = obj({ noExport: true })
    const child = obj({ parent })
    const result = nearestMeasurableHit([
      hit(child, [1, 2, 3]),
      hit(obj(), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([4, 5, 6])
  })

  it('returns null when every hit is invisible or auxiliary', () => {
    const result = nearestMeasurableHit([
      hit(obj({ visible: false }), [1, 2, 3]),
      hit(obj({ noExport: true }), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toBeNull()
  })

  it('ignores a hit with no object', () => {
    const result = nearestMeasurableHit([
      { object: null, point: { x: 1, y: 2, z: 3 } },
      hit(obj(), [4, 5, 6]),
    ] as unknown as Parameters<typeof nearestMeasurableHit>[0])
    expect(result).toEqual([4, 5, 6])
  })
})
