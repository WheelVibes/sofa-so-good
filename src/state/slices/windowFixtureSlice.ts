import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import {
  isInteractableWindowFixture,
  nextWindowFixtureProps,
} from '../../furniture/windowFixtureInteract'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Walk-mode curtain/blind interact state — the furniture-item counterpart to
 * `doorsSlice` (WINDOW-FIXTURE-INTERACT). Unlike doors, a curtain/blind's
 * open/closed value already lives on the placed item's own `props`
 * (`drawAmount`/`lower`, read by the `Curtain`/`RollerBlind` primitives), so
 * there is no separate `Record<id, state>` to persist here — toggling just
 * patches `items` via the normal item-props path, which already round-trips
 * through the save schema (`items` field) with no new schema work needed.
 *
 * `nearbyFixtureId` mirrors `nearbyDoorId`: transient (session-only), set by
 * `FirstPersonCamera`'s aim loop, cleared on leaving walk mode.
 */
export interface WindowFixtureSlice {
  nearbyFixtureId: string | null
  setNearbyFixture: (id: string | null) => void
  /** Flip a window fixture's own open/closed prop between its two extremes
   *  (a discrete toggle, like a door's fixed 90° swing — not a partial
   *  drag). No-op if `id` isn't a placed, toggleable window fixture. */
  toggleWindowFixture: (id: string) => void
}

export const WINDOW_FIXTURE_INITIAL: Pick<WindowFixtureSlice, 'nearbyFixtureId'> = {
  nearbyFixtureId: null,
}

export const createWindowFixtureSlice: SliceCreator<WindowFixtureSlice, RootState> = (
  set,
  get,
) => ({
  ...WINDOW_FIXTURE_INITIAL,
  setNearbyFixture: (id) => set((s) => (s.nearbyFixtureId === id ? s : { nearbyFixtureId: id })),
  toggleWindowFixture: (id) => {
    const item = get().items.find((it) => it.id === id)
    if (!item) return
    // Curtains/roller-blinds are builtin parametric defs only (no user/IKEA/
    // remote variant exists), so the builtin table alone is a complete lookup.
    const def = BUILTIN_CATALOG[item.defId]
    if (!def || !isInteractableWindowFixture(def)) return
    const patch = nextWindowFixtureProps(def, item.props)
    if (!patch) return
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, ...patch } } : it)),
    }))
  },
})
