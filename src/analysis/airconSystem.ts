/**
 * Aircon SYSTEM planner (BSJ-2) — turns the per-room BTU sizing
 * (`airconSizing.ts`) into the actual SG purchase decision: which multi-split
 * *system* to buy, how many outdoor condensers, and which rooms share each one.
 *
 * In Singapore a "System-N" is one outdoor condenser driving N indoor fan-coil
 * units (FCUs): System-2 = 1 condenser + 2 FCUs (the studio/2-room norm),
 * System-3 = 1 + 3 (the 4-room norm), System-4 = 1 + 4 (5-room / condo).
 * System-5 exists but is increasingly rare in 2026, so we cap one condenser at
 * 4 FCUs and split past that onto a second condenser.
 *
 * Grouping rule (usage patterns, per SG installers): the day/common zone
 * (living + dining) shares one condenser and the private zone (bedrooms +
 * study) another, so night-time bedroom cooling runs independently of the
 * living area — the standard 4-room "System-2 + System-3" split. A zone with
 * more than 4 FCUs is split onto extra condensers.
 *
 * Pure logic only — no React, no three, no store — so it stays fully
 * unit-testable, exactly like `airconSizing.ts` (which it consumes).
 *
 * SOURCES (2025-26 SG) for the capacity table + connection ratio below:
 *   - vdairconservices.com/aircon-system-2-3-4-singapore-guide
 *   - usinaircon.com.sg/how-to-select-system-3-aircon-singapore
 *   - coolchannels.com.sg/blogs/system-3-vs-system-4-aircon-singapore
 *   - aircons.sg — System 3 vs 4 vs 5 + HDB ledge weight rules
 *   - fcairconservicing.com/guide/aircon-system-1-2-3-4-5
 */

import { allPlanRooms } from '../floorplan/levels'
import { roomCategory } from '../floorplan/roomCategory'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { buildAirconSizing } from './airconSizing'

/**
 * Room categories that get an indoor FCU (habitable / occupied). SG homes do
 * NOT air-condition wet areas, service yards, stores or foyers. Mirrors
 * `renovationAllocator.ts`'s `AIRCON_CATEGORIES` (kept in sync intentionally).
 */
export const AIRCON_SERVED_CATEGORIES = new Set([
  'living',
  'dining',
  'bedroom',
  'masterBedroom',
  'study',
])

/**
 * Max FCUs on ONE outdoor condenser before a second condenser is required.
 * System-4 (1 condenser + 4 FCUs) is the practical residential ceiling;
 * System-5 (1 + 5) exists but is increasingly rare (VD Aircon 2026), so we
 * split a zone larger than 4 onto extra condensers.
 */
export const MAX_FCU_PER_CONDENSER = 4

/**
 * Accepted connection ratio: total connected indoor FCU capacity divided by the
 * outdoor condenser's NOMINAL capacity. 100–130% is the industry-accepted band;
 * above ~130% each FCU is starved of cooling power. (VD Aircon 2026 —
 * "Industry standard: 100-130% connection ratio"; usinaircon; coolchannels 2026.)
 */
export const MAX_CONNECTION_RATIO = 1.3

/**
 * Representative SG residential OUTDOOR condenser nominal cooling capacity
 * (BTU/hr) keyed by the number of indoor FCUs it drives. Each is a mid value of
 * the 2025-26 installer-guide range (sources in the module header):
 *   System-2: 18,000–24,000  → 24,000
 *   System-3: 27,000–33,000  → 30,000
 *   System-4: 33,000–40,000  → 38,000
 *   System-5: 38,000–45,000  → 42,000  (rare)
 * A single FCU (count 1) is a 1:1 single split — the condenser is sized to that
 * one FCU, handled in {@link condenserNominalBtu}.
 */
export const CONDENSER_NOMINAL_BTU: Record<number, number> = {
  2: 24000,
  3: 30000,
  4: 38000,
  5: 42000,
}

/**
 * Approximate OUTDOOR condenser dry weight (kg) by FCU count, for the HDB
 * AC-ledge / service-yard panel-weight check. aircons.sg notes a 3-room
 * multi-split compressor can exceed 70 kg; these are representative figures,
 * hedged in the advisory copy (confirm the actual model's weight with the
 * installer).
 */
export const CONDENSER_WEIGHT_KG: Record<number, number> = {
  1: 30,
  2: 38,
  3: 48,
  4: 60,
  5: 72,
}

/**
 * HDB guideline for the maximum load a single AC-ledge / service-yard wall
 * panel is designed to carry (~110 kg total across the mounted condensers),
 * from the blank-slate research doc (aircons.sg ledge-weight rules).
 */
export const LEDGE_MAX_KG = 110

/** Nominal condenser capacity (BTU/hr) for a system driving `count` FCUs whose
 *  total connected load is `connectedBtu`. Count 1 is a single split sized to
 *  the one FCU; 2–5 use the standard tier table (capped at System-5). */
export function condenserNominalBtu(count: number, connectedBtu: number): number {
  if (count <= 1) return connectedBtu
  return CONDENSER_NOMINAL_BTU[Math.min(count, 5)] ?? CONDENSER_NOMINAL_BTU[5]!
}

/** Condenser weight (kg) for a system driving `count` FCUs (capped at 5). */
export function condenserWeightKg(count: number): number {
  return CONDENSER_WEIGHT_KG[Math.min(Math.max(count, 1), 5)] ?? CONDENSER_WEIGHT_KG[5]!
}

/** One indoor fan-coil unit in the plan — the FCU serving a single room. */
export interface AirconFcu {
  roomId: string
  roomName: string
  /** FCU capacity chosen for the room, BTU/hr (from `airconSizing.systemBtu`). */
  btu: number
  /** Usage zone the FCU belongs to (drives condenser grouping). */
  zone: 'common' | 'private'
}

/** One proposed multi-split system = one outdoor condenser + its FCUs. */
export interface AirconSystem {
  /** 1-based system number within the plan. */
  index: number
  /** Human label — "System-3" (or "Single split" for one FCU). */
  label: string
  /** The FCUs on this condenser. */
  fcus: AirconFcu[]
  /** Total connected FCU load, BTU/hr. */
  connectedBtu: number
  /** Chosen outdoor condenser nominal capacity, BTU/hr. */
  condenserNominalBtu: number
  /** connectedBtu / condenserNominalBtu (the connection ratio, 0..). */
  loadRatio: number
  /** True when `loadRatio` exceeds {@link MAX_CONNECTION_RATIO} — the condenser
   *  is undersized for its FCUs (specify a higher-capacity model or split). */
  overCapacity: boolean
  /** Estimated outdoor-unit weight, kg. */
  condenserWeightKg: number
  /** One-line trunking advisory (route confirmation; no 3D route in v1). */
  trunkingNote: string
}

/** Whole-flat system proposal. */
export interface AirconSystemPlan {
  systems: AirconSystem[]
  /** Number of outdoor condensers required (= systems.length). */
  condenserCount: number
  /** Number of indoor FCUs across all systems. */
  fcuCount: number
  /** Sum of every FCU's connected load, BTU/hr. */
  totalConnectedBtu: number
  /** Total estimated condenser weight, kg. */
  totalCondenserWeightKg: number
  /** True when more than one condenser is required. */
  needsMultipleCondensers: boolean
  /** AC-ledge panel-weight advisory when ≥2 condensers land on one ledge, else
   *  null (no meaningful weight risk for a single condenser). */
  ledgeWeightNote: string | null
}

const sum = (fcus: AirconFcu[]): number => fcus.reduce((s, f) => s + f.btu, 0)

const systemLabel = (count: number): string => (count <= 1 ? 'Single split' : `System-${count}`)

const TRUNKING_NOTE =
  'Trunking runs from the AC ledge along the corridor ceiling to this system’s rooms — confirm the route with your installer.'

/**
 * Pack a usage-zone's FCUs onto condensers of at most {@link MAX_FCU_PER_CONDENSER}
 * FCUs each. Splits into as-even chunks as the cap allows so, e.g., 5 bedrooms
 * become 3+2 rather than 4+1 (both FCUs on the smaller condenser stay useful).
 */
function packZone(fcus: AirconFcu[]): AirconFcu[][] {
  if (fcus.length === 0) return []
  const condensers = Math.ceil(fcus.length / MAX_FCU_PER_CONDENSER)
  const base = Math.floor(fcus.length / condensers)
  const remainder = fcus.length % condensers
  const groups: AirconFcu[][] = []
  let i = 0
  for (let g = 0; g < condensers; g++) {
    const take = base + (g < remainder ? 1 : 0)
    groups.push(fcus.slice(i, i + take))
    i += take
  }
  return groups
}

function toSystem(fcus: AirconFcu[], index: number): AirconSystem {
  const count = fcus.length
  const connectedBtu = sum(fcus)
  const nominal = condenserNominalBtu(count, connectedBtu)
  const loadRatio = nominal > 0 ? connectedBtu / nominal : 0
  return {
    index,
    label: systemLabel(count),
    fcus,
    connectedBtu,
    condenserNominalBtu: nominal,
    loadRatio,
    overCapacity: loadRatio > MAX_CONNECTION_RATIO,
    condenserWeightKg: condenserWeightKg(count),
    trunkingNote: TRUNKING_NOTE,
  }
}

/**
 * Build the whole-flat aircon system proposal from the plan. Groups the served
 * (habitable) rooms into common vs private usage zones, packs each zone onto
 * condensers (≤ {@link MAX_FCU_PER_CONDENSER} FCUs each), and returns the
 * proposed systems with per-system load %, weight and trunking note plus the
 * whole-flat condenser count + ledge-weight advisory. Pure; never throws.
 * `orientationDeg` is forwarded to `buildAirconSizing` for the E/W solar uplift.
 */
export function buildAirconSystemPlan(plan: FloorPlan, orientationDeg = 0): AirconSystemPlan {
  const sizing = buildAirconSizing(plan, orientationDeg)
  const roomById = new Map<string, PlanRoom>(allPlanRooms(plan).map((r) => [r.id, r]))

  const common: AirconFcu[] = []
  const private_: AirconFcu[] = []
  for (const row of sizing.rooms) {
    const room = roomById.get(row.roomId)
    if (!room) continue
    const cat = roomCategory(room)
    if (!AIRCON_SERVED_CATEGORIES.has(cat)) continue
    if (!(row.systemBtu > 0)) continue
    const zone: AirconFcu['zone'] = cat === 'living' || cat === 'dining' ? 'common' : 'private'
    const fcu: AirconFcu = {
      roomId: row.roomId,
      roomName: row.roomName,
      btu: row.systemBtu,
      zone,
    }
    ;(zone === 'common' ? common : private_).push(fcu)
  }

  // Common (living/dining) condensers first, then private (bedrooms/study) —
  // the order the systems are numbered + placed on the ledge.
  const groups = [...packZone(common), ...packZone(private_)]
  const systems = groups.map((g, i) => toSystem(g, i + 1))

  const condenserCount = systems.length
  const fcuCount = systems.reduce((s, sys) => s + sys.fcus.length, 0)
  const totalConnectedBtu = systems.reduce((s, sys) => s + sys.connectedBtu, 0)
  const totalCondenserWeightKg = systems.reduce((s, sys) => s + sys.condenserWeightKg, 0)
  const needsMultipleCondensers = condenserCount > 1

  let ledgeWeightNote: string | null = null
  if (condenserCount >= 2) {
    const kg = Math.round(totalCondenserWeightKg)
    ledgeWeightNote =
      totalCondenserWeightKg > LEDGE_MAX_KG
        ? `${condenserCount} condensers ≈ ${kg} kg total — likely EXCEEDS the ~${LEDGE_MAX_KG} kg HDB AC-ledge panel guideline. Split across two ledges or confirm the structural limit with HDB / your installer.`
        : `${condenserCount} condensers ≈ ${kg} kg total on one ledge — within the ~${LEDGE_MAX_KG} kg HDB panel guideline, but confirm the ledge can carry it.`
  }

  return {
    systems,
    condenserCount,
    fcuCount,
    totalConnectedBtu,
    totalCondenserWeightKg,
    needsMultipleCondensers,
    ledgeWeightNote,
  }
}
