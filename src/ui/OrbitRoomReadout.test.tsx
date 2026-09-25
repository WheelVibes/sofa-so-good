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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import { cameraPose } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { OrbitRoomReadout } from './OrbitRoomReadout'

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

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'orbit' })
  placeCameraOver(0, 0)
})

afterEach(() => {
  cameraPose.px = 12
  cameraPose.py = 8
  cameraPose.pz = 12
  cameraPose.tx = 0
  cameraPose.ty = 1.3
  cameraPose.tz = 0
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
