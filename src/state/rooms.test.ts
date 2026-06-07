import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { editableRoomIds } from './rooms'

describe('editableRoomIds', () => {
  it('lists the default apartment rooms minus external ledges', () => {
    const ids = editableRoomIds(buildDefaultPlan())
    expect(ids).toContain('mainBedroom')
    expect(ids).toContain('kitchen')
    expect(ids).not.toContain('acLedge') // the external AC ledge is not editable
    expect(ids).toEqual(
      Object.values(ROOMS)
        .filter((r) => !r.external)
        .map((r) => r.id),
    )
  })

  it("lists a custom plan's own rooms in order", () => {
    const plan = PLAN_TEMPLATES[1] // oneBed template (a non-default plan)
    expect(editableRoomIds(plan)).toEqual(plan.rooms.map((r) => r.id))
  })
})
