import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { useStore } from '../state/store'
import {
  confirmApplyTemplate,
  confirmClearFurniture,
  confirmDeleteSavedPlan,
  confirmGeneratePlan,
  confirmLoadSavedPlan,
  confirmResetPlanToDefault,
  confirmRestoreDemoFurniture,
  openNewPlan,
} from './planActions'

/**
 * The guard contract. Every one of these destroys work, so every one of them
 * must ask first and must do NOTHING when the answer is no — that consistency
 * is the point of the module (before it, "New" wiped the plan and all the
 * furniture with no prompt while "Clear all furniture" asked politely).
 */

const realConfirm = useStore.getState().confirmAction

/** Answer the next `confirmAction` with `ok`, and report whether it was asked. */
function answerConfirm(ok: boolean): () => boolean {
  let asked = false
  useStore.setState({
    confirmAction: async () => {
      asked = true
      return ok
    },
  })
  return () => asked
}

const sofa = {
  id: 'a',
  defId: 'sofa-3seat',
  position: [11, 3] as [number, number],
  rotation: 0,
  props: {},
}

afterEach(() => {
  useStore.setState({ confirmAction: realConfirm })
})

beforeEach(() => {
  useStore.getState().resetFloorPlan()
  useStore.setState({ items: [sofa] })
  useStore.getState().clearHistory()
})

describe('every destructive plan action asks first', () => {
  it('reset-to-default asks, and does nothing when declined', async () => {
    useStore.getState().newFloorPlan()
    const asked = answerConfirm(false)
    await confirmResetPlanToDefault()
    expect(asked()).toBe(true)
    expect(useStore.getState().floorPlan.rooms).toEqual([])
  })

  it('reset-to-default resets the plan and KEEPS furniture when accepted', async () => {
    useStore.setState({ items: [sofa] })
    answerConfirm(true)
    await confirmResetPlanToDefault()
    expect(useStore.getState().floorPlan.rooms.length).toBeGreaterThan(0)
    expect(useStore.getState().items).toHaveLength(1)
  })

  it('applying a template asks, and does nothing when declined', async () => {
    const before = useStore.getState().floorPlan.id
    const asked = answerConfirm(false)
    await confirmApplyTemplate(PLAN_TEMPLATES[0])
    expect(asked()).toBe(true)
    expect(useStore.getState().floorPlan.id).toBe(before)
    expect(useStore.getState().items).toHaveLength(1)
  })

  it('applying a template replaces the plan and CLEARS furniture when accepted', async () => {
    answerConfirm(true)
    await confirmApplyTemplate(PLAN_TEMPLATES[0])
    expect(useStore.getState().floorPlan.name).toBe(PLAN_TEMPLATES[0].name)
    expect(useStore.getState().items).toEqual([])
  })

  it('loading a saved plan asks, and does nothing when declined', async () => {
    const id = useStore.getState().saveCurrentPlan('Copy')
    useStore.getState().newFloorPlan()
    const asked = answerConfirm(false)
    await confirmLoadSavedPlan(id, 'Copy')
    expect(asked()).toBe(true)
    expect(useStore.getState().floorPlan.name).not.toBe('Copy')
  })

  it('deleting a saved plan asks, and does nothing when declined', async () => {
    const id = useStore.getState().saveCurrentPlan('Copy')
    const asked = answerConfirm(false)
    await confirmDeleteSavedPlan(id, 'Copy')
    expect(asked()).toBe(true)
    expect(useStore.getState().savedPlans.map((p) => p.id)).toContain(id)
  })

  it('deleting a saved plan removes it when accepted, leaving the active plan alone', async () => {
    const before = useStore.getState().floorPlan.id
    const id = useStore.getState().saveCurrentPlan('Copy')
    answerConfirm(true)
    await confirmDeleteSavedPlan(id, 'Copy')
    expect(useStore.getState().savedPlans.map((p) => p.id)).not.toContain(id)
    expect(useStore.getState().floorPlan.id).toBe(before)
  })

  it('clearing furniture asks, and does nothing when declined', async () => {
    const asked = answerConfirm(false)
    await confirmClearFurniture()
    expect(asked()).toBe(true)
    expect(useStore.getState().items).toHaveLength(1)
  })

  it('clearing furniture leaves the PLAN alone when accepted', async () => {
    const before = useStore.getState().floorPlan.id
    answerConfirm(true)
    await confirmClearFurniture()
    expect(useStore.getState().items).toEqual([])
    expect(useStore.getState().floorPlan.id).toBe(before)
  })

  it('does not even ask about clearing furniture when there is none', async () => {
    useStore.setState({ items: [] })
    const asked = answerConfirm(true)
    expect(await confirmClearFurniture()).toBe(false)
    expect(asked()).toBe(false)
  })

  it('restoring the demo furniture asks, and leaves the plan alone when accepted', async () => {
    const before = useStore.getState().floorPlan.id
    useStore.setState({ items: [] })
    const asked = answerConfirm(true)
    await confirmRestoreDemoFurniture()
    expect(asked()).toBe(true)
    expect(useStore.getState().items.length).toBeGreaterThan(0)
    expect(useStore.getState().floorPlan.id).toBe(before)
  })

  it('the AI plan draft asks before replacing anything', async () => {
    const asked = answerConfirm(false)
    expect(await confirmGeneratePlan()).toBe(false)
    expect(asked()).toBe(true)
  })
})

describe('new plan', () => {
  it('opens the chooser rather than acting immediately — it has two outcomes', () => {
    expect(useStore.getState().newPlanOpen).toBe(false)
    openNewPlan()
    expect(useStore.getState().newPlanOpen).toBe(true)
    // Nothing destroyed yet: the modal owns the decision.
    expect(useStore.getState().items).toHaveLength(1)
    expect(useStore.getState().floorPlan.rooms.length).toBeGreaterThan(0)
  })
})
