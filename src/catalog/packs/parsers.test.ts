import { describe, expect, it } from 'vitest'
import { parseKenneyFurnitureKit } from './parsers'

const fakeFiles = (paths: string[]): Record<string, Uint8Array> =>
  Object.fromEntries(paths.map((p) => [p, new Uint8Array([0])]))

describe('parseKenneyFurnitureKit', () => {
  it('extracts only Models/GLTF format/*.glb files', () => {
    const files = fakeFiles([
      'Models/GLTF format/bedDouble.glb',
      'Models/FBX format/bedDouble.fbx',
      'Models/OBJ format/bedDouble.obj',
      'Isometric/bedDouble_NE.png',
      'Instructions.url',
    ])
    const entries = parseKenneyFurnitureKit(files)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('bedDouble')
    expect(entries[0].glbPath).toBe('Models/GLTF format/bedDouble.glb')
  })

  it('maps category by substring rules in priority order', () => {
    const files = fakeFiles([
      'Models/GLTF format/bedDouble.glb',
      'Models/GLTF format/loungeSofaCorner.glb',
      'Models/GLTF format/tableCoffee.glb',
      'Models/GLTF format/bookcaseClosed.glb',
      'Models/GLTF format/kitchenStove.glb',
      'Models/GLTF format/lampRoundFloor.glb',
      'Models/GLTF format/pottedPlant.glb',
      'Models/GLTF format/cabinetBed.glb',
    ])
    const entries = parseKenneyFurnitureKit(files)
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.category]))
    expect(byId.bedDouble).toBe('beds')
    expect(byId.loungeSofaCorner).toBe('seating')
    expect(byId.tableCoffee).toBe('tables')
    expect(byId.bookcaseClosed).toBe('storage')
    expect(byId.kitchenStove).toBe('kitchen')
    expect(byId.lampRoundFloor).toBe('lighting')
    expect(byId.pottedPlant).toBe('decor')
    expect(byId.cabinetBed).toBe('beds')
  })

  it('filters architectural entries (walls, floors, doors, stairs, ceilingFan, paneling)', () => {
    const files = fakeFiles([
      'Models/GLTF format/wallCorner.glb',
      'Models/GLTF format/floorFull.glb',
      'Models/GLTF format/doorway.glb',
      'Models/GLTF format/stairsCorner.glb',
      'Models/GLTF format/ceilingFan.glb',
      'Models/GLTF format/paneling.glb',
      'Models/GLTF format/bedDouble.glb',
    ])
    const entries = parseKenneyFurnitureKit(files)
    expect(entries.map((e) => e.id)).toEqual(['bedDouble'])
  })

  it('converts camelCase id to Title Case display name', () => {
    const files = fakeFiles(['Models/GLTF format/loungeSofaCorner.glb'])
    const [e] = parseKenneyFurnitureKit(files)
    expect(e.name).toBe('Lounge Sofa Corner')
  })
})
