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
  it('exposes a curated set (12–14) grouped into the four categories', () => {
    expect(COMPONENT_LIBRARY.length).toBeGreaterThanOrEqual(12)
    expect(COMPONENT_LIBRARY.length).toBeLessThanOrEqual(14)
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
