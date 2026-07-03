// @vitest-environment happy-dom
/**
 * Behavioural test for the walk-mode minimap tap-to-teleport (MINIMAP-JUMP).
 * The coordinate-inversion + room-clamp math is unit-tested in isolation in
 * `walk/minimapTeleport.test.ts`; this test only checks the wiring — a click
 * on the minimap SVG resolves a world target and hands it to the
 * `walkTeleport` request channel, gated by the `minimapTeleport` flag (both
 * Simple and Pro, since it's a simple-tier flag present in both modes).
 */
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestWalkTeleport } from '../scene/cameras/walkTeleport'
import { useStore } from '../state/store'
import { Minimap } from './Minimap'

vi.mock('../scene/cameras/walkTeleport', () => ({
  requestWalkTeleport: vi.fn(),
}))

function setFlag(on: boolean) {
  useStore.setState({ featureFlags: { ...useStore.getState().featureFlags, minimapTeleport: on } })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'firstPerson' })
  vi.mocked(requestWalkTeleport).mockClear()
})

afterEach(() => {
  useStore.setState({ cameraMode: 'orbit' })
})

describe('minimapTeleport flag', () => {
  it('is a simple-tier default-on flag, present in BOTH Simple and Pro', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.minimapTeleport).toBe(true)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.minimapTeleport).toBe(true)
  })
})

describe('Minimap tap-to-teleport gating', () => {
  it('renders nothing outside walk mode regardless of the flag', () => {
    setFlag(true)
    useStore.setState({ cameraMode: 'orbit' })
    const { container } = render(<Minimap />)
    expect(container.firstChild).toBeNull()
  })

  it('a click on the minimap requests a teleport when the flag is on', () => {
    setFlag(true)
    const { container } = render(<Minimap />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-label')).toMatch(/tap/i)
    // happy-dom's getBoundingClientRect defaults to an all-zero rect, which
    // this component treats as "no size" and no-ops — stub a plausible
    // .minimap box so the pointer→world math has something to invert.
    svg!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 168, height: 132 }) as DOMRect
    fireEvent.click(svg!, { clientX: 84, clientY: 66 })
    expect(requestWalkTeleport).toHaveBeenCalledTimes(1)
    const [x, z, yaw] = vi.mocked(requestWalkTeleport).mock.calls[0]!
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(z)).toBe(true)
    expect(Number.isFinite(yaw)).toBe(true)
  })

  it('does nothing when the flag is off (no cursor affordance, no request)', () => {
    setFlag(false)
    const { container } = render(<Minimap />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('mm-tap')).toBe(false)
    expect(svg?.getAttribute('aria-label')).toBeNull()
    svg!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 168, height: 132 }) as DOMRect
    fireEvent.click(svg!, { clientX: 84, clientY: 66 })
    expect(requestWalkTeleport).not.toHaveBeenCalled()
  })
})
