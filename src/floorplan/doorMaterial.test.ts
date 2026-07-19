import { describe, expect, it } from 'vitest'
import { resolveDoorLeafMaterialKind } from './doorMaterial'

describe('resolveDoorLeafMaterialKind', () => {
  it('defaults an ordinary panel/flush/glazed door to painted', () => {
    expect(resolveDoorLeafMaterialKind({})).toBe('painted')
    expect(resolveDoorLeafMaterialKind({ style: 'panel' })).toBe('painted')
    expect(resolveDoorLeafMaterialKind({ style: 'flush' })).toBe('painted')
    expect(resolveDoorLeafMaterialKind({ style: 'glazed' })).toBe('painted')
  })

  it('defaults a bifold door to vinyl (the SG toilet-door standard)', () => {
    expect(resolveDoorLeafMaterialKind({ style: 'bifold' })).toBe('vinyl')
  })

  it('defaults sliding + double doors to painted (only bifold is vinyl by default)', () => {
    expect(resolveDoorLeafMaterialKind({ style: 'sliding' })).toBe('painted')
    expect(resolveDoorLeafMaterialKind({ style: 'double' })).toBe('painted')
    // Explicit material still wins.
    expect(resolveDoorLeafMaterialKind({ style: 'sliding', material: 'vinyl' })).toBe('vinyl')
  })

  it('an explicit material always wins over the style default', () => {
    expect(resolveDoorLeafMaterialKind({ style: 'bifold', material: 'wood' })).toBe('wood')
    expect(resolveDoorLeafMaterialKind({ style: 'bifold', material: 'painted' })).toBe('painted')
    expect(resolveDoorLeafMaterialKind({ style: 'panel', material: 'vinyl' })).toBe('vinyl')
  })

  it('falls back to painted for a garbage/legacy material value', () => {
    expect(resolveDoorLeafMaterialKind({ material: 'chrome' as never })).toBe('painted')
  })
})
