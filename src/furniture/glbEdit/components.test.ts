import { describe, expect, it } from 'vitest'
import {
  buildComponentParts,
  COMPONENT_CATEGORIES,
  COMPONENT_LIBRARY,
  type ComponentDef,
  componentById,
  resolveComponentParams,
} from './components'
import { SHAPE_KINDS, type ShapePart } from './editSpec'

/** Loose AABB from a part ignoring rotation (position ± size/2) — a rotated
 *  member's true extent differs, but this is enough to sanity-check placement. */
function partBox(p: ShapePart) {
  return {
    minY: p.position[1] - p.size[1] / 2,
    maxY: p.position[1] + p.size[1] / 2,
  }
}

const VALID_KINDS = new Set<string>([...SHAPE_KINDS])

describe('component library', () => {
  it('exposes a curated set (17–19) grouped into the five categories', () => {
    expect(COMPONENT_LIBRARY.length).toBeGreaterThanOrEqual(17)
    expect(COMPONENT_LIBRARY.length).toBeLessThanOrEqual(19)
    const cats = new Set(COMPONENT_LIBRARY.map((c) => c.category))
    for (const c of COMPONENT_CATEGORIES) expect(cats.has(c)).toBe(true)
  })

  it('has unique ids and 1–3 params each', () => {
    const ids = new Set<string>()
    for (const c of COMPONENT_LIBRARY) {
      expect(ids.has(c.id)).toBe(false)
      ids.add(c.id)
      expect(c.params.length).toBeGreaterThanOrEqual(1)
      expect(c.params.length).toBeLessThanOrEqual(3)
    }
  })

  it('componentById resolves known ids and rejects unknown', () => {
    expect(componentById('leg-tapered-round')?.name).toBe('Tapered leg')
    expect(componentById('nope')).toBeNull()
  })

  it.each(
    COMPONENT_LIBRARY.map((c) => [c.id, c] as const),
  )('%s builds valid, finite, uniquely-identified parts', (_id, def: ComponentDef) => {
    const parts = buildComponentParts(def)
    expect(parts.length).toBeGreaterThanOrEqual(1)
    const ids = new Set<string>()
    for (const p of parts) {
      expect(VALID_KINDS.has(p.kind)).toBe(true)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      for (const v of [...p.position, ...p.size]) expect(Number.isFinite(v)).toBe(true)
      // Every dimension positive (no degenerate geometry).
      for (const s of p.size) expect(s).toBeGreaterThan(0)
      expect(typeof p.color).toBe('string')
      if (p.rotation) for (const r of p.rotation) expect(Number.isFinite(r)).toBe(true)
    }
  })

  it('two builds mint fresh, non-overlapping part ids', () => {
    const def = componentById('handle-bar-pull')!
    const a = buildComponentParts(def)
    const b = buildComponentParts(def)
    const aIds = new Set(a.map((p) => p.id))
    expect(b.every((p) => !aIds.has(p.id))).toBe(true)
  })

  it('floor-mount fittings hang DOWN — top at/above the attach plane, body below it', () => {
    for (const def of COMPONENT_LIBRARY.filter((c) => c.mount === 'floor')) {
      const parts = buildComponentParts(def)
      const boxes = parts.map(partBox)
      const top = Math.max(...boxes.map((b) => b.maxY))
      const bottom = Math.min(...boxes.map((b) => b.minY))
      // Nothing pokes meaningfully above the attach plane (y = 0)…
      expect(top).toBeLessThanOrEqual(0.03)
      // …and the body reaches down below it (a real leg/foot has depth).
      expect(bottom).toBeLessThan(-0.005)
    }
  })

  it('a floor leg reaches roughly its requested height', () => {
    const def = componentById('leg-tapered-round')!
    const parts = buildComponentParts(def, { height: 0.5 })
    const bottom = Math.min(...parts.map((p) => partBox(p).minY))
    expect(bottom).toBeLessThanOrEqual(-0.45)
    expect(bottom).toBeGreaterThanOrEqual(-0.55)
  })

  it('slat set builds one box per slat (count → part count)', () => {
    const def = componentById('slat-set')!
    expect(buildComponentParts(def, { count: 4 }).length).toBe(4)
    expect(buildComponentParts(def, { count: 10 }).length).toBe(10)
    // A fractional/garbage count rounds to a whole number of slats.
    expect(buildComponentParts(def, { count: 6.4 }).length).toBe(6)
  })

  it('drawer box is a 5-part open carcass (front + back + 2 sides + bottom)', () => {
    const parts = buildComponentParts(componentById('drawer-box')!, {
      width: 0.4,
      height: 0.14,
      depth: 0.45,
    })
    expect(parts.length).toBe(5)
    // Rim flush to the attach plane (top at y≈0), body hanging below.
    const top = Math.max(...parts.map((p) => p.position[1] + p.size[1] / 2))
    const bottom = Math.min(...parts.map((p) => p.position[1] - p.size[1] / 2))
    expect(top).toBeLessThanOrEqual(0.01)
    expect(bottom).toBeCloseTo(-0.14, 2)
  })

  it('shelf pins are a pair spaced by the spacing param', () => {
    const parts = buildComponentParts(componentById('shelf-pin-pair')!, { spacing: 0.4 })
    expect(parts.length).toBe(2)
    const xs = parts.map((p) => p.position[0]).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBeCloseTo(0.4, 3)
  })

  it('clamps out-of-range params to the declared bounds', () => {
    const def = componentById('leg-tapered-round')!
    const hi = resolveComponentParams(def, { height: 99, diameter: -3 })
    expect(hi.height).toBe(0.75)
    expect(hi.diameter).toBe(0.03)
    // Garbage / missing → default.
    const d = resolveComponentParams(def, { height: Number.NaN })
    expect(d.height).toBe(0.42)
    expect(d.diameter).toBe(0.055)
  })
})
