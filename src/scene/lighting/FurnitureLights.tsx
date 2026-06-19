import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Object3D } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { type EmitterSpec, resolveEmitterSpec } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { resolveIesSpot } from '../../lighting/ies/iesStore'
import { useStore } from '../../state/store'
import { useQuality } from '../useQuality'
import { chooseEmitters } from './chooseEmitters'
import { setFixtureGlow } from './fixtureGlow'
import { useSunPosition } from './useSunPosition'

/** Below this darkness the room is daylit — render no fixture lights at all. */
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
  /** IES photometric spot params, when the fixture uses an IES profile (else a
   *  plain omni point light is rendered). */
  spot?: { angle: number; penumbra: number }
}

/**
 * Drives real point lights from light-emitting furniture (lamps, pendants).
 * Lights fade in as the sun sets and cast no shadows; daytime renders nothing
 * (zero cost). The live set is capped to the nearest emitters within the tier's
 * `maxFixtureLights` budget in BOTH view modes (`chooseEmitters`, PERF-002):
 * walk caps to N, orbit to a larger but still bounded `N * multiplier` — instead
 * of the old orbit path that lit every emitter (30–50 live lights in a furnished
 * night home). The nearest-N rank + camera-move/items/mode gate keep the pick
 * off the per-frame path.
 */
/** Radians per degree. */
const DEG = Math.PI / 180

export function FurnitureLights() {
  const items = useStore(useShallow((s) => s.items))
  const lightsMode = useStore((s) => s.lightsMode)
  const cameraMode = useStore((s) => s.cameraMode)
  const maxLights = useQuality().maxFixtureLights
  const iesEnabled = useFeature('iesLights')
  const sun = useSunPosition()
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

  // Auto: lights only turn on after sunset (altitude < 0). Ramp from 0 at horizon
  // to fully on at -6 degrees civil twilight. On/off modes override completely.
  const darkness = sun.altitude >= 0 ? 0 : Math.min(1, Math.max(0, -sun.altitude / (6 * DEG)))
  const level = lightsMode === 'on' ? 1 : lightsMode === 'off' ? 0 : darkness
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
    if (!itemsChanged && !modeChanged && movedSq < CAM_RECOMPUTE_SQ && lastKeyRef.current !== '')
      return
    lastCamRef.current.x = cx
    lastCamRef.current.z = cz
    lastItemsRef.current = items
    lastModeRef.current = cameraMode
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
    // Key includes the IES profile prop so re-picking a profile on the same set
    // of lit items still triggers a rebuild.
    const key = chosen.map((e) => `${e.item.id}:${e.item.props.iesProfile ?? ''}`).join(',')
    if (key === lastKeyRef.current) return // set unchanged → no re-render
    lastKeyRef.current = key
    setActive(
      chosen.map(({ item, spec }) => {
        // Per-item bulb colour (warm/neutral/cool) overrides the emitter default.
        const bulb = typeof item.props.lightColor === 'string' ? item.props.lightColor : spec.color
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
          spot: iesSpot ? { angle: iesSpot.angle, penumbra: iesSpot.penumbra } : undefined,
        }
      }),
    )
  })

  if (active.length === 0) return null
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
            intensity={l.baseIntensity * level}
            distance={l.distance}
            decay={2}
          />
        ),
      )}
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
        intensity={light.baseIntensity * level}
        distance={light.distance}
        angle={light.spot!.angle}
        penumbra={light.spot!.penumbra}
        decay={2}
      />
      <primitive object={target} />
    </>
  )
}
