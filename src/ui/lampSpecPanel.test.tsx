// @vitest-environment happy-dom
/**
 * The lamp-spec advisory group in the Checks panel, in BOTH modes (the
 * `lampSpecChecks` flag is pro-tier, so Simple must hide it).
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { useStore } from '../state/store'
import { ClearancePanel } from './ClearancePanel'

/** A warm indoor ceiling light inside the default flat's first bathroom. */
function seedBathroomFixture() {
  const plan = buildDefaultPlan()
  const bath = plan.rooms.find((r) => /bath|wc/i.test(r.name))
  if (!bath) throw new Error('default plan has no bathroom to seed into')
  useStore.setState({
    floorPlan: plan,
    items: [
      {
        id: 'lamp-1',
        defId: 'ceiling-light',
        position: [bath.origin[0] + bath.width / 2, bath.origin[1] + bath.depth / 2],
        rotation: 0,
        props: {},
      },
    ] as never,
  })
  return bath
}

describe('ClearancePanel — lamp specification group', () => {
  beforeEach(() => {
    useStore.setState({ clearancePanelOpen: true } as never)
  })

  it('shows the IP advisory in Pro for a warm IP20 fixture in a bathroom', () => {
    const bath = seedBathroomFixture()
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<ClearancePanel />)
    expect(screen.getByText('Lamp specification')).toBeTruthy()
    // Both findings fire: a bath is wet AND a task space.
    expect(screen.getByText('IP rating')).toBeTruthy()
    expect(screen.getByText('Colour temp')).toBeTruthy()
    // The finding names the room it is in, resolved on the fixture's own storey.
    expect(screen.getAllByText(new RegExp(bath.name)).length).toBeGreaterThan(0)
  })

  it('hides the group entirely in Simple mode (pro-tier flag)', () => {
    seedBathroomFixture()
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<ClearancePanel />)
    expect(screen.queryByText('Lamp specification')).toBeNull()
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })

  it('shows nothing when the same fixture sits in a DRY room', () => {
    const plan = buildDefaultPlan()
    const living = plan.rooms.find((r) => /living/i.test(r.name))!
    useStore.setState({
      floorPlan: plan,
      items: [
        {
          id: 'lamp-1',
          defId: 'ceiling-light',
          position: [living.origin[0] + living.width / 2, living.origin[1] + living.depth / 2],
          rotation: 0,
          props: {},
        },
      ] as never,
    })
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<ClearancePanel />)
    expect(screen.queryByText('Lamp specification')).toBeNull()
  })
})

describe('ClearancePanel — lighting layers group', () => {
  it('flags a bedroom lit only by a ceiling fixture, in Pro', () => {
    // The case average illuminance cannot see. The default flat's bedrooms
    // have a pendant and no task or accent light.
    const plan = buildDefaultPlan()
    const bed = plan.rooms.find((r) => /bedroom/i.test(r.name))!
    useStore.setState({
      floorPlan: plan,
      items: [
        {
          id: 'ceil-1',
          defId: 'ceiling-light',
          position: [bed.origin[0] + bed.width / 2, bed.origin[1] + bed.depth / 2],
          rotation: 0,
          props: {},
        },
      ] as never,
    })
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<ClearancePanel />)
    expect(screen.getByText('Lighting layers')).toBeTruthy()
    expect(screen.getAllByText(new RegExp(bed.name)).length).toBeGreaterThan(0)
    // Names what is missing, and the current mix as context.
    expect(screen.getByText(/Missing task and accent/)).toBeTruthy()
    expect(screen.getByText(/100% ambient/)).toBeTruthy()
  })

  it('is hidden in Simple mode (pro-tier flag)', () => {
    const plan = buildDefaultPlan()
    useStore.setState({ floorPlan: plan, items: [] as never })
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<ClearancePanel />)
    expect(screen.queryByText('Lighting layers')).toBeNull()
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
  })
})
