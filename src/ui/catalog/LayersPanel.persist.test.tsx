import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { LayersPanel } from './LayersPanel'

/**
 * P39 — the Layers tree's per-group collapse state is lifted into the store
 * (`layersCollapsed`, persisted per-device by editorPrefs) instead of a local
 * `useState`, so a collapsed group survives a reload. Clicking a group header
 * writes the room id → collapsed flag into the store.
 */
describe('LayersPanel persisted collapse (P39)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    const plan = useStore.getState().floorPlan
    useStore.setState({
      floorPlan: {
        ...plan,
        rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 5, depth: 5 }],
      },
      items: [{ id: 'i1', defId: 'sofa-2seat', position: [1, 1], rotation: 0 }],
      layersCollapsed: {},
    } as never)
  })

  it('writes layersCollapsed[roomId]=true when a group header is clicked', () => {
    const { container } = render(<LayersPanel />)
    const head = container.querySelector('.lyr-ghead') as HTMLButtonElement
    expect(head).toBeTruthy()
    expect(useStore.getState().layersCollapsed.r1).toBeUndefined()
    fireEvent.click(head)
    expect(useStore.getState().layersCollapsed.r1).toBe(true)
    fireEvent.click(head)
    expect(useStore.getState().layersCollapsed.r1).toBe(false)
  })

  it('renders a group as collapsed when the store says so', () => {
    useStore.setState({ layersCollapsed: { r1: true } } as never)
    const { container } = render(<LayersPanel />)
    const head = container.querySelector('.lyr-ghead') as HTMLButtonElement
    expect(head.className).toContain('collapsed')
    // Collapsed → the item rows are not rendered.
    expect(container.querySelector('.lyr-row')).toBeNull()
  })
})
