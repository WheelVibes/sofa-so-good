/**
 * Which light-emitting fixtures get a real point/spot light, and with what.
 *
 * **On means ALL of them are on.** `lightsMode` is a single switch for the whole
 * home, so every fixture that passes its own per-item gate
 * (`isItemEmitter` — the walk-mode "flip this one switch" override, a vanity's
 * bulb condition, …) is lit whenever the switch is on. Nothing here looks at the
 * camera.
 *
 * It used to: the live set was ranked by squared distance to the camera and
 * capped to the tier's `maxFixtureLights` (2 on the default Performance tier, ×3
 * in orbit). In a 19-emitter home that meant walking through it switched lamps on
 * and off around you as the nearest-N set churned — the cap was invisible as a
 * budget and very visible as flickering. A fixture's own switch is now the only
 * thing that decides whether it is lit.
 *
 * Pure (no three/React) so the selection + placement maths is unit-testable.
 */
import { type EmitterSpec, isItemEmitter, resolveEmitterSpec } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { resolveIesSpot } from '../../lighting/ies/iesStore'
import { applyMoodPreset, type LightMood } from '../../lighting/moodPresets'

/**
 * Absolute ceiling on simultaneous real lights — a GPU guard, NOT a quality
 * budget. Every point light costs fragment-shader uniforms, and enough of them
 * overflow the driver's limit (`MAX_FRAGMENT_UNIFORM_VECTORS`, as low as ~224 on
 * mobile) and fail shader compilation outright — a black scene, not a slow one.
 * A home reaching this many fixtures is far past anything the default flat (19)
 * or a hand-furnished one produces, and the excess is dropped in stable ITEM
 * order, never by distance, so it can never present as lights switching around a
 * moving camera.
 */
export const MAX_LIVE_FIXTURE_LIGHTS = 64

/** One live light, resolved and ready to render. */
export interface FixtureLight {
  /** Source item id — also the React key. */
  id: string
  /** Source def, so equivalent fixtures can be recognised as the same KIND of
   *  light (see `aggregateFixtureLights`). */
  defId: string
  position: [number, number, number]
  color: string
  baseIntensity: number
  distance: number
  /** Lighting-mood brightness multiplier (`moodPresets.ts`), composed on top of
   *  the shared `lightsMode` level at render time — `1` when the mood is
   *  `'none'` or the feature is off. */
  moodMultiplier: number
  /** IES photometric spot params, when the fixture uses an IES profile (else a
   *  plain omni point light is rendered). */
  spot?: { angle: number; penumbra: number }
}

/** World position of a fixture's bulb: the item's own position plus the spec's
 *  local bulb offset (e.g. an arc lamp's reach), rotated into world space. */
function bulbPosition(item: FurnitureItem, spec: EmitterSpec): [number, number, number] {
  const [ox, oz] = spec.offset?.(item.props) ?? [0, 0]
  const r = item.rotation
  return [
    item.position[0] + ox * Math.cos(r) + oz * Math.sin(r),
    spec.height(item.props),
    item.position[1] - ox * Math.sin(r) + oz * Math.cos(r),
  ]
}

/**
 * Every fixture that should be lit right now, in stable item order.
 *
 * `items` order is the only ordering — deliberately, so the set only changes
 * when the design changes. An item switched off with `props.lightOn === 'no'` is
 * excluded here (per-item switch wins over everything, including `lightsMode`);
 * the scene-wide on/off then scales what's left at render time.
 */
export function fixtureLightsFor(
  items: readonly FurnitureItem[],
  opts: { lightMood: LightMood; iesEnabled: boolean },
): FixtureLight[] {
  const out: FixtureLight[] = []
  for (const item of items) {
    if (out.length >= MAX_LIVE_FIXTURE_LIGHTS) break
    // `resolveEmitterSpec` already folds in the per-item gate; the explicit
    // `isItemEmitter` check documents that this is where a switched-off fixture
    // leaves the set (and covers the override-emitter path identically).
    const spec = resolveEmitterSpec(item.defId, item.props)
    if (!spec || !isItemEmitter(item.defId, item.props)) continue

    // Per-item bulb colour (warm/neutral/cool) overrides the emitter default.
    const rawBulb = typeof item.props.lightColor === 'string' ? item.props.lightColor : spec.color
    // Lighting mood preset: tints the bulb + supplies a brightness multiplier
    // applied on top of the shared `lightsMode` level — composes with, never
    // replaces, that level.
    const { color, intensityMultiplier: moodMultiplier } = applyMoodPreset(
      opts.lightMood,
      item.defId,
      rawBulb,
    )
    // Per-item intensity override (PARITY-FURNLIGHT) — a brightness slider.
    const baseIntensity =
      typeof item.props.lightIntensity === 'number' ? item.props.lightIntensity : spec.intensity
    // IES photometric profile (PC-IES-LIGHT): drive a directional SpotLight with
    // the profile's cone/penumbra; otherwise a plain omni point light.
    const iesId =
      opts.iesEnabled && typeof item.props.iesProfile === 'string' ? item.props.iesProfile : ''
    const iesSpot = iesId ? resolveIesSpot(iesId, baseIntensity) : null

    out.push({
      id: item.id,
      defId: item.defId,
      position: bulbPosition(item, spec),
      color,
      baseIntensity: iesSpot ? iesSpot.intensity : baseIntensity,
      distance: spec.distance,
      moodMultiplier,
      spot: iesSpot ? { angle: iesSpot.angle, penumbra: iesSpot.penumbra } : undefined,
    })
  }
  return out
}

/**
 * Merge fixtures that are close enough together to read as ONE light.
 *
 * Three unrolls its point-light loop and runs a full GGX BRDF per light per
 * fragment (`RE_Direct_Physical`, no early-out on an attenuated-to-zero light),
 * so N lights cost N× the lighting maths on every lit fragment on screen. The
 * cheapest honest way to cut N is to notice when several fixtures are
 * effectively one source: a false-ceiling downlight grid is six identical bulbs
 * 0.8 m apart, and at any normal viewing distance one light of the summed
 * intensity at their centroid is indistinguishable.
 *
 * Deliberately conservative — this must never become "the lighting design got
 * rearranged for performance":
 *  - same `defId` (same kind of fixture, same throw) AND same bulb colour,
 *  - within {@link MERGE_RADIUS_M} in 3D — 1.0 m, chosen to sit BELOW the
 *    tightest spacing in the shipped flat (a 1.2 m sconce pair, which must stay
 *    two pools of light on the wall) and above a typical 0.6–0.8 m downlight
 *    pitch, which is the case worth merging,
 *  - never an IES spot (a photometric cone is not summable),
 *  - clustered HEAD-ANCHORED (a light joins a cluster only if it is within the
 *    radius of that cluster's FIRST member) and in stable item order, so the
 *    result depends only on the design and a long row can't chain-collapse into
 *    one light at its centre.
 *
 * On the default flat this merges nothing (its 19 fixtures are all >1.2 m apart
 * or of different kinds) — it exists for the authored designs where it pays,
 * and it is applied only on the tiers that need the headroom.
 */
export const MERGE_RADIUS_M = 1.0

export function aggregateFixtureLights(lights: readonly FixtureLight[]): FixtureLight[] {
  if (lights.length < 2) return lights as FixtureLight[]
  const clusters: FixtureLight[][] = []
  for (const l of lights) {
    // An IES fixture keeps its own light: its cone comes from a measured
    // photometric profile, which has no meaningful sum with a neighbour's.
    if (l.spot) {
      clusters.push([l])
      continue
    }
    const target = clusters.find((c) => {
      const head = c[0]
      if (head.spot || head.defId !== l.defId || head.color !== l.color) return false
      return dist3(head.position, l.position) <= MERGE_RADIUS_M
    })
    if (target) target.push(l)
    else clusters.push([l])
  }
  if (clusters.every((c) => c.length === 1)) return lights as FixtureLight[]
  return clusters.map((c) => (c.length === 1 ? c[0] : mergeCluster(c)))
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** One light standing in for a cluster: the summed emission at the
 *  emission-weighted centroid. The mood multiplier is folded into the summed
 *  intensity (the members may have different per-def mood scaling), so the
 *  aggregate carries a neutral multiplier and the renderer's
 *  `baseIntensity × level × moodMultiplier` still lands on the same total. */
function mergeCluster(cluster: readonly FixtureLight[]): FixtureLight {
  let total = 0
  let x = 0
  let y = 0
  let z = 0
  let distance = 0
  for (const l of cluster) {
    const w = l.baseIntensity * l.moodMultiplier
    total += w
    x += l.position[0] * w
    y += l.position[1] * w
    z += l.position[2] * w
    distance = Math.max(distance, l.distance)
  }
  // All-zero emission (every member dimmed to nothing by its mood): fall back
  // to the geometric centre so the light still has a defined position.
  const n = cluster.length
  const pos: [number, number, number] =
    total > 0
      ? [x / total, y / total, z / total]
      : [
          cluster.reduce((a, l) => a + l.position[0], 0) / n,
          cluster.reduce((a, l) => a + l.position[1], 0) / n,
          cluster.reduce((a, l) => a + l.position[2], 0) / n,
        ]
  return {
    // Keyed off the first member so React sees a stable light across frames.
    id: `merged:${cluster[0].id}`,
    defId: cluster[0].defId,
    position: pos,
    color: cluster[0].color,
    baseIntensity: total,
    distance,
    moodMultiplier: 1,
  }
}
