import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { nextScreenContentProps } from '../../furniture/screenInteract'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Walk-mode screen-wallpaper interact state — the screen counterpart to
 * `windowFixtureSlice` (WALK-SCREEN-INTERACT). A screen's `screenContent`
 * value already lives on the placed item's own `props`, so there's no
 * separate `Record<id, state>` to persist here — cycling just patches
 * `items` via the normal item-props path, which already round-trips through
 * the save schema (`items` field) with no new schema work needed.
 *
 * `nearbyScreenId` mirrors `nearbyFixtureId`/`nearbyDoorId`: transient
 * (session-only), set by `FirstPersonCamera`'s aim loop (nearest-wins against
 * `nearbyLightId` — see `lightInteractSlice.ts`), cleared on leaving walk mode.
 */
export interface ScreenInteractSlice {
  nearbyScreenId: string | null
  setNearbyScreen: (id: string | null) => void
  /** Advance a screen's `screenContent` to the next option in its def's own
   *  enum list, wrapping around. No-op if `id` isn't a placed, eligible screen. */
  cycleScreenContent: (id: string) => void
}

export const SCREEN_INTERACT_INITIAL: Pick<ScreenInteractSlice, 'nearbyScreenId'> = {
  nearbyScreenId: null,
}

export const createScreenInteractSlice: SliceCreator<ScreenInteractSlice, RootState> = (
  set,
  get,
) => ({
  ...SCREEN_INTERACT_INITIAL,
  setNearbyScreen: (id) => set((s) => (s.nearbyScreenId === id ? s : { nearbyScreenId: id })),
  cycleScreenContent: (id) => {
    const item = get().items.find((it) => it.id === id)
    if (!item) return
    // `isInteractableScreen` requires a *parametric* def (a `screenContent`
    // paramSchema enum field) — GLB/IKEA/user/remote defs never carry a
    // paramSchema at all, so a screen can only ever be a builtin parametric
    // def (Monitor/FlatscreenTV). The builtin table alone is a complete
    // lookup, mirroring `windowFixtureSlice`'s identical reasoning.
    const def = BUILTIN_CATALOG[item.defId]
    if (!def) return
    const patch = nextScreenContentProps(def, item.props)
    if (!patch) return
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, ...patch } } : it)),
    }))
  },
})
