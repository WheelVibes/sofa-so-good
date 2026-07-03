import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { PLAN_TEMPLATES } from '../floorplan/templates'
import { editableRoomIds, editableRooms, firstEditableRoomId, roomDisplayName } from './rooms'

/** Alphabetical-by-name id order for the default apartment's editable rooms. */
const defaultAlpha = Object.values(ROOMS)
  .filter((r) => !r.external)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((r) => r.id)

describe('editableRoomIds', () => {
  it('lists the default apartment rooms minus external ledges, alphabetically', () => {
    const ids = editableRoomIds(buildDefaultPlan(), [])
    expect(ids).toContain('mainBedroom')
    expect(ids).toContain('kitchen')
    expect(ids).not.toContain('acLedge') // the external AC ledge is not editable
    expect(ids).toEqual(defaultAlpha)
  })

  it("lists a custom plan's own rooms alphabetically by default", () => {
    const plan = PLAN_TEMPLATES[1] // oneBed template (a non-default plan)
    const alpha = [...plan.rooms].sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.id)
    expect(editableRoomIds(plan, [])).toEqual(alpha)
  })

  it('applies a manual order first, with unlisted rooms trailing alphabetically', () => {
    const def = buildDefaultPlan()
    const pinned = [defaultAlpha[2], defaultAlpha[0]] // pin the 3rd then the 1st alpha room
    const ids = editableRoomIds(def, pinned)
    expect(ids.slice(0, 2)).toEqual(pinned)
    // The remaining rooms keep their alphabetical order after the pinned ones.
    expect(ids.slice(2)).toEqual(defaultAlpha.filter((id) => !pinned.includes(id)))
  })
})

describe('editableRooms / firstEditableRoomId', () => {
  it('returns {id,name} pairs whose ids match editableRoomIds (same order)', () => {
    const plan = buildDefaultPlan()
    const rooms = editableRooms(plan, [])
    expect(rooms.every((r) => typeof r.name === 'string' && r.name.length > 0)).toBe(true)
    expect(rooms.map((r) => r.id)).toEqual(editableRoomIds(plan, []))
  })

  it('firstEditableRoomId is the first editable room (default + custom)', () => {
    const def = buildDefaultPlan()
    expect(firstEditableRoomId(def, [])).toBe(editableRooms(def, [])[0].id)
    const custom = PLAN_TEMPLATES[1]
    expect(firstEditableRoomId(custom, [])).toBe(editableRooms(custom, [])[0].id)
  })

  it('a manual order changes which room is first', () => {
    const def = buildDefaultPlan()
    const pinned = [defaultAlpha[3]]
    expect(firstEditableRoomId(def, pinned)).toBe(defaultAlpha[3])
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
