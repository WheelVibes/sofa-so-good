// @vitest-environment happy-dom
/**
 * UIUX-41b: the GLB designer's Layers rows expose a real `.lyr-sel` select
 * button (the catalog LayersPanel pattern) so keyboard users can Tab to a
 * part / transform-group and Enter-select it — the row div keeps its
 * whole-row mouse click and the inline rename/duplicate/remove buttons.
 */
import { fireEvent, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { defaultPart } from '../../furniture/glbEdit/editSpec'
import { DesignerContext, type DesignerContextValue } from './designerContext'
import { LayersPanel } from './LayersPanel'

function mount(overrides: Partial<DesignerContextValue> = {}): {
  el: ReactElement
  onSelectPart: ReturnType<typeof vi.fn>
  selectGroup: ReturnType<typeof vi.fn>
} {
  const p1 = { ...defaultPart('box'), id: 'p1', name: 'Seat' }
  const p2 = { ...defaultPart('box'), id: 'p2', name: 'Leg' }
  const onSelectPart = vi.fn()
  const selectGroup = vi.fn()
  const value = {
    spec: {
      sourceScale: 1,
      parts: [p1, p2],
      meshOverrides: {},
      partGroups: [{ id: 'g1', name: 'Base', partIds: ['p2'] }],
    },
    selIds: [],
    selGroupId: null,
    selectMode: false,
    eligibleGroupCount: 0,
    onSelectPart,
    selectGroup,
    toggleSelectMode: vi.fn(),
    groupSelected: vi.fn(),
    ungroupTransform: vi.fn(),
    renameGroup: vi.fn(),
    duplicateGroup: vi.fn(),
    mirrorGroup: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    renamePartName: vi.fn(),
    ...overrides,
  } as unknown as DesignerContextValue
  return {
    el: (
      <DesignerContext.Provider value={value}>
        <LayersPanel />
      </DesignerContext.Provider>
    ),
    onSelectPart,
    selectGroup,
  }
}

describe('glbEditor LayersPanel keyboard-selectable rows (UIUX-41b)', () => {
  it('part rows expose a .lyr-sel button that selects the part', () => {
    const { el, onSelectPart } = mount()
    const { container } = render(el)
    const btns = [...container.querySelectorAll('button.lyr-sel')]
    expect(btns.length).toBeGreaterThanOrEqual(2)
    const seat = btns.find((b) => b.textContent?.includes('Seat'))
    expect(seat).toBeTruthy()
    fireEvent.click(seat as HTMLElement)
    expect(onSelectPart).toHaveBeenCalledWith('p1', false)
  })

  it('group headers expose a .lyr-sel button that selects the group', () => {
    const { el, selectGroup } = mount()
    const { container } = render(el)
    const base = [...container.querySelectorAll('button.lyr-sel')].find((b) =>
      b.textContent?.includes('Base'),
    )
    expect(base).toBeTruthy()
    fireEvent.click(base as HTMLElement)
    expect(selectGroup).toHaveBeenCalledWith('g1')
  })

  it('select mode keeps the keyboard-accessible checkbox instead of the button', () => {
    const { el } = mount({ selectMode: true } as Partial<DesignerContextValue>)
    const { container } = render(el)
    // Part rows swap to checkboxes; only group headers keep .lyr-sel.
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(2)
    const partSel = [...container.querySelectorAll('button.lyr-sel')].find((b) =>
      b.textContent?.includes('Seat'),
    )
    expect(partSel).toBeFalsy()
  })
})
