import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isItemEmitter, LIGHT_EMITTERS } from '../../furniture/lightEmitters'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { useQuality } from '../useQuality'
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
}

/**
 * Drives real point lights from light-emitting furniture (lamps, pendants).
 * Lights fade in as the sun sets, are capped to the nearest MAX_LIGHTS to the
 * camera, and cast no shadows. Daytime renders nothing (zero cost).
 */
/** Radians per degree. */
const DEG = Math.PI / 180

export function FurnitureLights() {
  const items = useStore(useShallow((s) => s.items))
  const lightsMode = useStore((s) => s.lightsMode)
  const cameraMode = useStore((s) => s.cameraMode)
  const maxLights = useQuality().maxFixtureLights
  const sun = useSunPosition()
  const { camera } = useThree()
  const levelRef = useRef(0)
  const [active, setActive] = useState<ActiveLight[]>([])
  const lastKeyRef = useRef('')
  // Inputs that determine the nearest-emitter set — recompute only when one moves.
  const lastCamRef = useRef({ x: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY })
  const lastItemsRef = useRef(items)

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
    if (!itemsChanged && movedSq < CAM_RECOMPUTE_SQ && lastKeyRef.current !== '') return
    lastCamRef.current.x = cx
    lastCamRef.current.z = cz
    lastItemsRef.current = items
    const emitters: { item: FurnitureItem; d2: number }[] = []
    for (const item of items) {
      if (!isItemEmitter(item.defId, item.props)) continue
      const dx = item.position[0] - cx
      const dz = item.position[1] - cz
      emitters.push({ item, d2: dx * dx + dz * dz })
    }
    emitters.sort((a, b) => a.d2 - b.d2)
    // In orbit mode show all lights (full apartment visible); in walk mode cap
    // to nearest N for GPU budget.
    const chosen = cameraMode === 'orbit' ? emitters : emitters.slice(0, maxLights)
    const key = chosen.map((e) => e.item.id).join(',')
    if (key === lastKeyRef.current) return // set unchanged → no re-render
    lastKeyRef.current = key
    setActive(
      chosen.map(({ item }) => {
        const spec = LIGHT_EMITTERS[item.defId]!
        // Per-item bulb colour (warm/neutral/cool) overrides the emitter default.
        const bulb = typeof item.props.lightColor === 'string' ? item.props.lightColor : spec.color
        // Local bulb offset (e.g. an arc lamp's reach) → world, via rotation.
        const [ox, oz] = spec.offset?.(item.props) ?? [0, 0]
        const r = item.rotation
        const wx = item.position[0] + ox * Math.cos(r) + oz * Math.sin(r)
        const wz = item.position[1] - ox * Math.sin(r) + oz * Math.cos(r)
        return {
          id: item.id,
          position: [wx, spec.height(item.props), wz],
          color: bulb,
          baseIntensity: spec.intensity,
          distance: spec.distance,
        }
      }),
    )
  })

  if (active.length === 0) return null
  return (
    <>
      {active.map((l) => (
        <pointLight
          key={l.id}
          position={l.position}
          color={l.color}
          intensity={l.baseIntensity * level}
          distance={l.distance}
          decay={2}
        />
      ))}
    </>
  )
}
