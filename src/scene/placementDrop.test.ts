import type { Group } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { __resetAnimatedSources, animatedSourceCount } from './animatedSources'
import {
  __resetDrops,
  beginDrop,
  DROP_HEIGHT,
  DROP_MS,
  dropEase,
  dropOffsetY,
  hasActiveDrops,
  registerDropGroup,
  tickDrops,
} from './placementDrop'

afterEach(() => {
  __resetDrops()
  __resetAnimatedSources()
})

/** Minimal stand-in for a three Group (only `.position.y` is touched). */
const stubGroup = (y = 0): Group => ({ position: { y } }) as unknown as Group

describe('placementDrop — dropEase', () => {
  it('pins endpoints and decelerates (ease-out: past the line early)', () => {
    expect(dropEase(0)).toBe(0)
    expect(dropEase(1)).toBe(1)
    expect(dropEase(0.5)).toBeGreaterThan(0.5) // ease-out overshoots the linear line
  })
  it('clamps out-of-range input', () => {
    expect(dropEase(-1)).toBe(0)
    expect(dropEase(2)).toBe(1)
  })
})

describe('placementDrop — dropOffsetY', () => {
  it('starts at the full drop height and lands at 0', () => {
    expect(dropOffsetY(0)).toBeCloseTo(DROP_HEIGHT, 6)
    expect(dropOffsetY(DROP_MS)).toBe(0)
    expect(dropOffsetY(DROP_MS + 100)).toBe(0)
  })
  it('is monotonically non-increasing over the drop', () => {
    let prev = Number.POSITIVE_INFINITY
    for (let ms = 0; ms <= DROP_MS; ms += DROP_MS / 20) {
      const y = dropOffsetY(ms)
      expect(y).toBeLessThanOrEqual(prev + 1e-9)
      prev = y
    }
  })
})

describe('placementDrop — tickDrops lifecycle', () => {
  it('drives a registered group Y = rest + offset, then snaps to rest and ends', () => {
    const g = stubGroup(0.5) // resting Y (e.g. a lifted GLB)
    registerDropGroup('a', g)
    beginDrop('a', 1000)
    expect(hasActiveDrops()).toBe(true)
    expect(animatedSourceCount()).toBe(1) // holds the render pump open

    // Mid-drop: lifted above rest.
    expect(tickDrops(1000)).toBe(true)
    expect(g.position.y).toBeCloseTo(0.5 + DROP_HEIGHT, 6)
    expect(tickDrops(1000 + DROP_MS / 2)).toBe(true)
    expect(g.position.y).toBeGreaterThan(0.5)
    expect(g.position.y).toBeLessThan(0.5 + DROP_HEIGHT)

    // Past the end: snaps back to rest, drop ends, pump hold released.
    expect(tickDrops(1000 + DROP_MS + 1)).toBe(false)
    expect(g.position.y).toBeCloseTo(0.5, 6)
    expect(hasActiveDrops()).toBe(false)
    expect(animatedSourceCount()).toBe(0)
  })

  it('is a no-op with no active drops', () => {
    expect(tickDrops(5000)).toBe(false)
  })

  it('unregistering the group mid-drop still ends the drop (no leaked pump hold)', () => {
    const g = stubGroup(0)
    const dispose = registerDropGroup('b', g)
    beginDrop('b', 0)
    tickDrops(0)
    dispose() // item unmounts mid-drop
    expect(tickDrops(DROP_MS + 1)).toBe(false)
    expect(hasActiveDrops()).toBe(false)
    expect(animatedSourceCount()).toBe(0)
  })
})
