import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Object3D } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { type EmitterSpec, resolveEmitterSpec } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { resolveIesSpot } from '../../lighting/ies/iesStore'
import { applyMoodPreset } from '../../lighting/moodPresets'
import { useStore } from '../../state/store'
import { useQuality } from '../useQuality'
import { chooseEmitters, fixtureLightBudget, lightSlotCount } from './chooseEmitters'
import { setFixtureGlow } from './fixtureGlow'

/** Below this level the fixtures are off — render no fixture lights at all. */
const MIN_DARKNESS = 0.04
/** Camera-move (squared metres) below which the nearest-lights ranking can't have
 *  meaningfully changed — skip the rebuild+sort entirely. */
const CAM_RECOMPUTE_SQ = 0.2 * 0.2

interface ActiveLight {
  id: string
  position: [number, number, number]
  color: string
  baseIntensity: number
  distance: number
  /** Lighting-mood brightness multiplier (`moodPresets.ts`), composed on top of
   *  the shared `lightsMode` level at render time — `1` when the feature is off
   *  or the mood is `'none'`. */
  moodMultiplier: number
  /** IES photometric spot params, when the fixture uses an IES profile (else a
   *  plain omni point light is rendered). */
  spot?: { angle: number; penumbra: number }
}

/**
 * Drives real point lights from light-emitting furniture (lamps, pendants).
 * Lights are all on or all off (`lightsMode`) and cast no shadows; while off,
 * nothing renders (zero cost). The live set is capped to the nearest emitters within the tier's
 * `maxFixtureLights` budget in BOTH view modes (`chooseEmitters`, PERF-002):
 * walk caps to N, orbit to a larger but still bounded `N * multiplier` — instead
 * of the old orbit path that lit every emitter (30–50 live lights in a furnished
 * night home). The nearest-N rank + camera-move/items/mode gate keep the pick
 * off the per-frame path.
 */
export function FurnitureLights() {
  const items = useStore(useShallow((s) => s.items))
  const lightsMode = useStore((s) => s.lightsMode)
  const cameraMode = useStore((s) => s.cameraMode)
  const maxLights = useQuality().maxFixtureLights
  const iesEnabled = useFeature('iesLights')
  // Lighting mood presets (UX round-3 #3): composed on top of `lightsMode`,
  // never in place of it — see `lighting/moodPresets.ts` composition doc.
  // Forced to 'none' when the feature is off, so a stale persisted mood from
  // before the flag was disabled has no visual effect.
  const moodEnabled = useFeature('lightMoodPresets')
  const lightMoodRaw = useStore((s) => s.lightMood)
  const lightMood = moodEnabled ? lightMoodRaw : 'none'
  const { camera } = useThree()
  const levelRef = useRef(0)
  const [active, setActive] = useState<ActiveLight[]>([])
  const lastKeyRef = useRef('')
  // Inputs that determine the nearest-emitter set — recompute only when one moves.
  const lastCamRef = useRef({ x: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY })
  const lastItemsRef = useRef(items)
  // The budget differs by mode, so a mode switch (orbit↔walk) must re-pick even if
  // the camera barely moved between the two poses.
  const lastModeRef = useRef(cameraMode)
  // A mood change re-tints/re-scales the SAME active set without moving the
  // camera or touching `items` — needs its own change check.
  const lastMoodRef = useRef(lightMood)

  // Binary all-on / all-off (the sun-following 'auto' mode was removed).
  const level = lightsMode === 'on' ? 1 : 0
  levelRef.current = level

  useFrame(() => {
    const dark = levelRef.current
    setFixtureGlow(dark)
    if (dark < MIN_DARKNESS) {
      if (active.length > 0) {
        setActive([])
        lastKeyRef.current = ''
      }
      return
    }
    // Gate the rebuild+sort on a real input change: a stationary camera at night
    // re-ran the full nearest-N scan every frame for no result change.
    const cx = camera.position.x
    const cz = camera.position.z
    const movedSq = (cx - lastCamRef.current.x) ** 2 + (cz - lastCamRef.current.z) ** 2
    const itemsChanged = lastItemsRef.current !== items
    const modeChanged = lastModeRef.current !== cameraMode
    const moodChanged = lastMoodRef.current !== lightMood
    if (
      !itemsChanged &&
      !modeChanged &&
      !moodChanged &&
      movedSq < CAM_RECOMPUTE_SQ &&
      lastKeyRef.current !== ''
    )
      return
    lastCamRef.current.x = cx
    lastCamRef.current.z = cz
    lastItemsRef.current = items
    lastModeRef.current = cameraMode
    lastMoodRef.current = lightMood
    const emitters: { item: FurnitureItem; spec: EmitterSpec; d2: number }[] = []
    for (const item of items) {
      const spec = resolveEmitterSpec(item.defId, item.props)
      if (!spec) continue
      const dx = item.position[0] - cx
      const dz = item.position[1] - cz
      emitters.push({ item, spec, d2: dx * dx + dz * dz })
    }
    emitters.sort((a, b) => a.d2 - b.d2)
    // Cap the live point/spot lights to the tier's `maxFixtureLights` budget in
    // BOTH modes (PERF-002): walk caps to nearest N; orbit gets a larger but still
    // bounded budget (whole home visible) instead of the old "render every emitter",
    // which reached 30–50 live lights in a furnished night home. The dropped lights
    // are the farthest from the camera; ambient/fill + emissive materials remain, so
    // the scene never goes dark.
    const chosen = chooseEmitters(emitters, cameraMode, maxLights)
    // Key includes the IES profile prop (re-picking a profile on the same set
    // of lit items still triggers a rebuild) and the mood (re-tints/re-scales
    // the same set without an items/mode/camera change).
    const key = chosen
      .map((e) => `${e.item.id}:${e.item.props.iesProfile ?? ''}:${lightMood}`)
      .join(',')
    if (key === lastKeyRef.current) return // set unchanged → no re-render
    lastKeyRef.current = key
    setActive(
      chosen.map(({ item, spec }) => {
        // Per-item bulb colour (warm/neutral/cool) overrides the emitter default.
        const rawBulb =
          typeof item.props.lightColor === 'string' ? item.props.lightColor : spec.color
        // Lighting mood preset (UX round-3 #3): tints the bulb colour + supplies
        // a brightness multiplier applied on top of the shared `lightsMode`
        // level at render time — composes with, never replaces, that level.
        const { color: bulb, intensityMultiplier: moodMultiplier } = applyMoodPreset(
          lightMood,
          item.defId,
          rawBulb,
        )
        // Local bulb offset (e.g. an arc lamp's reach) → world, via rotation.
        const [ox, oz] = spec.offset?.(item.props) ?? [0, 0]
        const r = item.rotation
        const wx = item.position[0] + ox * Math.cos(r) + oz * Math.sin(r)
        const wz = item.position[1] - ox * Math.sin(r) + oz * Math.cos(r)
        // Per-item intensity override (PARITY-FURNLIGHT) — a brightness slider.
        const baseIntensity =
          typeof item.props.lightIntensity === 'number' ? item.props.lightIntensity : spec.intensity
        // IES photometric profile (PC-IES-LIGHT): if the item references one (and
        // the feature is on) drive a directional SpotLight with the profile's
        // cone/penumbra; otherwise a plain omni point light. Parsed+cached once.
        const iesId =
          iesEnabled && typeof item.props.iesProfile === 'string' ? item.props.iesProfile : ''
        const iesSpot = iesId ? resolveIesSpot(iesId, baseIntensity) : null
        return {
          id: item.id,
          position: [wx, spec.height(item.props), wz],
          color: bulb,
          baseIntensity: iesSpot ? iesSpot.intensity : baseIntensity,
          distance: spec.distance,
          moodMultiplier,
          spot: iesSpot ? { angle: iesSpot.angle, penumbra: iesSpot.penumbra } : undefined,
        }
      }),
    )
  })

  if (active.length === 0) return null
  // LIGHT-COUNT-STABLE: render a QUANTISED number of slots and pad the spares
  // with zero-intensity point lights. three bakes the light count into every lit
  // material's program cache key, so a ±1 change in the live set — routine while
  // orbiting, since the set is re-picked on camera movement — recompiles every
  // lit material. Measured, that cost 204-214ms on the first gesture frame with
  // +29 programs, all differing in one cache-key field (18 -> 19). A padded light
  // is counted by three regardless of intensity, so the count holds steady.
  const slots = lightSlotCount(active.length, fixtureLightBudget(cameraMode, maxLights))
  const padding = Math.max(0, slots - active.length)
  return (
    <>
      {active.map((l) =>
        l.spot ? (
          <IesSpotLight key={l.id} light={l} level={level} />
        ) : (
          <pointLight
            key={l.id}
            position={l.position}
            color={l.color}
            intensity={l.baseIntensity * level * l.moodMultiplier}
            distance={l.distance}
            decay={2}
          />
        ),
      )}
      {padding > 0 &&
        Array.from({ length: padding }, (_, i) => (
          // Intensity 0 contributes nothing to the image; it exists purely to
          // hold the light COUNT steady. Positioned at the origin with a tiny
          // distance so it can never influence anything even if the intensity
          // were somehow non-zero.
          <pointLight
            key={`slot-pad-${i}`}
            position={[0, -1000, 0]}
            intensity={0}
            distance={0.001}
            decay={2}
          />
        ))}
    </>
  )
}

/**
 * A photometric (IES) fixture rendered as a downward-pointing Three `SpotLight`.
 * The target sits directly below the bulb on the floor so the cone shines down;
 * `angle`/`penumbra` come from the parsed IES profile's field/beam geometry.
 */
function IesSpotLight({ light, level }: { light: ActiveLight; level: number }) {
  const [x, y, z] = light.position
  // A stable target object placed on the floor directly under the bulb → the cone
  // shines straight down. Created once and re-positioned when the bulb moves.
  const target = useMemo(() => new Object3D(), [])
  target.position.set(x, Math.max(0, y - 3), z)
  return (
    <>
      <spotLight
        position={light.position}
        target={target}
        color={light.color}
        intensity={light.baseIntensity * level * light.moodMultiplier}
        distance={light.distance}
        angle={light.spot!.angle}
        penumbra={light.spot!.penumbra}
        decay={2}
      />
      <primitive object={target} />
    </>
  )
}
