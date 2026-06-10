import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type AmbientLight, type DirectionalLight, type HemisphereLight, Object3D } from 'three'
import { useStore } from '../../state/store'
import { registerAnimatedSource } from '../animatedSources'
import { grade, SOFT_SHADOW, toneExposureBias } from '../look'
import { TONE_MAPPING_THREE } from '../toneMappingThree'
import { useQuality } from '../useQuality'
import { lightingFromAltitude } from './altitudeCurve'
import { shadowFrustumForPlan } from './shadowFrustum'
import { type SunPosition, sunDirectionToScene } from './sunPosition'
import { useSunPosition } from './useSunPosition'

/** Distance from the plan centre where the directional light sits (m). */
const SUN_DISTANCE = 25
const TWEEN_DURATION = 0.6

interface Vals {
  sun: number
  ambient: number
  sunPos: [number, number, number]
  sunColor: [number, number, number]
  skyColor: [number, number, number]
  groundColor: [number, number, number]
}

// Clockwise around Y when viewed from above, matching compass bearings
// (N=0° → E=90° → S=180° → W=270°). Same convention as Sky.tsx.
function rotateY(pos: readonly [number, number, number], deg: number): [number, number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const [x, y, z] = pos
  return [x * c - z * s, y, x * s + z * c]
}

function targetVals(sun: SunPosition, orientation: number, center: [number, number, number]): Vals {
  const lighting = lightingFromAltitude(sun.altitude)
  const dir = sunDirectionToScene(sun)
  const scaled: [number, number, number] = [
    dir[0] * SUN_DISTANCE,
    dir[1] * SUN_DISTANCE,
    dir[2] * SUN_DISTANCE,
  ]
  const rotated = rotateY(scaled, orientation)
  return {
    sun: lighting.sun,
    ambient: lighting.ambient,
    // Offset the light so its shadow frustum is centred on the active plan.
    sunPos: [rotated[0] + center[0], rotated[1] + center[1], rotated[2] + center[2]],
    sunColor: lighting.sunColor,
    skyColor: lighting.skyColor,
    groundColor: lighting.groundColor,
  }
}

export function Lighting() {
  const sunPos = useSunPosition()
  const orientation = useStore((s) => s.orientationDeg)
  const shadowMapSize = useQuality().shadowMapSize
  const gl = useThree((s) => s.gl)
  const sunRef = useRef<DirectionalLight>(null!)
  const ambientRef = useRef<AmbientLight>(null!)
  const hemiRef = useRef<HemisphereLight>(null!)
  // The shadow frustum wraps the *active* floor plan (B34): a fixed
  // apartment-centred box misses shadows on a large or origin-offset custom plan.
  const floorPlan = useStore((s) => s.floorPlan)
  const { center, halfExtent } = useMemo(() => shadowFrustumForPlan(floorPlan), [floorPlan])
  // A persistent target so the directional light always points at the plan
  // centre regardless of where the sun sits; re-aim it when the centre moves.
  const sunTarget = useMemo(() => new Object3D(), [])
  useEffect(() => {
    sunTarget.position.set(center[0], center[1], center[2])
    sunTarget.updateMatrixWorld()
  }, [sunTarget, center])
  const initial = targetVals(sunPos, orientation, center)
  const current = useRef<Vals>({
    sun: initial.sun,
    ambient: initial.ambient,
    sunPos: [...initial.sunPos] as [number, number, number],
    sunColor: [...initial.sunColor] as [number, number, number],
    skyColor: [...initial.skyColor] as [number, number, number],
    groundColor: [...initial.groundColor] as [number, number, number],
  })

  // While the day/night tween is mid-transition it must keep rendering even in
  // demand mode (a time change is one discrete store event but the light + sky
  // ease over TWEEN_DURATION). Hold the render loop open until settled.
  const holdRef = useRef<(() => void) | null>(null)
  useEffect(() => () => holdRef.current?.(), [])

  useFrame((_, dt) => {
    const target = targetVals(sunPos, orientation, center)
    const cur = current.current
    const k = Math.min(1, dt / TWEEN_DURATION)

    const approach = (a: number, b: number) => a + (b - a) * k
    const dArr = (a: [number, number, number], b: [number, number, number]) => {
      a[0] = approach(a[0], b[0])
      a[1] = approach(a[1], b[1])
      a[2] = approach(a[2], b[2])
    }

    // Drive tone-mapping operator + exposure from the user's "look" and the sun
    // altitude every frame — cheap (three only recompiles when the operator
    // actually changes), and it must keep tracking after the light tween settles.
    const st = useStore.getState()
    const toneMode = st.toneMapping
    gl.toneMapping = TONE_MAPPING_THREE[toneMode]
    gl.toneMappingExposure =
      grade(sunPos.altitude).exposure * toneExposureBias(toneMode) * st.exposure

    // Cheap settle check on the dominant channels. When unsettled, ease the
    // current values toward the target; when settled we still fall through to
    // the assignment below so the lights are correct from the very first frame
    // (skipping it left the lights at their three.js defaults until some later
    // input change perturbed the target — the "time of day pops in late" bug).
    const settled =
      Math.abs(target.sun - cur.sun) < 1e-3 &&
      Math.abs(target.ambient - cur.ambient) < 1e-3 &&
      Math.abs(target.sunPos[1] - cur.sunPos[1]) < 1e-2 &&
      Math.abs(target.skyColor[2] - cur.skyColor[2]) < 1e-3

    // Hold/release the demand-mode render loop around the tween.
    if (!settled && !holdRef.current) holdRef.current = registerAnimatedSource()
    else if (settled && holdRef.current) {
      holdRef.current()
      holdRef.current = null
    }

    if (!settled) {
      cur.sun = approach(cur.sun, target.sun)
      cur.ambient = approach(cur.ambient, target.ambient)
      dArr(cur.sunPos, target.sunPos)
      dArr(cur.sunColor, target.sunColor)
      dArr(cur.skyColor, target.skyColor)
      dArr(cur.groundColor, target.groundColor)
    }

    if (sunRef.current) {
      sunRef.current.intensity = cur.sun
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2])
      sunRef.current.color.setRGB(cur.sunColor[0], cur.sunColor[1], cur.sunColor[2])
    }
    // Split the fill budget: a directional hemisphere (sky/ground) reads as
    // soft GI and gives objects form, while a small flat ambient lifts the
    // deepest interior shadows so nothing crushes to black.
    if (hemiRef.current) {
      hemiRef.current.intensity = cur.ambient * 1.1
      hemiRef.current.color.setRGB(cur.skyColor[0], cur.skyColor[1], cur.skyColor[2])
      hemiRef.current.groundColor.setRGB(cur.groundColor[0], cur.groundColor[1], cur.groundColor[2])
    }
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient * 0.35
  })

  return (
    <>
      <ambientLight ref={ambientRef} />
      <hemisphereLight ref={hemiRef} />
      <primitive object={sunTarget} />
      <directionalLight
        // Remount the light (rebuilding its shadow camera) when the map size or
        // the plan-fitted frustum extent changes, so the new ortho bounds + far
        // plane take effect cleanly.
        key={`${shadowMapSize}-${Math.round(halfExtent)}`}
        ref={sunRef}
        castShadow={shadowMapSize > 0}
        target={sunTarget}
        shadow-mapSize-width={shadowMapSize || 1024}
        shadow-mapSize-height={shadowMapSize || 1024}
        shadow-bias={SOFT_SHADOW.bias}
        shadow-normalBias={SOFT_SHADOW.normalBias}
        shadow-radius={SOFT_SHADOW.radius}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2 + halfExtent}
        shadow-camera-left={-halfExtent}
        shadow-camera-right={halfExtent}
        shadow-camera-top={halfExtent}
        shadow-camera-bottom={-halfExtent}
      />
    </>
  )
}
