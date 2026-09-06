/**
 * curtainFlush.ts — re-seat the default flat's hand-authored curtains onto their
 * windows (CURTAIN-FLUSH, flag `curtainFlush`).
 *
 * The four seeded curtain entries carry hand-typed positions that had drifted
 * 0.12–0.22 m off the wall CENTRE-line the live window snap plants a curtain on,
 * and then the primitive added the standoff on top — so the fabric hung 0.27 m
 * (living) / 0.33 m (bedrooms) off the wall face and the rod floated a hand-span
 * into the room. Nothing in the hand-written tables could catch that: the numbers
 * looked like "just inside the wall".
 *
 * Rather than re-typing four corrected numbers (which would drift again the next
 * time a wall moves), this pass DERIVES them, from the same
 * `snapToNearestWindow` + `windowFixtureProps` pair the live placement path and
 * the 2D plan editor use. It runs inside `defaultLayout()`, so it is evaluated at
 * boot/reset — after the feature flags resolve — and `?ff=curtainFlush:off`
 * renders the pre-fix tables untouched.
 *
 * Generic over the plan: it reads the walls/openings from `buildDefaultPlan()`
 * and the obstacle boxes from the layout's own items, so a moved window or a
 * relocated aircon flows through with no edit here.
 */

import { windowInteriorProjection } from '../../apartment/windowProjection'
import { isFeatureEnabled } from '../../features/featureFlags'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { BUILTIN_CATALOG } from '../builtinCatalog'
import {
  type CurtainObstacleBox,
  curtainRodHeight,
  curtainStandoff,
} from '../placement/curtainStandoff'
import { snapToNearestWindow } from '../placement/windowSnap'
import { defaultParamProps, type FurnitureDef, type FurnitureItem } from '../types'
import type { LayoutEntry } from './types'

/** Vertical extent (m above floor) of a wall-mounted item's rendered body, or
 *  null when it is not a mount that could foul a curtain.
 *
 *  The convention every mounted primitive in the catalog follows is that its
 *  group sits AT `mountHeight` with the body centred on it (`AirconUnit`,
 *  `WallSconce`, …), so the body runs `mountHeight ± h/2`. That is deliberately
 *  read instead of the def's `verticalSpan`: a span is a COLLISION envelope
 *  (the aircon's is 1.9–2.55 against a real 2.10–2.40 body) and clearing an
 *  envelope would shorten a curtain by a quarter of a metre it never needed. */
function mountedBodySpan(def: FurnitureDef, item: FurnitureItem): [number, number] | null {
  if (def.kind !== 'parametric' || !def.mounted) return null
  const props = { ...defaultParamProps(def), ...item.props }
  const mountHeight = props.mountHeight
  if (typeof mountHeight !== 'number') return null
  const h = def.defaultFootprint.h
  return [mountHeight - h / 2, mountHeight + h / 2]
}

/** An item's world-space XZ half-extents, honouring its own yaw. */
function worldHalfExtents(def: FurnitureDef, item: FurnitureItem): [number, number] {
  const w = typeof item.props.width === 'number' ? item.props.width : def.defaultFootprint.w
  const d = typeof item.props.depth === 'number' ? item.props.depth : def.defaultFootprint.d
  const c = Math.abs(Math.cos(item.rotation))
  const s = Math.abs(Math.sin(item.rotation))
  return [(w * c + d * s) / 2, (w * s + d * c) / 2]
}

/**
 * The obstacle boxes a curtain at `curtain` has to duck under, in the CURTAIN's
 * local frame (x along the wall from its centre, y above floor, z out of the
 * wall centre-line). Each candidate's world AABB is rotated into that frame and
 * re-bounded, so a curtain on any wall orientation works.
 */
export function curtainObstacles(
  curtain: FurnitureItem,
  items: readonly FurnitureItem[],
  catalog: Record<string, FurnitureDef> = BUILTIN_CATALOG,
): CurtainObstacleBox[] {
  const cos = Math.cos(curtain.rotation)
  const sin = Math.sin(curtain.rotation)
  const out: CurtainObstacleBox[] = []
  for (const item of items) {
    if (item.id === curtain.id) continue
    const def = catalog[item.defId]
    if (!def) continue
    const y = mountedBodySpan(def, item)
    if (!y) continue
    const [hx, hz] = worldHalfExtents(def, item)
    // World AABB corners → curtain-local, re-bounded (the inverse of three's
    // local→world map for a yaw: (lx·cos + lz·sin, −lx·sin + lz·cos)).
    const dx = item.position[0] - curtain.position[0]
    const dz = item.position[1] - curtain.position[1]
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wx = dx + sx * hx
        const wz = dz + sz * hz
        const lx = wx * cos - wz * sin
        const lz = wx * sin + wz * cos
        minX = Math.min(minX, lx)
        maxX = Math.max(maxX, lx)
        minZ = Math.min(minZ, lz)
        maxZ = Math.max(maxZ, lz)
      }
    }
    out.push({ x: [minX, maxX], y, z: [minZ, maxZ] })
  }
  return out
}

/**
 * Re-seat every `curtains` entry in a seeded layout onto its window: the host
 * wall's centre-line, the wall-normal facing the room, and the derived
 * `standoff` / obstacle-aware rod `height` from `windowFixtureProps`. The
 * authored `width`, `color`, `drawAmount` and every other prop are preserved —
 * only the geometry the snap owns is replaced.
 *
 * A no-op (returning the input array) when `curtainFlush` is off or the plan has
 * no window to snap to.
 */
export function applyCurtainFlush(items: LayoutEntry[]): LayoutEntry[] {
  if (!isFeatureEnabled('curtainFlush')) return items
  const plan = buildDefaultPlan()
  return items.map((item) => {
    if (item.defId !== 'curtains') return item
    // The authored position is the drop point: it is beside its own window and
    // on the room side of the wall, so the snap picks the same window + facing.
    const snap = snapToNearestWindow(plan.walls, plan.openings, item.position, plan)
    if (!snap) return item
    const standoff = curtainStandoff({
      wallThickness: snap.wallThickness,
      sillProjection: windowInteriorProjection(snap.wallThickness),
    })
    // The AUTHORED height is the preference (the tables pick 2.55 deliberately);
    // only an obstacle over the window may lower it. Same helper
    // `windowFixtureProps` runs for a user-placed curtain.
    const width = typeof item.props.width === 'number' ? item.props.width : 2.0
    const preferredHeight = typeof item.props.height === 'number' ? item.props.height : 2.55
    const height = curtainRodHeight({
      preferredHeight,
      width,
      standoff,
      obstacles: curtainObstacles({ ...item, position: snap.position }, items),
    })
    return {
      ...item,
      position: snap.position,
      rotation: snap.rotation,
      // Authored props win on everything the author chose (width, colour, the
      // shipped `drawAmount: 0`); the placement owns `standoff` + the rod height.
      props: { ...item.props, standoff, height },
    }
  })
}
