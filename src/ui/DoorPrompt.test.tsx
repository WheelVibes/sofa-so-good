// @vitest-environment happy-dom
/**
 * WALK-AIM-PROMPT (v0.31.5.100) — the door prompt must appear for the doors of
 * the plan being walked.
 *
 * `.99` (WALK-AIM-PLAN) fixed the aim so `nearbyDoorId` names a real door on any
 * template — measured 0/5 -> 5/5 on the maisonette. It was not enough: this
 * component still gated on `DOORS.find(...)`, the DEFAULT flat's hardcoded
 * constants, and returned null when the id was absent. So the walker stood at an
 * openable door with NO affordance on screen, on 18 of 19 templates. A number had
 * passed while the picture still failed.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { hdbMaisonette } from '../floorplan/templates/hdb'
import { useStore } from '../state/store'
import { DoorPrompt, doorPromptLabel } from './DoorPrompt'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'firstPerson' })
})

describe('DoorPrompt renders for the walked plan', () => {
  it('shows the prompt for a MAISONETTE upper-storey door (it used to render nothing)', () => {
    useStore.setState({
      floorPlan: hdbMaisonette(),
      viewLevelId: 'em-up',
      nearbyDoorId: 'emu-bed2-door',
    })
    const { container } = render(<DoorPrompt />)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Open')
  })

  it('CONTROL: the default flat still reads exactly as before', () => {
    // Its eight ids keep their hand-written copy — this change must not reword
    // the one plan that already worked.
    useStore.setState({
      floorPlan: buildDefaultPlan(),
      viewLevelId: 'all',
      nearbyDoorId: 'door-bedroom2',
    })
    const { container } = render(<DoorPrompt />)
    expect(container.querySelector('button')?.textContent).toContain('bedroom 2')
  })

  it('still renders NOTHING for an id the current plan does not contain', () => {
    // The old constants check did serve a purpose — rejecting a stale id left
    // over from a previous plan. That guard has to survive, just sourced from the
    // walked storey instead of the default flat.
    useStore.setState({
      floorPlan: hdbMaisonette(),
      viewLevelId: 'em-up',
      nearbyDoorId: 'door-bedroom2',
    })
    const { container } = render(<DoorPrompt />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('rejects a door from the OTHER storey', () => {
    // `em-main` is a ground door; standing upstairs it must not prompt.
    useStore.setState({
      floorPlan: hdbMaisonette(),
      viewLevelId: 'em-up',
      nearbyDoorId: 'em-main',
    })
    expect(render(<DoorPrompt />).container.querySelector('button')).toBeNull()
  })
})

describe('doorPromptLabel fallback order', () => {
  it('prefers the default flat copy, then a custom name, then a generic noun', () => {
    expect(doorPromptLabel('door-bath1')).toBe('bath 1')
    expect(doorPromptLabel('emu-bed2-door', 'Ensuite')).toBe('Ensuite')
    expect(doorPromptLabel('emu-bed2-door')).toBe('door')
    expect(doorPromptLabel('emu-bed2-door', '   ')).toBe('door')
  })
})
