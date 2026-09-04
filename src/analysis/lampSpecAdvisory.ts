/**
 * Lamp-specification advisories — the compliance and specification checks the
 * lighting schedule's numbers make possible.
 *
 * `lighting2d/lightingPlan.ts` builds a fixture schedule, but until
 * v0.31.5.398 its rows carried `intensity` in three.js candela: a RENDER unit,
 * on a register whose own header warns it must never be compared to a real
 * luminaire. With `EmitterSpec.cct` and `EmitterSpec.ip` authored as product
 * properties, two checks become possible that no amount of geometry could give:
 *
 * **1. Ingress protection in a wet room (COMPLIANCE, not procurement).**
 * Bathroom Zone 1 (directly above the bath or shower to 2.25 m) and Zone 2
 * (0.6 m around it, to the same height) both require **IP44 minimum** — "IP44
 * indicates that the fixture is protected against splashes of water from any
 * direction". A standard indoor fixture is IP20, and every shipped emitter is,
 * so a ceiling light or vanity light dropped into a bath/powder room is a real
 * finding rather than a stylistic one.
 *
 * Zones are NOT modelled: doing it properly needs the bath/shower position and
 * a 3D height band, and the app has the fixture height but not a reliable
 * shower envelope. So the check is ROOM-level — any sub-IP44 fixture in a wet
 * room — which is conservative in the safe direction (it may flag a fixture
 * outside the zones, it will never miss one inside them) and the wording says
 * so. The alternative, inventing zone geometry, would produce confident misses.
 *
 * **2. Colour temperature against the room's use (a SPEC, not a preference).**
 * 3000 K warm white suits living rooms and bedrooms; a task space — kitchen,
 * bath — wants ~4000 K neutral, which "keeps the colour of meat, fish, herbs
 * and produce true". Every shipped emitter is 3000 K, so this raises the
 * question rather than silently re-specifying the fixture: which lamp to buy is
 * the designer's call, and the sheet should ask it before the electrician does.
 *
 * Pure (no store, no three, no DOM).
 *
 * Sources: hollowaysofludlow.com "Bathroom Zones & IP Ratings";
 * meteorelectrical.com "IP44 vs IP65 Bathroom Lighting"; tecolite.com
 * "3000K vs 4000K"; olamled.com "3000K vs 4000K".
 */

import { roomCategory } from '../floorplan/roomCategory'
import type { PlanRoom, RoomCategory } from '../floorplan/types'

/** Minimum ingress protection for a luminaire in a bathroom zone 1 or 2. */
export const WET_ROOM_MIN_IP = 44
/** Neutral white — what a task space wants. */
export const TASK_CCT_K = 4000
/** A fixture warmer than this in a task room raises the CCT advisory. */
const TASK_CCT_MIN_K = 3500

/** Rooms where a luminaire needs wet-rated ingress protection. */
const WET_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>(['bath', 'powder'])
/** Rooms whose primary use is visual TASK work, wanting neutral white. */
const TASK_CATEGORIES: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'kitchen',
  'bath',
  'powder',
])

/** One fixture as this module needs it — a minimal shape, so this module has no
 *  dependency on the lighting-plan or furniture types. */
export interface LampSpecInput {
  id: string
  label: string
  /** The room it stands in, already resolved by the caller on the fixture's own
   *  storey (`levels.ts:roomAtItem` / `itemsInRoom`). */
  room: PlanRoom
  cct: number
  ip: number
}

interface LampSpecFinding {
  fixtureId: string
  label: string
  roomName: string
  kind: 'ingress' | 'colour-temperature'
  /** What to do, phrased as a prompt — a check that reads as a verdict gets
   *  ignored after the second false alarm. */
  action: string
}

export interface LampSpecAdvisory {
  findings: LampSpecFinding[]
  /** Fixtures examined, so "all clear" cannot mean "nothing was looked at". */
  checked: number
  /** Always printed alongside the findings. */
  scopeNote: string
}

const LAMP_SPEC_SCOPE_NOTE =
  `Ingress protection is checked per ROOM, not per bathroom zone: a wet room's zones 1 and 2 ` +
  `require IP${WET_ROOM_MIN_IP} minimum, and this flags any fixture below that anywhere in the ` +
  `room. That is deliberately conservative — it may flag a fixture that sits outside the zones, ` +
  `but it will not miss one inside them. Confirm the fixture's rating and its position against ` +
  `the bath/shower on site.`

/**
 * Specification advisories for the placed fixtures. Fixtures whose room the
 * caller could not resolve are skipped and not counted — a fixture outside every
 * room has no room use to check against.
 */
export function buildLampSpecAdvisory(fixtures: readonly LampSpecInput[]): LampSpecAdvisory {
  const findings: LampSpecFinding[] = []
  let checked = 0
  for (const f of fixtures) {
    if (!f?.room) continue
    checked += 1
    const category = roomCategory(f.room)
    if (WET_CATEGORIES.has(category) && f.ip < WET_ROOM_MIN_IP) {
      findings.push({
        fixtureId: f.id,
        label: f.label,
        roomName: f.room.name,
        kind: 'ingress',
        action:
          `${f.label} in ${f.room.name} is specified IP${f.ip}. A wet room's zones 1 and 2 need ` +
          `IP${WET_ROOM_MIN_IP} minimum — specify a wet-rated fixture, or confirm this one sits ` +
          `outside both zones.`,
      })
    }
    if (TASK_CATEGORIES.has(category) && f.cct < TASK_CCT_MIN_K) {
      findings.push({
        fixtureId: f.id,
        label: f.label,
        roomName: f.room.name,
        kind: 'colour-temperature',
        action:
          `${f.label} in ${f.room.name} is specified ${f.cct}K warm white. A task space usually ` +
          `wants around ${TASK_CCT_K}K neutral for accurate colour — decide which before the ` +
          `lamps are ordered.`,
      })
    }
  }
  return { findings, checked, scopeNote: LAMP_SPEC_SCOPE_NOTE }
}
