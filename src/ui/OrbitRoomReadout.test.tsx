// @vitest-environment happy-dom
/**
 * Behavioural test for the orbit-mode live room-name readout (U6). The
 * `pointInRoom`-backed lookup itself (`floorplan/levels.ts:roomAtPoint`) is
 * unit-tested in `levels.test.ts`; this only checks the wiring — the pill is
 * absent outside orbit mode, and it names the room the orbit camera's
 * look-at target (`cameraPose.tx/tz`) currently sits inside.
 */
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { roomLabelPoint } from '../floorplan/roomCentroid'
import { cameraPose } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { OrbitRoomReadout } from './OrbitRoomReadout'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'orbit' })
  cameraPose.tx = 0
  cameraPose.tz = 0
})

afterEach(() => {
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
    cameraPose.tx = x
    cameraPose.tz = z

    const { container } = render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout')?.textContent).toBe(room!.name)
    })
    expect(container.querySelector('.orbit-room-readout.visible')).not.toBeNull()
  })

  it('hides again once the target leaves every room', async () => {
    const room = useStore.getState().floorPlan.rooms[0]
    const [x, z] = roomLabelPoint(room!)
    cameraPose.tx = x
    cameraPose.tz = z
    const { container } = render(<OrbitRoomReadout />)
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout.visible')).not.toBeNull()
    })

    // Far outside the flat's footprint — no room contains this point.
    cameraPose.tx = 10_000
    cameraPose.tz = 10_000
    await waitFor(() => {
      expect(container.querySelector('.orbit-room-readout.visible')).toBeNull()
    })
  })
})
