import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { editableRoomIds, editableRooms, firstEditableRoomId, roomDisplayName } from './rooms'

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

describe('editableRooms / firstEditableRoomId', () => {
  it('returns {id,name} pairs whose ids match editableRoomIds (same order)', () => {
    const plan = buildDefaultPlan()
    const rooms = editableRooms(plan)
    expect(rooms.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
    expect(rooms.map((r) => r.id)).toEqual(editableRoomIds(plan))
  })

  it('firstEditableRoomId is the first editable room (default + custom)', () => {
    const def = buildDefaultPlan()
    expect(firstEditableRoomId(def)).toBe(editableRooms(def)[0].id)
    const custom = PLAN_TEMPLATES[1]
    expect(firstEditableRoomId(custom)).toBe(custom.rooms[0].id)
  })
})

describe('roomDisplayName', () => {
  it('uses the fixed apartment name for a built-in room', () => {
    expect(roomDisplayName('mainBedroom', buildDefaultPlan())).toBe(ROOMS.mainBedroom.name)
  })

  it("uses the custom plan's room name for a plan room", () => {
    const plan = PLAN_TEMPLATES[1]
    const r = plan.rooms[0]
    expect(roomDisplayName(r.id, plan)).toBe(r.name)
  })

  it('falls back to the raw id when nothing matches', () => {
    expect(roomDisplayName('ghost-room', buildDefaultPlan())).toBe('ghost-room')
  })
})
