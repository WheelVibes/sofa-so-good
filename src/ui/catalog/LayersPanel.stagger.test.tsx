// @vitest-environment happy-dom
/**
 * Task 7 (P2 entrance stagger): the LayersPanel object rows are a mapped list,
 * so each `.lyr-row` must carry a numeric `--i` custom property (the map
 * index) for the shared `.stagger-in` cascade to key off. Substituted for the
 * CommandPalette variant (brief-approved fallback) — CommandPalette pulls in
 * a much larger dependency surface (AI/export/layout modules) to mount.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { LayersPanel } from './LayersPanel'

describe('LayersPanel entrance stagger', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('sets a --i custom property on each layer row for stagger', () => {
    const s = useStore.getState()
    // Positions far outside any room footprint land the items in the
    // "Unassigned" group — avoids depending on the default plan's room
    // geometry while still exercising the mapped `.lyr-row` render path.
    s.addItem({ defId: 'dining-chair', position: [999, 999], rotation: 0, props: {} })
    s.addItem({ defId: 'dining-chair', position: [999, 1000], rotation: 0, props: {} })

    const { container } = render(<LayersPanel />)
    const rows = [...container.querySelectorAll<HTMLElement>('.lyr-row')]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].style.getPropertyValue('--i')).toBe('0')
    expect(rows[1].style.getPropertyValue('--i')).toBe('1')
  })
})
