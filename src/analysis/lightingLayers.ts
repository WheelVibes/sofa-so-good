/**
 * Lighting LAYERS per room — the "is this well lit?" question that average
 * illuminance cannot answer.
 *
 * **The gap this closes.** `lighting2d/roomLux.ts` estimates each room's average
 * lux against a recommended band, which tells you whether there is ENOUGH
 * light. It cannot tell you whether the light is any good: a living room hitting
 * 150 lx from one ceiling pendant passes on lux and is, by professional
 * standards, badly lit. The app's only existing prompt fired on
 * `!c.has('lighting')` — i.e. a room with no fixture at all — so a single
 * pendant satisfied it.
 *
 * Professional practice lights in three layers: **ambient** (overall
 * brightness, usually ceiling-mounted), **task** (directed, for reading or a
 * worktop) and **accent** (art, shelving, architecture). "Every well-lit room
 * relies on three foundational layers", and the IALD's starting point for a
 * living room is roughly **50% ambient / 30% task / 20% accent**, adjusted for
 * the room's use.
 *
 * **What this reports and what it deliberately does not.** It reports which
 * layers a room HAS and each layer's share of the room's lumens, and it flags
 * MISSING layers. It does NOT flag deviation from 50/30/20: the sources call
 * that a *starting* ratio adjusted per room, so scoring against it would
 * generate confident noise about a judgement the designer is entitled to make.
 * A missing layer is a fact; a 55/25/20 split is a preference.
 *
 * **Scope.** Only rooms where layering is the convention — living, dining and
 * bedrooms. A corridor, bathroom, yard or store does not want an accent layer,
 * and demanding one would be the kind of check that gets switched off.
 *
 * Pure (no store, no three, no DOM).
 *
 * Sources: decorilla.com "Light Layering"; lutron.com "Layering Lighting at
 * Home"; landrydesigns.com "Ambient Lighting in Interior Design"; the IALD
 * 50/30/20 starting ratio as reported by thedecormag.com.
 */

import { roomCategory } from '../floorplan/roomCategory'
import type { PlanRoom, RoomCategory } from '../floorplan/types'
import type { LightLayer } from '../furniture/lightEmitters'

/** Room uses where three-layer lighting is the professional convention. */
const LAYERED_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'living',
  'dining',
  'bedroom',
  'masterBedroom',
  'study',
])

/** The IALD starting mix for a living room, for CONTEXT on the report — never
 *  scored against, because the sources call it a starting point adjusted per
 *  room. */
export const IALD_STARTING_MIX = { ambient: 0.5, task: 0.3, accent: 0.2 } as const

/** One fixture as this module needs it. The caller resolves the room on the
 *  fixture's own storey (`levels.ts:roomAtItem`). */
export interface LayerFixtureInput {
  roomId: string
  layer: LightLayer
  /** Flux, lm — used for the share, so a token accent uplighter does not read
   *  as an equal third of the scheme. */
  lumens: number
}

interface RoomLayerReport {
  roomId: string
  roomName: string
  /** Layers with at least one fixture. */
  present: LightLayer[]
  /** Layers with none — the actionable part. */
  missing: LightLayer[]
  /** Each layer's share of the room's total lumens (0..1). */
  share: Record<LightLayer, number>
  /** Total flux across the room's fixtures, lm. */
  lumens: number
}

export interface LightingLayersReport {
  rooms: RoomLayerReport[]
  /** Rooms examined, so "all layered" cannot mean "nothing looked at". */
  checked: number
  note: string
}

const LAYERS_NOTE =
  'Professional practice lights a room in three layers — ambient (overall), task (directed) and ' +
  `accent (art, shelving, architecture). The IALD's starting point for a living room is about ` +
  `${IALD_STARTING_MIX.ambient * 100}% ambient / ${IALD_STARTING_MIX.task * 100}% task / ` +
  `${IALD_STARTING_MIX.accent * 100}% accent, adjusted for the room's use — so the mix below is ` +
  'context, not a target, and only a MISSING layer is flagged. Average illuminance is a separate ' +
  'question, answered by the room lux table: a room can hit its recommended lux from one pendant ' +
  'and still be unlayered.'

const ALL_LAYERS: LightLayer[] = ['ambient', 'task', 'accent']

/**
 * Layer coverage for every room where layering is the convention.
 *
 * Rooms with NO fixtures are included with all three layers missing — "this
 * room is unlit" is the most actionable finding there is, and dropping it would
 * make the report quietest exactly where it should be loudest.
 */
export function buildLightingLayersReport(
  rooms: readonly PlanRoom[],
  fixtures: readonly LayerFixtureInput[],
): LightingLayersReport {
  const byRoom = new Map<string, LayerFixtureInput[]>()
  for (const f of fixtures) {
    const list = byRoom.get(f.roomId)
    if (list) list.push(f)
    else byRoom.set(f.roomId, [f])
  }

  const out: RoomLayerReport[] = []
  for (const room of rooms) {
    if (!LAYERED_CATEGORIES.has(roomCategory(room))) continue
    const own = byRoom.get(room.id) ?? []
    const lumens = own.reduce((s, f) => s + Math.max(0, f.lumens), 0)
    const share: Record<LightLayer, number> = { ambient: 0, task: 0, accent: 0 }
    for (const f of own) {
      if (lumens > 0) share[f.layer] += Math.max(0, f.lumens) / lumens
    }
    const present = ALL_LAYERS.filter((l) => own.some((f) => f.layer === l))
    out.push({
      roomId: room.id,
      roomName: room.name,
      present,
      missing: ALL_LAYERS.filter((l) => !present.includes(l)),
      share: {
        ambient: Math.round(share.ambient * 100) / 100,
        task: Math.round(share.task * 100) / 100,
        accent: Math.round(share.accent * 100) / 100,
      },
      lumens: Math.round(lumens),
    })
  }
  return { rooms: out, checked: out.length, note: LAYERS_NOTE }
}
