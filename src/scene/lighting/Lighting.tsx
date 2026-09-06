import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  type AmbientLight,
  type DirectionalLight,
  type HemisphereLight,
  LinearToneMapping,
  Object3D,
} from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'

import { registerAnimatedSource } from '../animatedSources'
import { isLinearView } from '../linearView'
import {
  grade,
  iblFillScale,
  photographicFillScale,
  photographicGroundBounce,
  shadowFilterForTier,
  shadowParamsForFilter,
  toneExposureBias,
  warmthTintRGB,
  windowFillAttenuation,
} from '../look'
import {
  ORBIT_STUDIO,
  orbitStudioActive,
  orbitStudioFillScale,
  orbitStudioKeyIntensity,
  STUDIO_KEY_SHADOW_TAG,
  studioKeyPosition,
  studioShadowRange,
} from '../orbitStudioLook'
import { setPhotographicLook } from '../photographicSignal'
import { isShadowRefreshActive } from '../shadowRefreshSignal'
import { resolveToneMapping, toneContextFromState } from '../toneContext'
import { TONE_MAPPING_THREE } from '../toneMappingThree'
import { useQuality } from '../useQuality'
import { lightingFromAltitude } from './altitudeCurve'
import { shadowFrustumForPlan, shadowMapSizeForExtent } from './shadowFrustum'
import { updateStatusBarTint } from './statusBarTint'
import { type SunPosition, sunDirectionToScene } from './sunPosition'
import { useSunPosition } from './useSunPosition'
import { getWindowAttenuation, getWindowGlassTint } from './windowLightSignal'

/** Distance from the plan centre where the directional light sits (m). */
const SUN_DISTANCE = 25
const TWEEN_DURATION = 0.6

/** Shared identity tint (no glass colouring) — the default every frame the
 *  `windowGlassTint` feature is off. Hoisted so the per-frame `useFrame` fallback
 *  reuses one frozen array instead of allocating `[1, 1, 1]` each frame (PERF-MAX-4). */
const NEUTRAL_TINT = [1, 1, 1] as const

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

/**
 * @param allowOrbitStudio ORBIT-STUDIO-LOOK: only the main `Scene` passes this.
 * The room editor is a SECOND canvas over the SAME store, and its `cameraMode` is
 * still `'orbit'`, so the mode alone cannot tell the two apart — the editor is a
 * single isolated room lit for finish judgement, not a dollhouse. Structural, so
 * "the editor never gets the key" is a fact about the call sites.
 */
export function Lighting({ allowOrbitStudio = false }: { allowOrbitStudio?: boolean } = {}) {
  const sunPos = useSunPosition()
  const orientation = useStore((s) => s.orientationDeg)
  const tierShadowMax = useQuality().shadowMapSize
  // PHOTO-SOFTSHADOW: Medium+ tiers run VSM (real blurred penumbrae via
  // radius/blurSamples); the renderer-level filter switch lives in
  // ShadowFilterController — here we only feed the matching per-light params.
  const qualityTier = useStore((s) => s.qualityTier)
  const deviceClass = useStore((s) => s.deviceClass)
  // PHOTO-FILL: the flag ships the control; this is the user's setting.
  const photoFlag = useFeature('photographicFill')
  const photographicLook = useStore((s) => s.photographicLook) && photoFlag
  // Publish for the material factories, which live outside React.
  useEffect(() => setPhotographicLook(photographicLook), [photographicLook])
  const shadowFilter = shadowFilterForTier(qualityTier, deviceClass)
  const shadowParams = shadowParamsForFilter(shadowFilter)
  // IBL is on for Medium+ tiers; when it is, the procedural environment provides
  // ambient bounce, so the analytical hemisphere+ambient fill is dialled down to
  // avoid double-counting (LIGHT-IBL-OVERLAP — midday washout otherwise).
  const iblActive = useQuality().ibl
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const sunRef = useRef<DirectionalLight>(null!)
  const ambientRef = useRef<AmbientLight>(null!)
  const hemiRef = useRef<HemisphereLight>(null!)
  // The shadow frustum wraps the *active* floor plan (B34): a fixed
  // apartment-centred box misses shadows on a large or origin-offset custom plan.
  const floorPlan = useStore((s) => s.floorPlan)
  const { center, halfExtent } = useMemo(() => shadowFrustumForPlan(floorPlan), [floorPlan])
  // SHADOW-TEXEL: size the map for a constant world-space texel density over the
  // plan-fitted frustum rather than taking the tier's number literally. The tier
  // value is the CEILING. See `shadowMapSizeForExtent` for the walk-mode
  // measurements behind the target density.
  const shadowMapSize = shadowMapSizeForExtent(halfExtent, tierShadowMax)
  // ORBIT-STUDIO-LOOK: one extra soft overhead key, orbit only. Gated on the
  // resolved shadow SETTING rather than a tier name (the tier-vocabulary rule),
  // because what it costs is a second shadow pass.
  const cameraMode = useStore((s) => s.cameraMode)
  const studioFlag = useFeature('orbitStudioLook')
  const studioSeam = studioDevSeam()
  const studioOn = orbitStudioActive({
    allow: allowOrbitStudio,
    cameraMode,
    flagOn: studioFlag,
    shadowMapSize,
  })
  const studioMapSize = shadowMapSizeForExtent(
    halfExtent,
    Math.min(tierShadowMax, ORBIT_STUDIO.mapSizeCap),
  )
  const studioPos = useMemo(() => studioKeyPosition(center), [center])
  const studioRange = useMemo(
    () => studioShadowRange(center, halfExtent, floorPlan.ceilingHeight ?? 2.6),
    [center, halfExtent, floorPlan.ceilingHeight],
  )
  const studioRef = useRef<DirectionalLight | null>(null)
  // Tag the key's shadow camera so `CeilingOccluder` can stand down for THIS
  // light and only this one (OCCLUDER-OPT-OUT). A CALLBACK ref, not an effect:
  // the light remounts whenever its `key` changes (map size / frustum extent /
  // filter), which builds a FRESH shadow camera, and a `[]`-deps effect would
  // never re-tag it.
  const attachStudio = useCallback((l: DirectionalLight | null) => {
    studioRef.current = l
    if (l) l.shadow.camera.userData[STUDIO_KEY_SHADOW_TAG] = true
  }, [])
  // A persistent target so the directional light always points at the plan
  // centre regardless of where the sun sits; re-aim it when the centre moves.
  const sunTarget = useMemo(() => new Object3D(), [])
  useEffect(() => {
    sunTarget.position.set(center[0], center[1], center[2])
    sunTarget.updateMatrixWorld()
  }, [sunTarget, center])
  // The tween target only changes with the sun/orientation/plan-centre — recompute
  // it then, not every frame (the useFrame loop ran `targetVals` per frame even
  // when fully settled, allocating an object + several arrays each time).
  const target = useMemo(
    () => targetVals(sunPos, orientation, center),
    [sunPos, orientation, center],
  )
  const current = useRef<Vals>({
    sun: target.sun,
    ambient: target.ambient,
    sunPos: [...target.sunPos] as [number, number, number],
    sunColor: [...target.sunColor] as [number, number, number],
    skyColor: [...target.skyColor] as [number, number, number],
    groundColor: [...target.groundColor] as [number, number, number],
  })

  // While the day/night tween is mid-transition it must keep rendering even in
  // demand mode (a time change is one discrete store event but the light + sky
  // ease over TWEEN_DURATION). Hold the render loop open until settled.
  const holdRef = useRef<(() => void) | null>(null)
  useEffect(() => () => holdRef.current?.(), [])

  // PERF-MAX-1: tracks the sun light's shadow instance so a freshly (re)mounted
  // light (map-size / frustum-extent change → new `key`) always builds its map
  // once, independent of signal timing.
  const lastShadow = useRef<unknown>(null)
  /** Same, for the orbit studio key's own shadow instance. */
  const lastStudioShadow = useRef<unknown>(null)

  useFrame((_, dt) => {
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
    // Context-aware default (RD-404): an explicit user pick wins; `'auto'`
    // resolves to Neutral while the FinishPicker is open (accurate product
    // colour), else the historical filmic look. The exposure bias tracks the
    // *resolved* operator so brightness stays steady across a context switch.
    const toneMode = resolveToneMapping(st.toneMapping, toneContextFromState(st))
    // `(z12)`: a DEV-only linear passthrough for MEASUREMENT. Exposure below is untouched, which
    // is the point of `LinearToneMapping` over `NoToneMapping` — see `isLinearView`.
    gl.toneMapping = isLinearView() ? LinearToneMapping : TONE_MAPPING_THREE[toneMode]
    // Orbit + the room editor run the full graded exterior-sun simulation, same
    // as walk mode (ORBIT-CEILING); the invisible ceiling occluder blocks the sun
    // from pouring in through the open top, so it's lit through windows/openings.
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
      // The status-bar tint below samples the *previously* rendered frame (this
      // callback runs before r3f draws). On the settle edge that's still the
      // mid-tween frame, so request one more frame: its sample reads the now
      // final-rendered frame and lands the chrome on the exact settled colour.
      invalidate()
    }

    if (!settled) {
      cur.sun = approach(cur.sun, target.sun)
      cur.ambient = approach(cur.ambient, target.ambient)
      dArr(cur.sunPos, target.sunPos)
      dArr(cur.sunColor, target.sunColor)
      dArr(cur.skyColor, target.skyColor)
      dArr(cur.groundColor, target.groundColor)
    }

    // COLOR-GRADE: user white-balance bias tints the analytical lights on every
    // tier (sun + hemisphere + ambient). Neutral (1,1,1) at the default 0, so
    // the graded look is byte-identical until the user moves the dial. Scalar
    // mults only — no per-frame allocation beyond the returned tuple.
    const wb = warmthTintRGB(st.sceneWarmth)

    if (sunRef.current) {
      // --- C275: window-glass tint + curtain attenuation ---
      // All tier levels: colour modulation is free (scalar mults only).
      // No per-frame allocation: reads from module-level signals written on store change.
      const tint = isFeatureEnabled('windowGlassTint') ? getWindowGlassTint() : NEUTRAL_TINT

      // KEY-FILL-BALANCE: the sun keeps its FULL graded intensity. Curtains dim
      // the diffuse skylight coming through the window (the fill, below), not
      // the sun itself — see `windowFillAttenuation` for why dimming the only
      // shadow-casting light here flattened every tier.
      sunRef.current.intensity = cur.sun
      sunRef.current.castShadow = shadowMapSize > 0
      sunRef.current.position.set(cur.sunPos[0], cur.sunPos[1], cur.sunPos[2])
      // PERF-MAX-1: hold the shadow map frozen unless it actually needs to change.
      // The directional shadow frustum is centred on the plan (not the camera), so
      // a pure camera orbit / turntable auto-rotate / walk produces an identical
      // depth map every continuous frame — re-rendering the up-to-4096² map each
      // frame is pure waste (sun shadows are the profiler's #2 cost). We turn the
      // light's per-frame `shadow.autoUpdate` off and only re-render (`needsUpdate`)
      // when the map can actually change:
      //   - `!settled`         → the sun is easing (day/night tween moves the frustum),
      //   - shadow-refresh tail → set either by a discrete store change (furniture
      //                           move/add/remove, plan edit, orientation, door toggle,
      //                           finish, quality-tier remount — via RenderPump) OR by a
      //                           continuously-animating shadow caster pulsing it every
      //                           frame it moves (spinning fans, easing curtains/blinds).
      //                           See shadowRefreshSignal. NOTE: this deliberately does
      //                           NOT key off `animatedSourceCount()` — that also counts
      //                           wall-reveal fades, which change only opacity (three's
      //                           shadow map ignores opacity), and fire on every orbit
      //                           frame, which would defeat the freeze during orbit.
      //   - `!sceneReady`      → boot/warmup, geometry may still be streaming in,
      //   - new shadow instance → the light just (re)mounted, build its fresh map.
      // Camera-only motion sets none of these, so the frozen (correct) map is reused.
      // three resets `needsUpdate` to false after it renders the map.
      const shadow = sunRef.current.shadow
      shadow.autoUpdate = false
      const freshInstance = shadow !== lastShadow.current
      lastShadow.current = shadow
      if (!settled || freshInstance || !st.sceneReady || isShadowRefreshActive(performance.now())) {
        shadow.needsUpdate = true
      }
      // Apply glass tint + the user white-balance bias as component-wise
      // multiplies of the sun colour.
      sunRef.current.color.setRGB(
        cur.sunColor[0] * tint[0] * wb[0],
        cur.sunColor[1] * tint[1] * wb[1],
        cur.sunColor[2] * tint[2] * wb[2],
      )
    }
    // ORBIT-STUDIO-LOOK: the key's own map gets PERF-MAX-1's freeze too. Its
    // frustum is plan-centred and its direction is a CONSTANT, so unlike the sun
    // it does not even move with the clock — the only reasons its map can change
    // are a fresh instance, boot/warm-up, and the shared shadow-refresh signal
    // (furniture moved, plan edited, a fan turning).
    if (studioRef.current) {
      // The key is a DAYLIGHT stand-in, so it rides the same eased 0→1 day level
      // the sun does. A constant-intensity key measured 20:00 mean 106.9 → 123.6
      // and p05 19 → 49 — a night dollhouse lit by a midday softbox. Ramped, the
      // night frame is left to the fixtures, which is what ORBIT-NIGHT-CAPS tuned.
      studioRef.current.intensity = orbitStudioKeyIntensity(cur.sun, studioSeam.key)
      const ks = studioRef.current.shadow
      ks.autoUpdate = false
      const freshKey = ks !== lastStudioShadow.current
      lastStudioShadow.current = ks
      if (freshKey || !st.sceneReady || isShadowRefreshActive(performance.now())) {
        ks.needsUpdate = true
      }
    }

    // Split the fill budget: a directional hemisphere (sky/ground) reads as
    // soft GI and gives objects form, while a small flat ambient lifts the
    // deepest interior shadows so nothing crushes to black.
    // Reduce the analytical fill where IBL also lights the scene (scaled by the
    // day level, so night interiors keep their full fill). `cur.sun` is the eased
    // 0→1 day level (same signal that drives `SceneEnvironment` IBL intensity).
    // The curtain/blind attenuation rides the FILL — that is the light actually
    // passing through the window glass (KEY-FILL-BALANCE). Read once here so the
    // hemisphere, the ambient and (via the signal) the IBL probe all agree.
    const fillAtten = isFeatureEnabled('curtainLightEffect')
      ? windowFillAttenuation(getWindowAttenuation())
      : 1
    // PHOTO-FILL: an opt-in key:fill rebalance. The sun is untouched, so this
    // only changes the RATIO — see `look.ts:photographicFillScale`.
    // ORBIT-STUDIO-LOOK: the key is ADDED light, so pay for it out of the fill
    // rather than out of the exposure — the same trade `photographicFillScale`
    // makes for walk. `1` (byte-identical) whenever the key is not live.
    const fillScale =
      iblFillScale(iblActive, cur.sun) *
      fillAtten *
      photographicFillScale(photographicLook, qualityTier) *
      orbitStudioFillScale(studioOn, cur.sun, studioSeam.fill)
    if (hemiRef.current) {
      hemiRef.current.intensity = cur.ambient * 1.1 * fillScale
      hemiRef.current.color.setRGB(
        cur.skyColor[0] * wb[0],
        cur.skyColor[1] * wb[1],
        cur.skyColor[2] * wb[2],
      )
      // PHOTO-GROUND-BOUNCE: the whole-floor bounce that lifts the photographic
      // look's ceiling into the photographic band. See `look.ts`.
      const gb = photographicGroundBounce(photographicLook)
      hemiRef.current.groundColor.setRGB(
        cur.groundColor[0] * wb[0] * gb,
        cur.groundColor[1] * wb[1] * gb,
        cur.groundColor[2] * wb[2] * gb,
      )
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = cur.ambient * 0.35 * fillScale
      ambientRef.current.color.setRGB(wb[0], wb[1], wb[2])
    }

    // Keep the OS/browser chrome (iOS standalone status bar, mobile address bar)
    // tinted to the top of the canvas so its top edge blends into the scene.
    // Samples the real rendered pixel, falling back to the eased sky colour; the
    // apply step dedups, so an unchanged colour is just a string compare.
    updateStatusBarTint(gl.domElement, cur.skyColor)
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
        // …and when the shadow FILTER changes (PCFSoft ↔ VSM) — the two formats
        // build/blur their maps differently, so a fresh instance is the clean path.
        key={`${shadowMapSize}-${Math.round(halfExtent)}-${shadowFilter}`}
        ref={sunRef}
        castShadow={shadowMapSize > 0}
        target={sunTarget}
        shadow-mapSize-width={shadowMapSize || 1024}
        shadow-mapSize-height={shadowMapSize || 1024}
        shadow-bias={shadowParams.bias}
        shadow-normalBias={shadowParams.normalBias}
        shadow-radius={shadowParams.radius}
        shadow-blurSamples={shadowParams.blurSamples}
        shadow-camera-near={1}
        shadow-camera-far={SUN_DISTANCE * 2 + halfExtent}
        shadow-camera-left={-halfExtent}
        shadow-camera-right={halfExtent}
        shadow-camera-top={halfExtent}
        shadow-camera-bottom={-halfExtent}
      />
      {/* ORBIT-STUDIO-LOOK: the soft overhead studio key. Mounted ONLY in orbit
          in the main scene, on a tier that already runs shadows — see
          `scene/orbitStudioLook.ts`. It shares the sun's `sunTarget`, so its
          shadow frustum is centred on the plan the same way. */}
      {studioOn && (
        <directionalLight
          key={`studio-${studioMapSize}-${Math.round(halfExtent)}-${shadowFilter}-${studioRange.near.toFixed(1)}`}
          ref={attachStudio}
          castShadow
          target={sunTarget}
          position={studioPos}
          shadow-mapSize-width={studioMapSize}
          shadow-mapSize-height={studioMapSize}
          shadow-bias={ORBIT_STUDIO.bias}
          shadow-normalBias={ORBIT_STUDIO.normalBias}
          shadow-radius={studioSeam.radius ?? ORBIT_STUDIO.shadowRadius}
          shadow-blurSamples={ORBIT_STUDIO.blurSamples}
          shadow-camera-near={studioRange.near}
          shadow-camera-far={studioRange.far}
          shadow-camera-left={-halfExtent}
          shadow-camera-right={halfExtent}
          shadow-camera-top={halfExtent}
          shadow-camera-bottom={-halfExtent}
        />
      )}
    </>
  )
}

/** `?studioKey=<intensity>&studioFill=<scale>` in a DEV build; every field
 *  undefined otherwise. The measurement seam ORBIT-STUDIO-LOOK was swept with,
 *  following `EffectsImpl`'s `?aoIntensity=` pattern (which is the seam the
 *  orbit AO half of this change was swept with). Inert in prod. */
function studioDevSeam(): { key?: number; fill?: number; radius?: number } {
  if (!import.meta.env.DEV || typeof window === 'undefined') return {}
  const q = new URLSearchParams(window.location.search)
  const num = (k: string) => {
    const v = Number(q.get(k))
    return q.has(k) && Number.isFinite(v) ? v : undefined
  }
  return { key: num('studioKey'), fill: num('studioFill'), radius: num('studioRadius') }
}
