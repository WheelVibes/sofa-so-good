/**
 * Slot configurator — pure composition (SLOT-101).
 *
 * `composeProduct` clamps a selection, then assembles the base + every filled
 * slot option into a single part list (procedural boxes transformed into the
 * product frame), a list of GLB sub-asset pieces (SLOT-203), a unioned footprint,
 * the summed price, and the re-skin finish-target keys. Pure + render-agnostic
 * (no three.js) so it is exhaustively unit-testable; the object builder
 * (`buildObject.ts`) and the bake (`saveConfigured.ts`) consume its output.
 */

import type { FootprintPart } from '../types'
import {
  type ConfigurableProduct,
  type ConfiguredPart,
  type ConfiguredSpec,
  clampConfig,
  type SlotAnchor,
  selectedOption,
} from './model'

interface ComposedGltfPiece {
  url: string
  anchor: SlotAnchor
  /** Namespace for this piece's discovered finish targets (slot id / 'base'). */
  finishPrefix: string
  /** The option's declared footprint (metres) — the object builder fits the
   *  loaded GLB to this height (`fitScaleToFootprint`). */
  footprint: { w: number; d: number; h: number }
}

export interface ComposedModel {
  /** Procedural box parts in the product-local frame (each carries a finishKey). */
  parts: ConfiguredPart[]
  gltfPieces: ComposedGltfPiece[]
  bounds: { w: number; d: number; h: number }
  /**
   * Granular composite footprint — one OBB per contribution (base + each filled
   * slot), authored **relative to the `bounds` centre** so an L/U sectional
   * collides with its true concave shape instead of the full bounding box (the
   * `sofa-lshape` precedent, but composed). Threaded onto the baked product def
   * so `itemFootprintParts` reads it like any def's `footprintParts`.
   */
  footprintParts: FootprintPart[]
  /** base.price + Σ selected option.price. */
  price: number
  finishTargets: { key: string; label: string }[]
}

/** Quarter-turn detection: a yaw whose sine is near ±1 swaps the in-plane (w/d)
 *  extents. v1 anchors use 0 or π (no swap) and ±π/2 (swap). */
function swapsExtents(yaw: number): boolean {
  return Math.abs(Math.sin(yaw)) > 0.5
}

/**
 * Transform a part from an option's local frame into the product frame by a slot
 * anchor: rotate its centre about Y, swap w/d on a quarter-turn, then translate.
 * Pure; v1 restricts rotation to quarter-turns (no general matrix needed).
 */
export function transformPart(part: ConfiguredPart, anchor: SlotAnchor): ConfiguredPart {
  const yaw = anchor.rotationY ?? 0
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const [px, py, pz] = part.position
  const rx = px * c + pz * s
  const rz = -px * s + pz * c
  const [w, h, d] = part.size
  const size: [number, number, number] = swapsExtents(yaw) ? [d, h, w] : [w, h, d]
  const [ax, ay, az] = anchor.position
  return { ...part, position: [rx + ax, py + ay, rz + az], size }
}

interface Aabb {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  top: number
}

/** AABB contribution of a footprint placed (floor-anchored, centred) at an anchor. */
function footprintAabb(fp: { w: number; d: number; h: number }, anchor: SlotAnchor): Aabb {
  const yaw = anchor.rotationY ?? 0
  const w = swapsExtents(yaw) ? fp.d : fp.w
  const d = swapsExtents(yaw) ? fp.w : fp.d
  const [ax, ay, az] = anchor.position
  return { minX: ax - w / 2, maxX: ax + w / 2, minZ: az - d / 2, maxZ: az + d / 2, top: ay + fp.h }
}

/** Exact AABB of a transformed box part (position is the box CENTRE, +Z forward). */
function partAabb(p: ConfiguredPart): Aabb {
  const [x, y, z] = p.position
  const [w, h, d] = p.size
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h / 2 }
}

function mergeAabb(a: Aabb | null, b: Aabb): Aabb {
  if (!a) return { ...b }
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
    top: Math.max(a.top, b.top),
  }
}

/** Humanise a finish key ("base:frame" → "Base frame"). Shared with
 *  `gltfSlot.ts`'s per-slot GLB namespacing so both label the same way. */
export function finishLabel(key: string): string {
  const words = key.replace(/[:_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const IDENTITY: SlotAnchor = { position: [0, 0, 0] }

export function composeProduct(
  product: ConfigurableProduct,
  specIn: Partial<ConfiguredSpec> | null | undefined,
): ComposedModel {
  const spec = clampConfig(product, specIn)
  const parts: ConfiguredPart[] = []
  const gltfPieces: ComposedGltfPiece[] = []

  // Each contribution (base + each filled slot) tracks its OWN AABB — from its
  // actual box parts (exact) plus any GLB piece footprint — so the composite
  // `footprintParts` carves the concave notch of an L/U sectional rather than
  // reporting one over-wide bounding box.
  const contributions: Aabb[] = []

  // Base contribution: exact from parts when present, else the authored base
  // footprint; union any base GLB piece footprint.
  let baseAabb: Aabb | null = null
  if (product.base.parts?.length) {
    for (const p of product.base.parts) {
      const part = { ...p, finishKey: p.finishKey ?? `base:${p.role}` }
      parts.push(part)
      baseAabb = mergeAabb(baseAabb, partAabb(part))
    }
  } else {
    baseAabb = footprintAabb(product.base.footprint, IDENTITY)
  }
  if (product.base.gltfUrl) {
    gltfPieces.push({
      url: product.base.gltfUrl,
      anchor: IDENTITY,
      finishPrefix: 'base',
      footprint: product.base.footprint,
    })
    baseAabb = mergeAabb(baseAabb, footprintAabb(product.base.footprint, IDENTITY))
  }
  if (baseAabb) contributions.push(baseAabb)

  let price = product.base.price

  for (const slot of product.slots) {
    const opt = selectedOption(slot, spec)
    if (!opt) continue
    price += opt.price
    let slotAabb: Aabb | null = null
    if (opt.parts) {
      for (const p of opt.parts) {
        const tp = transformPart(p, slot.anchor)
        const part = { ...tp, finishKey: p.finishKey ?? `${slot.id}:${p.role}` }
        parts.push(part)
        slotAabb = mergeAabb(slotAabb, partAabb(part))
      }
    } else if (opt.gltfUrl) {
      gltfPieces.push({
        url: opt.gltfUrl,
        anchor: slot.anchor,
        finishPrefix: slot.id,
        footprint: opt.footprint,
      })
      slotAabb = footprintAabb(opt.footprint, slot.anchor)
    }
    if (slotAabb) contributions.push(slotAabb)
  }

  // Degenerate guard (no geometry at all): fall back to the base footprint.
  if (contributions.length === 0) {
    const f = product.base.footprint
    return {
      parts,
      gltfPieces,
      bounds: { w: f.w, d: f.d, h: f.h },
      footprintParts: [],
      price,
      finishTargets: [],
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let top = 0
  for (const c of contributions) {
    minX = Math.min(minX, c.minX)
    maxX = Math.max(maxX, c.maxX)
    minZ = Math.min(minZ, c.minZ)
    maxZ = Math.max(maxZ, c.maxZ)
    top = Math.max(top, c.top)
  }

  const bounds = {
    w: Math.max(0.05, maxX - minX),
    d: Math.max(0.05, maxZ - minZ),
    h: Math.max(0.05, top),
  }

  // Composite footprint parts, authored relative to the bounds CENTRE (= the
  // baked GLB's bbox centre, which `itemFootprintParts` uses as the parts origin).
  // A single-contribution product collapses to one part covering the whole bbox
  // (equivalent to the plain OBB), so it costs nothing there.
  const bcx = (minX + maxX) / 2
  const bcz = (minZ + maxZ) / 2
  const footprintParts: FootprintPart[] = contributions.map((c) => ({
    dx: (c.minX + c.maxX) / 2 - bcx,
    dz: (c.minZ + c.maxZ) / 2 - bcz,
    w: Math.max(0.05, c.maxX - c.minX),
    d: Math.max(0.05, c.maxZ - c.minZ),
  }))

  // Unique finish-target keys (procedural parts); GLB pieces' keys are discovered
  // + namespaced at bake (SLOT-203).
  const seen = new Set<string>()
  const finishTargets: { key: string; label: string }[] = []
  for (const p of parts) {
    const key = p.finishKey
    if (!key || seen.has(key)) continue
    seen.add(key)
    finishTargets.push({ key, label: finishLabel(key) })
  }

  return { parts, gltfPieces, bounds, footprintParts, price, finishTargets }
}
