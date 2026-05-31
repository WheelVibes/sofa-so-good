import { isDefaultPlan } from '../floorplan/planGeometry'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { arrangeAllRooms, arrangeAllRoomsForPlan } from './autoArrange'

/** Auto-arrange every room per the interior-design rules. Shared by the
 *  toolbar Tidy button and the Tidy keyboard shortcut. Uses the merged catalog
 *  so imported (IKEA/user) item footprints + flags are honoured. */
export function tidyHome(): void {
  const s = useStore.getState()
  s.pushHistory()
  const catalog = buildMergedCatalog(s)
  const next = isDefaultPlan(s.floorPlan)
    ? arrangeAllRooms(s.items, catalog, s.doors)
    : arrangeAllRoomsForPlan(s.floorPlan, s.items, catalog, s.doors)
  s.setItems(next)
}
