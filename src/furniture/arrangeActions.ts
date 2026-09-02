import { allPlanRooms } from '../floorplan/levels'
import { planRoomArea } from '../floorplan/types'
import { newGroupId } from '../state/slices/groupsSlice'
import { useStore } from '../state/store'
import { BUILTIN_CATALOG } from './builtinCatalog'
import { FURNITURE_SETS } from './furnitureSets'
import { buildSetGroup, ikeaSetRecipes, newSetItemId } from './ikeaSets'
import type { FurnitureDef, FurnitureItem } from './types'

/** Catalog for set expansion: built-ins + the store's imported (IKEA/user) defs. */
function builtinPlusIkea(): Record<string, FurnitureDef> {
  const st = useStore.getState()
  const merged: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG }
  for (const def of st.userFurniture ?? []) merged[def.id] = def
  return merged
}

/** Centre of the largest room in the active plan (the drop target). */
function dropCentre(): [number, number] {
  const st = useStore.getState()
  // EVERY storey (F13) — on a maisonette the drop target ignored every
  // upstairs room, so a large loft could never be the largest room.
  const rooms = allPlanRooms(st.floorPlan)
  const big = rooms.reduce((a, b) => (planRoomArea(b) > planRoomArea(a) ? b : a), rooms[0])
  return big
    ? [big.origin[0] + big.width / 2, big.origin[1] + big.depth / 2]
    : [st.floorPlan.extent[0] / 2, st.floorPlan.extent[1] / 2]
}

/** Append items as a selected group in one history entry. */
function dropArranged(items: FurnitureItem[]) {
  const st = useStore.getState()
  st.pushHistory()
  const gid = newGroupId()
  const grouped = items.map((i) => ({ ...i, groupId: gid }))
  st.setItems([...st.items, ...grouped])
  st.setSelectedItemIds(grouped.map((i) => i.id))
}

/** Drop a built-in furniture set at the centre of the largest room. */
export function dropBuiltinSet(setId: string) {
  const set = FURNITURE_SETS.find((s) => s.id === setId)
  if (!set) return
  const [bx, bz] = dropCentre()
  dropArranged(
    set.items.map((e) => ({
      id: newSetItemId(),
      defId: e.defId,
      position: [bx + e.dx, bz + e.dz] as [number, number],
      rotation: e.rotation,
      props: e.props ?? {},
    })),
  )
}

/** Drop a user-authored set (saved from a selection) at the centre of the
 *  largest room — same placement path as a built-in set. */
export function dropUserSet(setId: string) {
  const st = useStore.getState()
  const set = st.userSets.find((s) => s.id === setId)
  if (!set) return
  const [bx, bz] = dropCentre()
  dropArranged(
    set.items.map((e) => ({
      id: newSetItemId(),
      defId: e.defId,
      position: [bx + e.dx, bz + e.dz] as [number, number],
      rotation: e.rotation,
      props: e.props ?? {},
    })),
  )
}

/** Drop an imported IKEA set recipe at the centre of the largest room. */
export function dropIkeaSet(setKey: string) {
  const recipe = ikeaSetRecipes().find((r) => r.setKey === setKey)
  if (!recipe) return
  const [bx, bz] = dropCentre()
  dropArranged(buildSetGroup(recipe, { x: bx, z: bz }, builtinPlusIkea()))
}
