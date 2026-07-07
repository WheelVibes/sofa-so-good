// @vitest-environment happy-dom
/**
 * A11Y-FINISH-INSPECTOR: keyboard + ARIA coverage for the shared finish swatch
 * grid (`SwatchGroup`) — the primitive used by every FinishPicker surface
 * (Floor/Walls/Ceiling). Verifies the finish-grid tiles announce their
 * selected state (`aria-pressed`), are grouped under an accessible name, and
 * stay operable by keyboard (Enter/Space) without also triggering a page
 * scroll on Space (a common custom-widget pitfall).
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SolidMaterialDef } from '../../materials/types'
import { useStore } from '../../state/store'
import { SwatchGroup } from './swatches'

afterEach(() => {
  useStore.getState().__resetForTest?.()
})

const oak: SolidMaterialDef = {
  id: 'floor-a',
  name: 'Oak',
  category: 'floor',
  swatch: '#b98a5a',
  kind: 'solid',
}
const walnut: SolidMaterialDef = {
  id: 'floor-b',
  name: 'Walnut',
  category: 'floor',
  swatch: '#5a3a24',
  kind: 'solid',
}

describe('SwatchGroup finish grid', () => {
  it('groups the tiles under an accessible name matching the surface label', () => {
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active="floor-a"
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    expect(screen.getByRole('group', { name: 'Floor finishes' })).toBeInTheDocument()
  })

  it('marks the active finish tile with aria-pressed, and the rest false', () => {
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active="floor-a"
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Oak/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Walnut/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('activates a finish tile via Enter and Space, preventing the Space page-scroll default', () => {
    const onSelect = vi.fn()
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active="floor-a"
        onSelect={onSelect}
        onRemoveUser={() => {}}
      />,
    )
    const tile = screen.getByRole('button', { name: /Walnut/ })
    fireEvent.keyDown(tile, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('floor-b')
    onSelect.mockClear()
    const spaceEvent = fireEvent.keyDown(tile, { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('floor-b')
    // fireEvent returns false when preventDefault() was called on the event.
    expect(spaceEvent).toBe(false)
  })

  it('is reachable by Tab (tabIndex=0) like every other control in the panel', () => {
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active="floor-a"
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).not.toHaveAttribute('tabIndex', '-1')
    }
  })
})

// FINISH-RECOLOR: a tinted active finish (`tint:<base>:<hex>…`) shows a
// "Colour override" chip (× clears back to the plain base) and highlights the
// BASE texture's tile as active, so the texture in play stays visible.
describe('SwatchGroup colour override (FINISH-RECOLOR)', () => {
  const TINTED = 'tint:floor-a:#ff0000!r'

  it('shows the chip when active is a tint; × applies the plain base id', () => {
    const onSelect = vi.fn()
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active={TINTED}
        onSelect={onSelect}
        onRemoveUser={() => {}}
      />,
    )
    const clear = screen.getByRole('button', { name: 'Remove colour override' })
    fireEvent.click(clear)
    expect(onSelect).toHaveBeenCalledWith('floor-a')
  })

  it('highlights the tint base texture tile as the active one (aria-pressed)', () => {
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active={TINTED}
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Oak/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Walnut/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders no chip (and no base highlight) when the finishRecolor flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active={TINTED}
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Remove colour override' })).toBeNull()
    expect(screen.getByRole('button', { name: /Oak/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders no chip for a plain (non-tint) active finish', () => {
    render(
      <SwatchGroup
        label="Floor"
        items={[oak, walnut]}
        active="floor-a"
        onSelect={() => {}}
        onRemoveUser={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Remove colour override' })).toBeNull()
  })
})
