import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('userStylesSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    localStorage.clear()
    useStore.setState({ userStyles: [] })
  })

  it('saves the current finishes as a named style and re-applies them', () => {
    const s = useStore.getState()
    s.setFloorFinish('livingDining', 'floor-tile-marble')
    s.setWallFinish('livingDining', 'wall-paint-sage')
    const id = useStore.getState().saveCurrentStyle('Marble lounge')
    expect(useStore.getState().userStyles.find((x) => x.id === id)?.name).toBe('Marble lounge')

    // Change the finishes, then re-apply the saved style.
    useStore.getState().setFloorFinish('livingDining', 'floor-wood-oak')
    expect(useStore.getState().finishes.floor.livingDining).toBe('floor-wood-oak')
    useStore.getState().applyUserStyle(id)
    expect(useStore.getState().finishes.floor.livingDining).toBe('floor-tile-marble')
    expect(useStore.getState().finishes.walls.livingDining).toBe('wall-paint-sage')
  })

  it('persists saved styles to localStorage and deletes them', () => {
    const id = useStore.getState().saveCurrentStyle('Keeper')
    expect(localStorage.getItem('hdb_user_styles')).toContain('Keeper')
    useStore.getState().deleteUserStyle(id)
    expect(useStore.getState().userStyles.some((x) => x.id === id)).toBe(false)
    expect(localStorage.getItem('hdb_user_styles')).not.toContain('Keeper')
  })

  it('applyUserStyle is undoable (pushes history)', () => {
    useStore.getState().setFloorFinish('kitchen', 'floor-tile-ceramic')
    const id = useStore.getState().saveCurrentStyle('K')
    useStore.getState().setFloorFinish('kitchen', 'floor-wood-oak')
    useStore.getState().applyUserStyle(id)
    expect(useStore.getState().finishes.floor.kitchen).toBe('floor-tile-ceramic')
    useStore.getState().undo()
    expect(useStore.getState().finishes.floor.kitchen).toBe('floor-wood-oak')
  })
})
