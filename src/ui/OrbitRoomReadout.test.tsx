// @vitest-environment happy-dom
/**
 * Behavioural test for the orbit-mode live room-name readout (U6). The
 * `pointInRoom`-backed lookup itself (`floorplan/levels.ts:roomAtPoint`) is
 * unit-tested in `levels.test.ts`; this only checks the wiring — the pill is
 * absent outside orbit mode, names the room the orbit camera's look-at target
 * (`cameraPose.tx/tz`) currently sits inside, stays honest at wide framing
 * (V3), and exposes a debounced accessible announcement (V2, R7-J
 * visual-verification audit) rather than being `aria-hidden`.
 */
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import { cameraPose, cameraPosXZ } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { OrbitRoomReadout } from './OrbitRoomReadout'

/** Drive `useIsMobile` (which reads `window.matchMedia('(max-width: 640px)')`).
 *  Everything else that goes through `matchMedia` here — the reduced-motion
 *  query in `motionPreference.ts` — must keep resolving to `false`, so only a
 *  `max-width` query is allowed to match. */
function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

// A close-in, focused-room camera pose: ~4.2 m from its own target, well under
// the component's HIDE_BEYOND_METRES(15) honesty gate.
function placeCameraOver(x: number, z: number) {
  cameraPose.tx = x
  cameraPose.ty = 1.3
  cameraPose.tz = z
  cameraPose.px = x
  cameraPose.py = cameraPose.ty + 3
  cameraPose.pz = z + 3
}

const realMatchMedia = window.matchMedia

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'orbit' })
  placeCameraOver(0, 0)
  setViewport(false)
})

afterEach(() => {
  cameraPose.px = 12
  cameraPose.py = 8
  cameraPose.pz = 12
  cameraPose.tx = 0
  cameraPose.ty = 1.3
  cameraPose.tz = 0
  cameraPosXZ.x = 0
  cameraPosXZ.z = 0
  window.matchMedia = realMatchMedia
})

describe('OrbitRoomReadout', () => {
  it('renders nothing outside orbit mode', () => {
    useStore.setState({ cameraMode: 'firstPerson' })
    const { container } = render(<OrbitRoomReadout />)
    expect(container.firstChild).toBeNull()
  })

  it('names the room the orbit target is currently over, live', async () => {
    const room = useStore.getState().floorPlan.rooms[0]
    expect(room).toBeDefined()
    const [x, z] = roomLabelPoint(room!)
    placeCameraOver(x, z)

    const { container } = render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout')?.textContent).toBe(room!.name)
    })
    expect(container.querySelector('.orbit-room-readout.visible')).not.toBeNull()
  })

  it('hides again once the target leaves every room', async () => {
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    placeCameraOver(x, z)
    const { container } = render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout.visible')).not.toBeNull()
    })

    // Far outside the flat's footprint — no room contains this point.
    placeCameraOver(10_000, 10_000)
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout.visible')).toBeNull()
    })
  })

  it('V3 — suppresses the label at whole-flat framing even when the target sits inside a room', async () => {
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    // Target is a real room centroid, but the camera sits far from it — a
    // dollhouse/whole-flat overview, not a focused room view.
    cameraPose.tx = x
    cameraPose.ty = 1.3
    cameraPose.tz = z
    cameraPose.px = x + 20
    cameraPose.py = 15
    cameraPose.pz = z + 20

    const { container } = render(<OrbitRoomReadout />)
    // Give the rAF loop a few ticks to settle — it must NOT resolve to the
    // technically-correct room name at this distance.
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('.orbit-room-readout.visible')).toBeNull()
    expect(container.querySelector('.orbit-room-readout')?.textContent).toBe('')
  })

  it('V2 — is not aria-hidden as a whole and exposes a debounced role="status" announcement', async () => {
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    placeCameraOver(x, z)

    const { container } = render(<OrbitRoomReadout />)
    // The visible pill itself stays out of the accessibility tree (its text
    // can change every frame while dragging)...
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout[aria-hidden="true"]')).not.toBeNull()
    })
    // ...but a role="status" region exists alongside it, and does NOT get the
    // room name immediately (it must debounce, not fire on every frame).
    const status = container.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toBe('')

    // After the debounce window, the settled room is announced.
    await waitFor(
      () => {
        expect(container.querySelector('[role="status"]')?.textContent).toBe(
          `Now viewing the ${room!.name}`,
        )
      },
      { timeout: 2000 },
    )
  })

  it('V2 — a fast crossing through an intermediate room does not announce it', async () => {
    const [roomA, roomB] = useStore.getState().floorPlan.rooms
    expect(roomA).toBeDefined()
    expect(roomB).toBeDefined()
    const [ax, az] = roomLabelPoint(roomA!)
    const [bx, bz] = roomLabelPoint(roomB!)

    const { container } = render(<OrbitRoomReadout />)
    placeCameraOver(ax, az)
    // Wait for the VISUAL pill to register room A (instant), well inside the
    // announcement debounce window...
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout')?.textContent).toBe(roomA!.name)
    })
    // ...then settle on room B before room A's announcement timer ever fires.
    placeCameraOver(bx, bz)
    await waitFor(
      () => {
        expect(container.querySelector('[role="status"]')?.textContent).toBe(
          `Now viewing the ${roomB!.name}`,
        )
      },
      { timeout: 2000 },
    )
    expect(container.querySelector('[role="status"]')?.textContent).not.toContain(roomA!.name)
  })
})

/**
 * V14 — the phone's only walk-mode orientation aid.
 *
 * `.navcluster` is `display: none` under `body.mobile` and <Minimap> is one of
 * its children, so a phone walker had no map, no compass and no room label. The
 * readout now also covers WALK mode, but only on a phone (desktop walk keeps
 * its minimap) and only while the `walkRoomReadout` flag is on.
 */
describe('OrbitRoomReadout — walk mode (V14)', () => {
  function walkTo(x: number, z: number) {
    cameraPosXZ.x = x
    cameraPosXZ.z = z
    // Deliberately park the ORBIT pose far outside every room: if the walk
    // branch ever read `cameraPose` instead of `cameraPosXZ`, these tests would
    // see an empty pill rather than silently passing on the wrong source.
    placeCameraOver(10_000, 10_000)
  }

  it('names the room the WALKER is standing in, on a phone', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    expect(room).toBeDefined()
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })

    render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(document.querySelector('.orbit-room-readout')?.textContent).toBe(room!.name)
    })
    expect(document.querySelector('.orbit-room-readout.visible')).not.toBeNull()
  })

  it('uses the walk-specific mobile slot, not the orbit one', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })

    render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(document.querySelector('.room-readout-walk-mobile')).not.toBeNull()
    })
    // Top-centre at 104px is WalkHud's own `walk-mode` InfoCallout slot; the
    // walk label must not land on top of it.
    expect(document.querySelector('.orbit-room-readout-mobile')).toBeNull()
  })

  it('never applies the distance gate while walking', async () => {
    // The orbit pose is 10 km from its target here — if V3's HIDE_BEYOND_METRES
    // check leaked into the walk branch, the pill would suppress.
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })

    render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(document.querySelector('.orbit-room-readout.visible')).not.toBeNull()
    })
  })

  it('stays absent in DESKTOP walk mode — the minimap already answers "where am I" there', async () => {
    setViewport(false)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })

    const { container } = render(<OrbitRoomReadout />)
    await new Promise((r) => setTimeout(r, 50))
    expect(container.firstChild).toBeNull()
    expect(document.querySelector('.orbit-room-readout')).toBeNull()
  })

  it('is gated on the walkRoomReadout flag', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({
      cameraMode: 'firstPerson',
      featureFlags: { ...useStore.getState().featureFlags, walkRoomReadout: false },
    })

    render(<OrbitRoomReadout />)
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelector('.orbit-room-readout')).toBeNull()
  })

  it('is on in BOTH Simple and Pro (simple-tier flag, CLAUDE.md: test both modes)', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    for (const mode of ['simple', 'pro'] as const) {
      walkTo(x, z)
      useStore.setState({ cameraMode: 'firstPerson' })
      useStore.getState().setUiMode(mode)
      expect(useStore.getState().featureFlags.walkRoomReadout).toBe(true)
      const { unmount } = render(<OrbitRoomReadout />)
      await waitFor(() => {
        expect(document.querySelector('.orbit-room-readout')?.textContent).toBe(room!.name)
      })
      unmount()
    }
  })

  it('announces the room to assistive tech exactly once, with one live region', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })

    render(<OrbitRoomReadout />)
    await waitFor(
      () => {
        const regions = [...document.querySelectorAll('[role="status"]')].filter((e) =>
          /Now in the/.test(e.textContent ?? ''),
        )
        expect(regions).toHaveLength(1)
        // Mode-accurate copy — a walker is IN the room, not viewing it.
        expect(regions[0]?.textContent).toBe(`Now in the ${room!.name}`)
      },
      { timeout: 2000 },
    )
  })

  it('drops the cross-fade when motion is reduced (WCAG 2.2 SC 2.3.3)', async () => {
    setViewport(true)
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    walkTo(x, z)
    useStore.setState({ cameraMode: 'firstPerson' })
    useStore.getState().setReduceMotion('on')

    render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(document.querySelector('.orbit-room-readout')).not.toBeNull()
    })
    const pill = document.querySelector('.orbit-room-readout') as HTMLElement
    expect(pill.style.transition).toBe('none')

    useStore.getState().setReduceMotion('off')
    await waitFor(() => {
      const el = document.querySelector('.orbit-room-readout') as HTMLElement
      expect(el.style.transition).toBe('')
    })
  })
})
