// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import { _resetResizeReadout, setResizeReadout } from '../scene/selection/resizeReadoutSignal'
import { useStore } from '../state/store'
import { ResizeHud } from './ResizeHud'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
})

afterEach(() => {
  _resetResizeReadout()
})

describe('itemDimensionReadout feature flag', () => {
  it('is registered as a simple-tier default-on flag', () => {
    const flag = FEATURE_FLAGS['itemDimensionReadout']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeFalsy()
  })

  it('is enabled in BOTH Simple and Pro modes (a core sizing affordance)', () => {
    expect(resolveFlags(false, {}, false, 'simple').itemDimensionReadout).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').itemDimensionReadout).toBe(true)
  })
})

describe('ResizeHud', () => {
  it('renders nothing when no resize is in progress', () => {
    const { container } = render(<ResizeHud />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, itemDimensionReadout: false },
    })
    setResizeReadout({ w: 2, d: 1.5 })
    const { container } = render(<ResizeHud />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the live width × depth in metric', () => {
    useStore.setState({ units: 'metric' })
    setResizeReadout({ w: 3.6, d: 3.4 })
    render(<ResizeHud />)
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText(/3\.60 × 3\.40 m/)).toBeInTheDocument()
  })

  it('shows the live width × depth in imperial', () => {
    useStore.setState({ units: 'imperial' })
    setResizeReadout({ w: 0.305, d: 0.305 })
    render(<ResizeHud />)
    expect(screen.getByText(/1′ 0″ × 1′ 0″/)).toBeInTheDocument()
  })
})
