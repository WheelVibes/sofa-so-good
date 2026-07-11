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

/** Humanise a finish key ("base:frame" → "Base frame"). */
function finishLabel(key: string): string {
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

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let top = 0
  const include = (fp: { w: number; d: number; h: number }, anchor: SlotAnchor) => {
    const a = footprintAabb(fp, anchor)
    minX = Math.min(minX, a.minX)
    maxX = Math.max(maxX, a.maxX)
    minZ = Math.min(minZ, a.minZ)
    maxZ = Math.max(maxZ, a.maxZ)
    top = Math.max(top, a.top)
  }

  // Base at identity.
  include(product.base.footprint, IDENTITY)
  if (product.base.parts) {
    for (const p of product.base.parts) {
      parts.push({ ...p, finishKey: p.finishKey ?? `base:${p.role}` })
    }
  }
  if (product.base.gltfUrl) {
    gltfPieces.push({
      url: product.base.gltfUrl,
      anchor: IDENTITY,
      finishPrefix: 'base',
      footprint: product.base.footprint,
    })
  }

  let price = product.base.price

  for (const slot of product.slots) {
    const opt = selectedOption(slot, spec)
    if (!opt) continue
    price += opt.price
    include(opt.footprint, slot.anchor)
    if (opt.parts) {
      for (const p of opt.parts) {
        const tp = transformPart(p, slot.anchor)
        parts.push({ ...tp, finishKey: p.finishKey ?? `${slot.id}:${p.role}` })
      }
    } else if (opt.gltfUrl) {
      gltfPieces.push({
        url: opt.gltfUrl,
        anchor: slot.anchor,
        finishPrefix: slot.id,
        footprint: opt.footprint,
      })
    }
  }

  // Degenerate guard (no geometry at all): fall back to the base footprint.
  if (!Number.isFinite(minX)) {
    const f = product.base.footprint
    return {
      parts,
      gltfPieces,
      bounds: { w: f.w, d: f.d, h: f.h },
      price,
      finishTargets: [],
    }
  }

  const bounds = {
    w: Math.max(0.05, maxX - minX),
    d: Math.max(0.05, maxZ - minZ),
    h: Math.max(0.05, top),
  }

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

  return { parts, gltfPieces, bounds, price, finishTargets }
}
