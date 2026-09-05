/**
 * LAMP-BOUNCE — the lamps' first bounce, per room, which a daylight-only irradiance bake
 * cannot hold (v0.33.0.3).
 *
 * `replace`-mode GI discards the analytic fill on every mapped surface and substitutes the
 * baked DAYLIGHT irradiance. That fill had also been standing in, crudely, for the
 * interreflection of the room's own lamps, so with the lights ON a room whose sky view is
 * small went dark exactly where a lamp-lit room is brightest: the ceiling. Measured at the
 * kitchen-y1 pose, 13:00, lamps on, app against a Cycles render of the same GLB with the same
 * 19 point lights and matched exposure (`scene-glb.mjs` + `render_from_manifest.py`): walls
 * agree to 3 % (188 vs 194) while the ceiling reads **152 against 190** — the pendant's direct
 * pool is there, the light the lit walls throw back up is not.
 *
 * The term is per ROOM — `Σ emitter intensity / floor area` — because lamp bounce scales with
 * lamp flux over the surfaces it lands on: measured on the default flat, bath2 is 2.78 and
 * serviceYard 2.88 against bedroom3's 0.89, a 3× spread a single global number would flatten.
 * **The kitchen and living room are NOT the contrast that motivates it** — they measure 1.17 and
 * 1.10, near-equal; the first draft of this header claimed otherwise and the test caught it. The
 * living room's ceiling barely moved in the sweep because that ceiling carries no baked map (it is
 * the plain Lambert white of `ceiling/Ceiling.tsx`), so the GI patch never reaches it; its mapped
 * walls moved by the same few counts the kitchen's did. Then a calibration constant, then an
 * orientation weight — a ceiling sees the lit floor and walls, a wall sees half a room, a floor
 * mostly sees the lamp directly (which the fixture light already renders). Pure, so it is
 * unit-tested; the shader side is `visibilityLightmap.ts`.
 *
 * Known limits, stated: computed once when the maps attach (a lamp placed later joins at the
 * next attach); per-item `lightOn: 'no'` is honoured at that moment only; the scene-wide
 * lights switch scales the whole term live.
 */
import { type FloorPlan, type PlanRoom, planRoomArea, pointInRoom } from '../floorplan/types'
import { resolveEmitterSpec } from '../furniture/lightEmitters'
import type { FurnitureItem, FurnitureType } from '../furniture/types'

/** Irradiance (in the bake's own units) per unit lamp density (intensity / m²). Calibrated
 *  against the kitchen Cycles reference — see the CHANGELOG entry for the sweep. */
export const LAMP_BOUNCE_K = 1.2

/** How much of the room's lamp bounce a surface receives by which way it faces. */
export const LAMP_BOUNCE_ORIENTATION = { down: 1.0, side: 0.35, up: 0.2 } as const

/** Σ emitter intensity per room, divided by that room's floor area. Rooms with no lamp → 0. */
export function roomLampDensity(
  rooms: readonly PlanRoom[],
  items: readonly FurnitureItem[],
): Map<string, number> {
  const flux = new Map<string, number>()
  for (const it of items) {
    const spec = resolveEmitterSpec(it.defId as FurnitureType, it.props)
    if (!spec) continue
    const room = rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    if (!room) continue
    flux.set(room.id, (flux.get(room.id) ?? 0) + spec.intensity)
  }
  const out = new Map<string, number>()
  for (const r of rooms) {
    const area = planRoomArea(r)
    const f = flux.get(r.id) ?? 0
    out.set(r.id, area > 0.5 ? f / area : 0)
  }
  return out
}

/** A world-point → lamp density lookup for the plan's ground level. */
export function lampDensityLookup(
  plan: FloorPlan,
  items: readonly FurnitureItem[],
): (x: number, z: number) => number {
  const rooms = plan.rooms
  const density = roomLampDensity(rooms, items)
  return (x, z) => {
    const room = rooms.find((r) => pointInRoom(r, x, z))
    return room ? (density.get(room.id) ?? 0) : 0
  }
}
