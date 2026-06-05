import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('userStylesSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('captures the current per-room finishes as a named style', () => {
    const s = useStore.getState()
    s.setFloorFinish('livingDining', 'floor-wood-teak')
    s.setWallFinish('mainBedroom', 'wall-paint-sage')
    s.saveUserStyle('  My Look  ')
    const styles = useStore.getState().userStyles
    expect(styles).toHaveLength(1)
    expect(styles[0].name).toBe('My Look') // trimmed
    expect(styles[0].floor.livingDining).toBe('floor-wood-teak')
    expect(styles[0].walls.mainBedroom).toBe('wall-paint-sage')
  })

  it('ignores a blank name', () => {
    useStore.getState().saveUserStyle('   ')
    expect(useStore.getState().userStyles).toHaveLength(0)
  })

  it('re-applies a saved style after the finishes change', () => {
    const s = useStore.getState()
    s.setFloorFinish('livingDining', 'floor-wood-teak')
    s.saveUserStyle('Teak')
    const id = useStore.getState().userStyles[0].id
    // Change the finish, then re-apply the saved style.
    s.setFloorFinish('livingDining', 'floor-tile-grey')
    expect(useStore.getState().finishes.floor.livingDining).toBe('floor-tile-grey')
    useStore.getState().applyUserStyle(id)
    expect(useStore.getState().finishes.floor.livingDining).toBe('floor-wood-teak')
  })

  it('deletes a saved style and ignores unknown ids', () => {
    const s = useStore.getState()
    s.saveUserStyle('A')
    s.saveUserStyle('B')
    const [a] = useStore.getState().userStyles
    s.deleteUserStyle(a.id)
    expect(useStore.getState().userStyles.map((u) => u.name)).toEqual(['B'])
    s.applyUserStyle('nope') // no throw
  })
})
