import { nextLightPowerProps } from '../../furniture/lightInteract'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * Walk-mode light on/off interact state — the light counterpart to
 * `windowFixtureSlice` (WALK-LIGHT-INTERACT). An item's emitting state
 * already lives on its own `props.lightOn`, so there's no separate
 * `Record<id, state>` to persist here — toggling just patches `items`,
 * which already round-trips through the save schema. Unlike screens
 * (parametric-only), an interactable light can be ANY item kind — a
 * registered builtin fixture OR a GLB/IKEA/user import the player already
 * flagged as a light source (`itemAsLight`) — so, unlike
 * `screenInteractSlice`, the toggle needs no def lookup at all:
 * `nextLightPowerProps` only reads `defId` + `props`.
 *
 * `nearbyLightId` mirrors `nearbyFixtureId`/`nearbyDoorId`: transient
 * (session-only), set by `FirstPersonCamera`'s aim loop (nearest-wins against
 * `nearbyScreenId` — see `screenInteractSlice.ts`), cleared on leaving walk mode.
 */
export interface LightInteractSlice {
  nearbyLightId: string | null
  setNearbyLight: (id: string | null) => void
  /** Flip a light-capable item's `lightOn` between on (`'yes'`/absent) and
   *  off (`'no'`) — a discrete switch flip, not a dimmer. No-op if `id` isn't
   *  a placed, eligible light. */
  toggleLightPower: (id: string) => void
}

export const LIGHT_INTERACT_INITIAL: Pick<LightInteractSlice, 'nearbyLightId'> = {
  nearbyLightId: null,
}

export const createLightInteractSlice: SliceCreator<LightInteractSlice, RootState> = (
  set,
  get,
) => ({
  ...LIGHT_INTERACT_INITIAL,
  setNearbyLight: (id) => set((s) => (s.nearbyLightId === id ? s : { nearbyLightId: id })),
  toggleLightPower: (id) => {
    const item = get().items.find((it) => it.id === id)
    if (!item) return
    const patch = nextLightPowerProps(item.defId, item.props)
    if (!patch) return
    get().pushHistory()
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, props: { ...it.props, ...patch } } : it)),
    }))
  },
})
