import { describe, expect, it } from 'vitest'
import { defaultSpec } from '../furniture/parametric/spec'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { collectCarpentrySheets } from './carpentrySheets'

function userDef(id: string, name: string, parametricSpec?: string): FurnitureDef {
  return {
    id,
    name,
    category: 'storage',
    kind: 'gltf',
    source: 'user',
    assetId: `asset-${id}`,
    uploadedAt: new Date().toISOString(),
    defaultFootprint: { w: 1, d: 1, h: 1 },
    parametricSpec,
  } as FurnitureDef
}

function item(id: string, defId: string, label?: string): FurnitureItem {
  return { id, defId, position: [0, 0], rotation: 0, props: {}, label }
}

describe('collectCarpentrySheets', () => {
  const wardrobeSpec = JSON.stringify(defaultSpec('wardrobe'))
  const deskSpec = JSON.stringify(defaultSpec('desk'))

  it('skips items whose def carries no parametricSpec', () => {
    const catalog = { 'plain-sofa': userDef('plain-sofa', 'Plain sofa') }
    const items = [item('i1', 'plain-sofa')]
    expect(collectCarpentrySheets(items, catalog)).toEqual([])
  })

  it('produces one entry per distinct def, in first-seen order', () => {
    const catalog = {
      wardrobe1: userDef('wardrobe1', 'Custom wardrobe', wardrobeSpec),
      desk1: userDef('desk1', 'Custom desk', deskSpec),
    }
    const items = [item('i1', 'wardrobe1'), item('i2', 'desk1')]
    const sheets = collectCarpentrySheets(items, catalog)
    expect(sheets.map((s) => s.name)).toEqual(['Custom wardrobe', 'Custom desk'])
    expect(sheets.every((s) => s.count === 1)).toBe(true)
  })

  it('dedupes repeated placements of the same def into one entry with the right count', () => {
    const catalog = { wardrobe1: userDef('wardrobe1', 'Custom wardrobe', wardrobeSpec) }
    const items = [item('i1', 'wardrobe1'), item('i2', 'wardrobe1'), item('i3', 'wardrobe1')]
    const sheets = collectCarpentrySheets(items, catalog)
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.count).toBe(3)
  })

  it('prefers a per-instance label over the def name', () => {
    const catalog = { wardrobe1: userDef('wardrobe1', 'Custom wardrobe', wardrobeSpec) }
    const items = [item('i1', 'wardrobe1', 'Hallway wardrobe')]
    const sheets = collectCarpentrySheets(items, catalog)
    expect(sheets[0]?.name).toBe('Hallway wardrobe')
  })

  it('returns [] when no items are placed', () => {
    expect(collectCarpentrySheets([], {})).toEqual([])
  })

  it('gracefully skips a def with corrupt parametricSpec JSON', () => {
    const catalog = { bad: userDef('bad', 'Corrupt', '{not json') }
    const items = [item('i1', 'bad')]
    expect(collectCarpentrySheets(items, catalog)).toEqual([])
  })
})
