/**
 * Design-chat grounding context — the heart of the AI design chat feature.
 *
 * Serializes a compact, token-efficient, DETERMINISTIC text summary of the
 * live design (rooms + furniture + the app's own already-computed quality
 * numbers) so a BYO-key LLM answers questions about the user's ACTUAL
 * design instead of hallucinating generic advice. No network, no React, no
 * three.js — pure + fully unit-testable.
 *
 * Reuses existing pure analysis cores rather than recomputing anything:
 *  - `buildDesignScore` (clearance / furnishing / circulation / daylight /
 *    lighting — all plan+item geometry, no GPU) for the quality read + its
 *    human-readable issue messages.
 *  - `buildPlanStatistics` for the "by the numbers" area/room/perimeter digest.
 *  - `itemFootprint` for each placed item's real footprint (w × d).
 *
 * Deliberately OMITTED (would need the live 3D/GPU scene, not cheaply
 * available here): actual material/finish colours and textures, real-time
 * daylight/illuminance rendered from the sun position and time-of-day
 * (the daylight CATEGORY score above is a plan-geometry glazing-ratio
 * heuristic, not a photometric render), camera framing / walk-mode views,
 * and anything that needs a live WebGL context. The context explicitly
 * tells the model these are unavailable so it never guesses at them.
 */

import { buildDesignScore } from '../analysis/designScore'
import { buildPlanStatistics, roomKindLabel } from '../analysis/planStatistics'
import { roomKindFromName } from '../analysis/suggestions'
import { itemFootprint } from '../collision/placement'
import { allPlanRooms, levelOfRoom } from '../floorplan/levels'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import { planRoomArea, pointInRoom } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem, FurnitureType } from '../furniture/types'

export interface DesignChatContextOptions {
  /** Max furniture items listed per room before folding into "+N more". */
  maxItemsPerRoom?: number
  /** Max rooms listed in full before folding into "+N more rooms". */
  maxRooms?: number
}

export interface DesignChatContextInputs {
  items: FurnitureItem[]
  defs: Record<FurnitureType, FurnitureDef>
  plan: FloorPlan
  doors?: Record<string, { open: boolean }>
}

const DEFAULT_MAX_ITEMS_PER_ROOM = 8
const DEFAULT_MAX_ROOMS = 12

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function fmtM(n: number, dp = 2): string {
  return `${round(n, dp)}m`
}

function fmtM2(n: number, dp = 1): string {
  return `${round(n, dp)}m²`
}

/** Level-aware item-in-room test (mirrors `analysis/designScore.ts`'s private
 *  helper — kept in sync deliberately rather than exported/shared, since this
 *  file must stay independently readable as the context-builder's own logic). */
function itemInRoom(
  room: PlanRoom,
  levelOf: (roomId: string) => string,
  item: Pick<FurnitureItem, 'position' | 'levelId'>,
): boolean {
  if ((item.levelId ?? 'ground') !== levelOf(room.id)) return false
  return pointInRoom(room, item.position[0], item.position[1])
}

/** Build the per-room furniture listing, capped and deterministic (rooms in
 *  plan order, items in their existing array order — never re-sorted by a
 *  volatile key like distance/selection). */
function buildRoomSections(
  items: FurnitureItem[],
  defs: Record<FurnitureType, FurnitureDef>,
  plan: FloorPlan,
  maxItemsPerRoom: number,
  maxRooms: number,
): string {
  const rooms = allPlanRooms(plan).filter((r) => planRoomArea(r) > 0)
  const levelOf = (roomId: string) => levelOfRoom(plan, roomId)?.id ?? 'ground'
  if (rooms.length === 0) return 'Rooms: none (blank/bare-shell plan).'

  const shown = rooms.slice(0, maxRooms)
  const lines: string[] = []
  for (const room of shown) {
    const area = planRoomArea(room)
    const kind = roomKindLabel(roomKindFromName(room.name))
    const roomItems = items.filter((it) => itemInRoom(room, levelOf, it))
    lines.push(`- ${room.name} (${kind}), ${fmtM2(area)}, ${roomItems.length} item(s):`)
    const cap = Math.max(0, maxItemsPerRoom)
    const listed = roomItems.slice(0, cap)
    for (const it of listed) {
      const def = defs[it.defId]
      const name = def?.name ?? it.defId
      const obb = def ? itemFootprint(it, def) : null
      const dims = obb ? ` [${fmtM(2 * obb.hx)}×${fmtM(2 * obb.hz)}]` : ''
      lines.push(`    • ${name} @ (${fmtM(it.position[0])}, ${fmtM(it.position[1])})${dims}`)
    }
    const remaining = roomItems.length - listed.length
    if (remaining > 0) lines.push(`    …+${remaining} more`)
  }
  const extraRooms = rooms.length - shown.length
  if (extraRooms > 0) lines.push(`…+${extraRooms} more room(s) not listed.`)
  return lines.join('\n')
}

/** Fold a category's issue messages into one compact line (severity-prefixed). */
function formatCategoryLine(cat: {
  label: string
  score: number
  issues: { severity: string; message: string }[]
}): string {
  const issues = cat.issues.map((i) => `[${i.severity}] ${i.message}`).join(' ')
  return `- ${cat.label}: ${cat.score}/100. ${issues}`
}

/**
 * Build the full grounding context string for the AI design-chat prompt.
 * Deterministic for the same inputs (no timestamps/randomness) so it's
 * unit-testable and stable across identical designs.
 */
export function buildDesignChatContext(
  inputs: DesignChatContextInputs,
  opts: DesignChatContextOptions = {},
): string {
  const { items, defs, plan, doors } = inputs
  const maxItemsPerRoom = opts.maxItemsPerRoom ?? DEFAULT_MAX_ITEMS_PER_ROOM
  const maxRooms = opts.maxRooms ?? DEFAULT_MAX_ROOMS

  const stats = buildPlanStatistics(plan)
  const score = buildDesignScore(items, defs, plan, { doors })

  const byKindLine =
    stats.byKind.length > 0
      ? stats.byKind
          .map((k) => `${roomKindLabel(k.kind)} ×${k.count} (${fmtM2(k.areaSqm)})`)
          .join(', ')
      : 'none'

  const lines: string[] = []
  lines.push('DESIGN SUMMARY (Singapore HDB/condo home — all numbers computed by the app):')
  lines.push(
    `Plan: ${fmtM2(stats.totalAreaSqm)} total, ${stats.roomCount} room(s) across ${stats.levelCount} storey(s).`,
  )
  lines.push(`Room mix: ${byKindLine}.`)
  if (stats.circulationSqm > 0)
    lines.push(
      `Circulation (corridor/hallway): ${fmtM2(stats.circulationSqm)} (${round(stats.circulationFraction * 100, 0)}% of total).`,
    )
  lines.push('')
  lines.push(
    `Design score: ${score.overall}/100 (grade ${score.grade}) — ${score.itemCount} item(s), ${score.roomCount} habitable room(s).`,
  )
  for (const cat of score.categories) lines.push(formatCategoryLine(cat))
  lines.push('')
  lines.push('ROOMS & FURNITURE:')
  lines.push(buildRoomSections(items, defs, plan, maxItemsPerRoom, maxRooms))
  lines.push('')
  lines.push(
    'NOT AVAILABLE from this summary (needs the live 3D scene — never estimate these): ' +
      'material/finish colours & textures, actual rendered daylight/illuminance at the current ' +
      'time of day (the daylight score above is a plan-geometry glazing-ratio rule of thumb, not ' +
      'a photometric render), camera framing/walk-mode views.',
  )
  return lines.join('\n')
}
