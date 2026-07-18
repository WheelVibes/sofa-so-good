import { describe, expect, it } from 'vitest'
import type { RoomFreeRect } from '../../catalog/roomFit'
import type { FurnitureDef } from '../../furniture/types'
import { buildCompareRow, COMPARE_MAX, toggleCompareSelection } from './catalogCompareData'

function def(over: Partial<FurnitureDef> = {}): FurnitureDef {
  return {
    id: 'sofa-a',
    name: 'Sofa A',
    category: 'seating',
    kind: 'gltf',
    source: 'builtin',
    url: '/models/sofa-a.glb',
    license: 'CC0',
    defaultFootprint: { w: 1.8, d: 0.9, h: 0.8 },
    ...over,
  } as FurnitureDef
}

describe('buildCompareRow', () => {
  it('formats name, dims, area from the footprint', () => {
    const row = buildCompareRow(def())
    expect(row.id).toBe('sofa-a')
    expect(row.name).toBe('Sofa A')
    expect(row.dimsLabel).toBe('1.80 × 0.90 m')
    expect(row.height).toBeCloseTo(0.8)
    expect(row.area).toBeCloseTo(1.62)
    expect(row.areaLabel).toBe('1.6 m²')
  })

  it('formats imperial units when requested', () => {
    const row = buildCompareRow(def(), { units: 'imperial' })
    expect(row.dimsLabel).toContain('′')
    expect(row.areaLabel).toContain('ft²')
  })

  it('omits price (null) when priceOn is false (the default)', () => {
    const row = buildCompareRow(def())
    expect(row.price).toBeNull()
  })

  it('includes an estimated price when priceOn is true', () => {
    const row = buildCompareRow(def(), { priceOn: true })
    expect(typeof row.price).toBe('number')
    expect(row.price).toBeGreaterThan(0)
  })

  it('resolves fit to "unknown" (dash) with no room rects', () => {
    const row = buildCompareRow(def(), { roomRects: null })
    expect(row.fit).toBe('unknown')
  })

  it('resolves a real fit verdict when room rects are supplied', () => {
    const spacious: RoomFreeRect[] = [{ w: 4, d: 4 }]
    const row = buildCompareRow(def(), { roomRects: spacious })
    expect(row.fit).toBe('fits')
  })
})

describe('toggleCompareSelection', () => {
  const a = def({ id: 'a', name: 'A', category: 'seating' })
  const b = def({ id: 'b', name: 'B', category: 'seating' })
  const c = def({ id: 'c', name: 'C', category: 'seating' })
  const d2 = def({ id: 'd', name: 'D', category: 'seating' })
  const wardrobe = def({ id: 'w', name: 'Wardrobe', category: 'storage' })

  it('adds an unselected item', () => {
    expect(toggleCompareSelection([], a)).toEqual([a])
    expect(toggleCompareSelection([a], b)).toEqual([a, b])
  })

  it('removes an already-selected item (toggle off)', () => {
    expect(toggleCompareSelection([a, b], a)).toEqual([b])
  })

  it(`caps the selection at ${COMPARE_MAX} — a 4th tap is a no-op`, () => {
    const full = [a, b, c]
    expect(toggleCompareSelection(full, d2)).toEqual(full)
  })

  it('honours a custom max', () => {
    expect(toggleCompareSelection([a], b, 1)).toEqual([a])
  })

  it('starts a fresh single-item selection when the new item is a different category', () => {
    expect(toggleCompareSelection([a, b], wardrobe)).toEqual([wardrobe])
  })
})
