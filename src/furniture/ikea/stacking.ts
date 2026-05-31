/**
 * Combine math for compatible IKEA models. resolveStack classifies HOW an
 * accepted item is placed relative to its base (vertical / around) and, for
 * vertical, where its BOTTOM rests — the support surface Y derived GEOMETRICALLY
 * from the base GLB's slat plane (cached by GltfModel; IKEA publishes no slat
 * height), with a per-category fallback. combineOnto turns that into ready-to-
 * place FurnitureItems sharing a groupId. Pure + render-free — see
 * stacking.test.ts.
 */

import { STACK } from '../../layout/designRules'
import { variantProps } from '../../ui/inspector/ikeaBodyProps'
import { getCachedSupportPlaneY } from '../GltfModel'
import type { FurnitureItem, IkeaGltfDef, IkeaVariant } from '../types'
import { placementKind } from './placementSemantics'

export interface StackFit {
  kind: 'vertical' | 'around'
  /** VERTICAL only: Y (metres) where the bottom of the stacked item rests. */
  supportY: number
  /** VERTICAL only: [dx, dz] base-local centre offset (centres on the support area). */
  centerOffset: [number, number]
  /** Delta rotation relative to the base (0 — the caller adds the base rotation). */
  rotation: number
}

/** XZ offset (base local frame) centring the top on the base's support area. */
function centerOffset(baseVariant: IkeaVariant): [number, number] {
  const ao = baseVariant.footprint?.anchorOffset ?? [0, 0, 0]
  return [ao[0], ao[2]]
}

export function resolveStack(
  baseDef: IkeaGltfDef,
  baseVariant: IkeaVariant,
  acceptedCategory: string,
): StackFit | null {
  if (!baseDef.compatibility?.acceptsCategories?.length) return null
  const kind = placementKind(acceptedCategory)
  if (kind === null || kind === 'modular') return null // unclassified/modular handled elsewhere

  if (kind === 'around') {
    return { kind: 'around', supportY: 0, centerOffset: [0, 0], rotation: 0 }
  }

  // vertical: rest the top's BOTTOM on the detected slat/support plane.
  const url = baseVariant.runtimeUrl ?? baseVariant.url ?? ''
  const plane = getCachedSupportPlaneY(url)
  const supportY = plane ?? STACK.bedSlatDefault
  return { kind: 'vertical', supportY, centerOffset: centerOffset(baseVariant), rotation: 0 }
}

export type CombineResult = { items: FurnitureItem[]; groupId: string } | { error: string }

function newStackId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `stack-${Math.random().toString(36).slice(2, 10)}`
}

/** Rotate a base-local [dx, dz] offset into world XZ by the base rotation. */
function toWorld(baseItem: FurnitureItem, dx: number, dz: number): [number, number] {
  const cos = Math.cos(baseItem.rotation)
  const sin = Math.sin(baseItem.rotation)
  return [baseItem.position[0] + dx * cos - dz * sin, baseItem.position[1] + dx * sin + dz * cos]
}

/** Place `topDef`/`topVariant` onto/around `baseItem` per the matched category.
 *  VERTICAL → one item resting on the support plane (props.surfaceHeight).
 *  AROUND  → one seat at the base's front edge, on the floor, facing it.
 *  Shared groupId (reused from the base or minted). The caller commits the items
 *  + the base's groupId in one history step. Fails soft (returns {error}) so a
 *  malformed def or unclassified rule can never wedge a drag or crash. */
export function combineOnto(
  baseItem: FurnitureItem,
  baseDef: IkeaGltfDef,
  topDef: IkeaGltfDef,
  topVariant: IkeaVariant,
  acceptedCategory: string,
): CombineResult {
  if (!topVariant) return { error: `Missing variant for ${topDef.name}.` }
  const groupId = baseItem.groupId ?? newStackId()

  // MODULAR sofa sections snap edge-to-edge on the floor (resolveStack returns
  // null for modular). Handled before the vertical/around path.
  if (placementKind(acceptedCategory) === 'modular' && baseDef.modular) {
    const edge = baseDef.modular.mates[0]?.edge ?? 'right'
    const baseHalfW = baseDef.defaultFootprint.w / 2
    const addHalfW = topDef.defaultFootprint.w / 2
    const baseHalfD = baseDef.defaultFootprint.d / 2
    const addHalfD = topDef.defaultFootprint.d / 2
    // left/right run along the base's local X; back along its local -Z.
    const dx = edge === 'back' ? 0 : (edge === 'left' ? -1 : 1) * (baseHalfW + addHalfW)
    const dz = edge === 'back' ? -(baseHalfD + addHalfD) : 0
    const [wx, wz] = toWorld(baseItem, dx, dz)
    const item: FurnitureItem = {
      id: newStackId(),
      defId: topDef.id,
      position: [wx, wz],
      rotation: baseItem.rotation, // sections align, same orientation
      groupId,
      props: { ...variantProps(topVariant.finish) }, // floor-standing
    }
    return { items: [item], groupId }
  }

  const fit = resolveStack(baseDef, baseDef.variants[0], acceptedCategory)
  if (!fit) return { error: `No combine rule for ${topDef.name} on ${baseDef.name}.` }

  if (fit.kind === 'vertical') {
    const [wx, wz] = toWorld(baseItem, fit.centerOffset[0], fit.centerOffset[1])
    const item: FurnitureItem = {
      id: newStackId(),
      defId: topDef.id,
      position: [wx, wz],
      rotation: baseItem.rotation + fit.rotation,
      groupId,
      props: { ...variantProps(topVariant.finish), surfaceHeight: fit.supportY },
    }
    return { items: [item], groupId }
  }

  // around: one seat at the base's front (local +Z) edge, on the floor, facing it.
  const baseFp = baseDef.defaultFootprint
  const longAlongX = baseFp.w >= baseFp.d
  const perp = (longAlongX ? baseFp.d : baseFp.w) / 2 + topDef.defaultFootprint.d / 2 + 0.05
  const [wx, wz] = toWorld(baseItem, 0, perp)
  const item: FurnitureItem = {
    id: newStackId(),
    defId: topDef.id,
    position: [wx, wz],
    rotation: baseItem.rotation + Math.PI, // face the base
    groupId,
    props: { ...variantProps(topVariant.finish) }, // no surfaceHeight → floor
  }
  return { items: [item], groupId }
}
