/**
 * FF&E schedule (Furniture, Fixtures & Equipment) — the pure data core.
 *
 * The central professional hand-off document: one line per item type (per room),
 * with source, SKU, real dimensions, quantity and pricing — what designers give
 * procurement, contractors and clients (Fohlio / Houzz / Programa). We already
 * hold all of this (def footprint, IKEA article numbers, prices, room
 * attribution); this assembles it into the schedule shape. Pure (no DOM/React)
 * → unit-testable; the report renders it (FFE2) and it can feed a CSV.
 */
import { type FloorPlan, pointInRoom } from '../floorplan/types'
import { itemPrice } from './../furniture/furniturePrices'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'

export interface FfeRow {
  /** Room name the piece sits in, or 'Unassigned'. */
  room: string
  category: string
  /** Item name (with variant in parentheses, if any). */
  name: string
  /** Friendly source label: Built-in / IKEA / Custom / Library / Pack. */
  source: string
  /** SKU / article number where known (IKEA), else ''. */
  sku: string
  /** Real (unrotated) product size in metres. */
  w: number
  d: number
  h: number
  qty: number
  /** Unit price (SGD). */
  unit: number
  /** Line total (SGD) = unit × qty. */
  total: number
}

const SOURCE_LABEL: Record<string, string> = {
  builtin: 'Built-in',
  user: 'Custom',
  ikea: 'IKEA',
  remote: 'Library',
  pack: 'Pack',
}

/** Real (unrotated) W/D/H of an item in metres — parametric props override the
 *  def footprint; scaled by the item/def scale. */
function itemDims(item: FurnitureItem, def: FurnitureDef): { w: number; d: number; h: number } {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  let h = def.defaultFootprint.h
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    const hv = item.props['height']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
    if (typeof hv === 'number') h = hv
  }
  const defScale = def.kind === 'parametric' ? undefined : def.scale
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : defScale) ?? 1
  return { w: w * scale, d: d * scale, h: h * scale }
}

/** Friendly source label (parametric defs have no `source` — they're built-in). */
function sourceOf(def: FurnitureDef): string {
  const src = 'source' in def ? (def.source as string) : 'builtin'
  return SOURCE_LABEL[src] ?? src
}

/** SKU for a def: the active IKEA variant's article number, else ''. */
function skuOf(def: FurnitureDef): string {
  if ('source' in def && def.source === 'ikea') {
    const idef = def as Extract<FurnitureDef, { source: 'ikea' }>
    const v = idef.variants.find((x) => x.finish === idef.activeVariant) ?? idef.variants[0]
    return v?.articleNumber ?? ''
  }
  return ''
}

/**
 * Build the FF&E schedule: one row per (room, def, variant), aggregated with a
 * quantity. Rows are ordered by the plan's room order (Unassigned last), then by
 * descending line value, then name — the way a schedule reads. Items whose def
 * is unresolvable are skipped.
 */
export function buildFfeSchedule(
  plan: FloorPlan,
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): FfeRow[] {
  // roomId ('' = unassigned) → key → row.
  const byRoom = new Map<string, Map<string, FfeRow>>()
  const roomName = new Map<string, string>()

  for (const it of items) {
    const def = defs[it.defId]
    if (!def) continue
    const variant = typeof it.props['variant'] === 'string' ? it.props['variant'] : undefined
    const room = plan.rooms.find((r) => pointInRoom(r, it.position[0], it.position[1]))
    const roomId = room?.id ?? ''
    if (room) roomName.set(roomId, room.name)
    const key = variant ? `${it.defId}::${variant}` : it.defId
    let rows = byRoom.get(roomId)
    if (!rows) {
      rows = new Map()
      byRoom.set(roomId, rows)
    }
    const existing = rows.get(key)
    if (existing) {
      existing.qty += 1
      existing.total = existing.qty * existing.unit
      continue
    }
    const dims = itemDims(it, def)
    const unit = itemPrice(def, def.category, variant)
    rows.set(key, {
      room: room?.name ?? 'Unassigned',
      category: def.category,
      name: variant ? `${def.name} (${variant})` : def.name,
      source: sourceOf(def),
      sku: skuOf(def),
      w: dims.w,
      d: dims.d,
      h: dims.h,
      qty: 1,
      unit,
      total: unit,
    })
  }

  // Plan room order, then unassigned; within a room by value desc then name.
  const order = new Map(plan.rooms.map((r, i) => [r.id, i]))
  const out: FfeRow[] = []
  const roomIds = [...byRoom.keys()].sort((a, b) => {
    if (a === '') return 1
    if (b === '') return -1
    return (order.get(a) ?? 0) - (order.get(b) ?? 0)
  })
  for (const rid of roomIds) {
    const rows = [...byRoom.get(rid)!.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name),
    )
    out.push(...rows)
  }
  return out
}
