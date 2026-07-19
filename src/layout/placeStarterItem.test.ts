import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { roomEditorPlacementWalls } from '../collision/roomEditorWalls'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { pointInRoom } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultItemProps } from '../furniture/placement/defaultItemProps'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { placeStarterItem, type StarterRect } from './placeStarterItem'

const plan = buildDefaultPlan()

/** Resolve a def + its default props from the built-in catalog. */
function resolve(defId: string) {
  const def = BUILTIN_CATALOG[defId]
  if (!def) throw new Error(`missing def ${defId}`)
  return { def, props: defaultItemProps(def) }
}

describe('placeStarterItem — synthetic rect', () => {
  it('returns null when there are no rects', () => {
    const { def, props } = resolve('nightstand')
    expect(
      placeStarterItem({ rects: [], def, props, defId: 'nightstand', defs: BUILTIN_CATALOG }),
    ).toBeNull()
  })

  it('anchors a bed flush against a wall of the largest rect (valid)', () => {
    const { def, props } = resolve('bed-queen')
    const rect: StarterRect = { x0: 0, z0: 0, x1: 4, z1: 4 }
    const placement = placeStarterItem({
      rects: [rect],
      def,
      props,
      defId: 'bed-queen',
      defs: BUILTIN_CATALOG,
    })
    expect(placement).not.toBeNull()
    expect(placement?.valid).toBe(true)
    // Wall-flush: at least one coordinate sits near a rect edge (not the centre).
    const [x, z] = placement!.position
    const nearEdge =
      Math.abs(x - rect.x0) < 1.5 ||
      Math.abs(x - rect.x1) < 1.5 ||
      Math.abs(z - rect.z0) < 1.5 ||
      Math.abs(z - rect.z1) < 1.5
    expect(nearEdge).toBe(true)
  })
})

describe('placeStarterItem — default flat', () => {
  // Room ids on the default flat + a starter anchor each, per room kind.
  const CASES: { roomId: string; defId: string }[] = [
    { roomId: 'mainBedroom', defId: 'bed-queen' },
    { roomId: 'mainBedroom', defId: 'wardrobe-3door' },
    { roomId: 'livingDining', defId: 'sofa-3seat' },
    { roomId: 'livingDining', defId: 'tv-console' },
  ]

  for (const { roomId, defId } of CASES) {
    it(`lands ${defId} in-room + collision-clean in ${roomId}`, () => {
      const shell = getRoomEditorShell(plan, roomId)
      expect(shell).not.toBeNull()
      const { def, props } = resolve(defId)
      const walls = roomEditorPlacementWalls(plan, roomId)
      const placement = placeStarterItem({
        rects: shell!.shell.rects,
        def,
        props,
        defId,
        defs: BUILTIN_CATALOG,
        doors: {},
        walls,
      })
      expect(placement).not.toBeNull()
      expect(placement?.valid).toBe(true)

      const room = plan.rooms.find((r) => r.id === roomId)!
      // In-room: the placement centre falls inside the room polygon/rect.
      expect(pointInRoom(room, placement!.position[0], placement!.position[1])).toBe(true)

      // Collision-clean: re-verify canPlace against the room walls independently.
      const ok = canPlace(
        {
          id: 'x',
          defId,
          position: placement!.position,
          rotation: placement!.rotation,
          props,
        },
        def,
        { others: [], defs: BUILTIN_CATALOG, doors: {}, walls },
      )
      expect(ok).toBe(true)
    })
  }
})
