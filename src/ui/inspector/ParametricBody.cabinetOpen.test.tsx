// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FurnitureItem, ParametricDef, PrimitiveKind } from '../../furniture/types'
import { useStore } from '../../state/store'
import { ParametricBody } from './ParametricBody'

const def = (primitive: PrimitiveKind): ParametricDef => ({
  kind: 'parametric',
  id: `def-${primitive}`,
  name: primitive,
  category: 'storage',
  primitive,
  defaultFootprint: { w: 1.5, d: 0.6, h: 2.1 },
  paramSchema: [],
})

const item = (props: Record<string, string | number> = {}): FurnitureItem => ({
  id: 'it1',
  defId: 'def-Wardrobe',
  position: [0, 0],
  rotation: 0,
  props,
})

const setCabinetOpenFlag = (on: boolean) =>
  useStore.setState((s) => ({ featureFlags: { ...s.featureFlags, cabinetOpen: on } }))

afterEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('ParametricBody — cabinet open/close control gating', () => {
  it('shows the Open toggle for an openable cabinet primitive when the flag is on', () => {
    setCabinetOpenFlag(true)
    const { queryByText } = render(<ParametricBody item={item()} def={def('Wardrobe')} />)
    expect(queryByText('Open doors & drawers')).not.toBeNull()
  })

  it('labels the toggle "Close" when the item is already open', () => {
    setCabinetOpenFlag(true)
    const { queryByText } = render(
      <ParametricBody item={item({ open: 'yes' })} def={def('Wardrobe')} />,
    )
    expect(queryByText('Close doors & drawers')).not.toBeNull()
  })

  it('hides the toggle for a non-cabinet primitive even with the flag on', () => {
    setCabinetOpenFlag(true)
    const { queryByText } = render(<ParametricBody item={item()} def={def('Sofa')} />)
    expect(queryByText(/doors & drawers/i)).toBeNull()
  })

  it('hides the toggle when the feature flag is off', () => {
    setCabinetOpenFlag(false)
    const { queryByText } = render(<ParametricBody item={item()} def={def('Wardrobe')} />)
    expect(queryByText(/doors & drawers/i)).toBeNull()
  })
})
