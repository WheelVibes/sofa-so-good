// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('savedMaterialsSlice — name, save, rename, remove', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    try {
      localStorage.removeItem('hdb_saved_materials')
    } catch {
      // ignore
    }
  })

  it('saves a composed finish as a named material', () => {
    useStore.getState().saveMaterial({
      finishId: 'compose:marble:#aabbcc',
      name: 'My marble',
      category: 'floor',
    })
    const saved = useStore.getState().savedMaterials
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual({
      finishId: 'compose:marble:#aabbcc',
      name: 'My marble',
      category: 'floor',
    })
  })

  it('re-saving the same finish id updates the name (no duplicate)', () => {
    const id = 'tint:wall-paint-white:#223344'
    useStore.getState().saveMaterial({ finishId: id, name: 'First', category: 'wall' })
    useStore.getState().saveMaterial({ finishId: id, name: 'Renamed', category: 'wall' })
    const saved = useStore.getState().savedMaterials
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Renamed')
  })

  it('renameSavedMaterial changes only the name', () => {
    const id = 'compose:wood:#b88f5d'
    useStore.getState().saveMaterial({ finishId: id, name: 'Oak', category: 'floor' })
    useStore.getState().renameSavedMaterial(id, 'Warm oak planks')
    expect(useStore.getState().savedMaterials[0].name).toBe('Warm oak planks')
    expect(useStore.getState().savedMaterials[0].finishId).toBe(id)
  })

  it('removeSavedMaterial drops the entry', () => {
    const id = 'compose:tile:#ffffff'
    useStore.getState().saveMaterial({ finishId: id, name: 'White tile', category: 'wall' })
    useStore.getState().removeSavedMaterial(id)
    expect(useStore.getState().savedMaterials).toHaveLength(0)
  })

  it('ignores a blank name and a blank finish id', () => {
    useStore
      .getState()
      .saveMaterial({ finishId: 'compose:wood:#b88f5d', name: '   ', category: 'floor' })
    useStore.getState().saveMaterial({ finishId: '', name: 'X', category: 'floor' })
    expect(useStore.getState().savedMaterials).toHaveLength(0)
  })

  it('persists to localStorage so saves survive a reload', () => {
    useStore.getState().saveMaterial({
      finishId: 'compose:terrazzo:#d0c8b0',
      name: 'Terrazzo cream',
      category: 'floor',
    })
    const raw = localStorage.getItem('hdb_saved_materials')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed[0].name).toBe('Terrazzo cream')
  })
})
