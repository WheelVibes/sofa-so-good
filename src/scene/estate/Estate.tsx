import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { noExportUserData } from '../../export/sceneGltf'
import { useFeature } from '../../features/useFeature'
import { planExtent } from '../../floorplan/planExtent'
import type { WeatherCondition } from '../../state/slices/timeSlice'
import { useStore } from '../../state/store'
import { daylightFromAltitude, lightingFromAltitude } from '../lighting/altitudeCurve'
import { useSunPosition } from '../lighting/useSunPosition'
import { weatherGrade } from '../lighting/weather'
import { isPhotoBackdropActive } from '../SceneBackdrop'
import {
  adaptiveBlowoutScale,
  apertureCoverage,
  easeBlowout,
  planApertureQuads,
} from './apertureCoverage'
import { corridorFromPlan, estateFrame } from './estateCorridor'
import {
  blockYRange,
  buildEstateLayout,
  type EstateBox,
  type EstateLayout,
  ROOF_PARAPET_H,
  sectionCut,
  serviceWell,
  VOID_DECK_H,
} from './estateLayout'
import { setEstateVisible } from './estateSignal'
import {
  GROUND_TILE_M,
  paintFacadeTile,
  paintGroundTile,
  paintRoadTile,
  paintTreeSprite,
  ROAD_TILE_M,
  TILE_H_M,
  TILE_W_M,
  TREE_VARIANTS,
  WALL_PAINTS,
} from './estateTextures'

/**
 * ESTATE-SURROUND — draws the HDB estate outside the windows as real geometry
 * (see `estateLayout.ts` for why not a backdrop). Walk mode AND orbit mode
 * (product decision 2026-09-05: the orbit dollhouse now reads as a block in a
 * real estate, superseding the earlier "orbit stays clean" call from
 * PHOTO-BACKDROP — see ESTATE-ORBIT below), never the room editor, `sky`/`none`
 * backdrop only (a photo preset is the user's own choice of exterior), HDB plans
 * only, behind the `estateSurround` flag. Casts and receives no shadows: the sun's
 * shadow frustum is sized to the plan, and a neighbour block's shadow falling
 * across the living room is a physics fact the app's lighting rig was never
 * calibrated for. Tagged `noExport` so a glTF export of the flat stays the flat.
 *
 * **ESTATE-ORBIT (2026-09-05).** In orbit the own block is drawn CUT at the
 * flat's ceiling — building-section style, via the pure `sectionCut` — so the
 * storeys above never cap the dollhouse's open top and the wings don't rise the
 * full 12 storeys beside it. Neighbours/ground/roads/trees/corridor/below render
 * in full in both modes; only the own block above the cut is unreal to look at.
 * Every estate mesh (and each tree `InstancedMesh`) gets a no-op `raycast` — orbit
 * selects furniture/rooms by pointer raycast and deselects via
 * `onPointerMissed`, and the estate must never intercept either.
 */
export function Estate() {
  const enabled = useFeature('estateSurround')
  const cameraMode = useStore((s) => s.cameraMode)
  const backdrop = useStore((s) => s.backdrop)
  const customUrl = useStore((s) => s.customBackdropUrl)
  const proceduralSky = useFeature('proceduralSky')
  const roomEditor = useStore((s) => s.roomEditor.active)
  const plan = useStore((s) => s.floorPlan)
  const hdb = plan.category?.housingType === 'HDB'
  // ESTATE-CORRIDOR-NIGHT: read here (not inside the painter, which stays pure) and
  // passed down to the module-level material builder — see `materials()`/`buildMaterials`.
  const corridorNightMask = useFeature('estateCorridorNightMask')
  // A chosen photo backdrop is the user's exterior; only the analytic sky (or no
  // backdrop) gets the estate in front of it.
  const photoPreset =
    backdrop !== 'sky' &&
    backdrop !== 'none' &&
    isPhotoBackdropActive(backdrop, cameraMode, !!customUrl, proceduralSky)
  const show =
    enabled &&
    hdb &&
    (cameraMode === 'firstPerson' || cameraMode === 'orbit') &&
    !roomEditor &&
    !photoPreset
  if (!show) return null
  return (
    <EstateGeometry
      plan={plan}
      orbit={cameraMode === 'orbit'}
      corridorNightMask={corridorNightMask}
    />
  )
}

// ── materials (module-level, built once, shared by every block) ─────────────
//
// ESTATE-CORRIDOR-NIGHT note: `buildMaterials` (and therefore the `corridorNightMask`
// option it takes) only actually runs on the FIRST call this page session — `materials()`
// below caches the result in `mats` and every later call, with whatever flag value, is a
// no-op. Unlike `glazingLightmapExclude` (re-applied whenever the bake re-runs, e.g. on an
// hour/tier change — see `scripts/scenarios/glazing-lightmap-verify-off.json`'s `setup`-step
// `setFeatureFlag` pattern), `Estate`/`EstateGeometry` mount at BOOT (default cameraMode is
// orbit, `estateSurround` defaults on) — before ANY post-load scenario `setup` eval step can
// run — so a `setFeatureFlag` call after boot arrives too late and is a no-op here (verified:
// it leaves the mask baked from the flag's DEFAULT). A test/scenario that wants the flag OFF
// must instead use the `?ff=estateCorridorNightMask:off` URL query override
// (`features/flags/resolve.ts:loadOverrides`, parsed synchronously at the feature-flags
// store-slice MODULE load, before the first React render) — see
// `scripts/scenarios/estate-corridor-night-verify-off.json`.

let mats: ReturnType<typeof buildMaterials> | null = null
function texture(c: HTMLCanvasElement, srgb = true): CanvasTexture {
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  if (srgb) t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}
function buildMaterials(corridorNightMask: boolean) {
  /**
   * Exterior surfaces carry BOTH a day and a night emissive: by day the albedo itself,
   * scaled by {@link EXTERIOR_DAY_BOOST}, because a camera exposed for a room sees the
   * outside two to three times brighter than any interior wall (that is why real window
   * views blow toward white); the app's sun and hemisphere light the estate no harder
   * than the flat, so without the boost the neighbours read as a grey interior wall
   * seen through glass. By night the emissive map swaps to the lit-window mask.
   */
  const lit = (kind: 'windows' | 'corridor', paint: number) => {
    // ESTATE-CORRIDOR-NIGHT: only the corridor kind's night mask takes the option —
    // the window-side (lit-window) mask is unaffected.
    const nightOpts = kind === 'corridor' ? { corridorNightMask } : {}
    const day = texture(paintFacadeTile({ kind, paint, night: false }))
    const night = texture(paintFacadeTile({ kind, paint, night: true, ...nightOpts }))
    const mat = new MeshStandardMaterial({
      map: day,
      emissiveMap: day,
      emissive: 0xffffff,
      emissiveIntensity: EXTERIOR_DAY_BOOST,
      roughness: 0.92,
      metalness: 0,
    })
    mat.userData.dayMap = day
    mat.userData.nightMap = night
    return mat
  }
  const facade = WALL_PAINTS.map((_, paint) => lit('windows', paint))
  const corridor = WALL_PAINTS.map((_, paint) => lit('corridor', paint))
  const plain = (hex: string) => {
    const mat = new MeshStandardMaterial({
      color: hex,
      emissive: hex,
      emissiveIntensity: EXTERIOR_DAY_BOOST,
      roughness: 0.95,
      metalness: 0,
    })
    return mat
  }
  const endWall = WALL_PAINTS.map((hex) => plain(hex))
  const roof = plain('#8d8b84')
  const deck = plain('#6f6b64')
  const ground = new MeshStandardMaterial({
    map: texture(paintGroundTile()),
    emissiveMap: texture(paintGroundTile()),
    emissive: 0xffffff,
    emissiveIntensity: EXTERIOR_DAY_BOOST * 0.7,
    roughness: 1,
    metalness: 0,
  })
  const road = new MeshStandardMaterial({
    map: texture(paintRoadTile()),
    emissiveMap: texture(paintRoadTile()),
    emissive: 0xffffff,
    emissiveIntensity: EXTERIOR_DAY_BOOST * 0.7,
    roughness: 0.95,
    metalness: 0,
  })
  const trees = Array.from({ length: TREE_VARIANTS }, (_, v) => {
    const t = texture(paintTreeSprite(v))
    return new MeshStandardMaterial({
      map: t,
      emissiveMap: t,
      emissive: 0xffffff,
      emissiveIntensity: EXTERIOR_DAY_BOOST * 0.5,
      transparent: false,
      alphaTest: 0.5,
      side: DoubleSide,
      roughness: 1,
      metalness: 0,
    })
  })
  return { facade, corridor, endWall, roof, deck, ground, road, trees }
}

/** Daylight exterior brightness over what the scene lights alone give (see `lit`). */
const EXTERIOR_DAY_BOOST = 1.1
/**
 * WINDOW-BLOWOUT: how much brighter the outside is than the room, **derived from the sun and sky
 * the scene is already using** rather than picked.
 *
 * **The defect.** `lit()`'s own comment says a camera exposed for a room sees the outside "two to
 * three times brighter … that is why real window views blow toward white", and then implements
 * `EXTERIOR_DAY_BOOST` **1.1**. Measured against two independent references that agree with each
 * other — a real apartment photograph and a Cycles render of our own scene at the same pose — the
 * fraction of aperture pixels at luminance >= 240 should be **~33 %**. The app produced **0.0 %**,
 * topping out at 208 counts, so the neighbouring block read as a well-lit wall seen through glass.
 *
 * **Why 3 would not have fixed it either.** That comment reasons in DISPLAY counts where the
 * requirement is in LINEAR RADIANCE, and AgX's shoulder is brutally compressive up there. Swept
 * live at the reference pose: 1.1 -> 0.0 %, 2 -> 0.0 %, 2.6 -> 0.0 %, **4 -> 0.0 %**, 6 -> 21.0 %,
 * 10 -> 43.1 %, 16 -> 52.7 %, 32 -> 59.3 %. Going 1.1 -> 4 moves p95 by 21 counts and still yields
 * no near-white pixels at all.
 *
 * **Why this is a RATIO and not a constant.** A window blows out because the exterior is receiving
 * the whole sky plus the direct beam while the room is receiving only what one aperture admits —
 * so the contrast follows the environment and the time of day, and it must fall as the sun drops.
 * `daylightFromAltitude` cannot express that: it is pinned at **1.0 everywhere from 8 deg to 90 deg**,
 * so scaling by it alone would blow the window out exactly as hard at 08:00 as at 13:00.
 * {@link exteriorDayBoost} therefore scales with the app's OWN daylight model —
 * `lightingFromAltitude`'s `sun` + `ambient`, the two terms that light the estate in the first
 * place — normalised to the altitude the calibration was measured at.
 *
 * `BLOWN_RATIO_AT_REF` is the one calibration constant, and it cannot be derived: the app's sun and
 * ambient are artistic quantities rather than photometric ones (`v0.31.6.6`), so the map from them
 * to a real exterior/interior illuminance ratio has to be measured once. It is measured against the
 * ~33 % both references call for, not chosen for looks.
 */
const REF_ALT_RAD = (83.907 * Math.PI) / 180
/** Exterior-over-interior contrast at {@link REF_ALT_RAD}, fitted to the measured ~33 % near-white. */
const BLOWN_RATIO_AT_REF = 8

/**
 * Daylight exterior boost at a given sun altitude, falling smoothly as the sun drops.
 *
 * Exported for tests: the property that matters is MONOTONICITY in altitude, which is the whole
 * point of deriving this rather than fixing it.
 *
 * **`inside` is load-bearing, and it was missed on the first pass.** The whole premise is "a camera
 * EXPOSED FOR A ROOM sees the outside blow toward white" — which holds only while the camera is in
 * the room. In orbit/dollhouse the camera is outside the building looking AT the estate, and in the
 * per-room editor it is outside a cut-away room; in both the estate is the subject, exposed for
 * itself, not a backdrop behind an aperture. Applying the blown ratio there washes the whole view
 * out: measured in orbit, it moved the frame mean **170.6 -> 208.7**, p05 **91 -> 139** and the
 * near-white fraction **3.1 % -> 17.6 %**. That regression shipped in `v0.34.1.11` and was caught
 * only when the matrix was extended past walk mode.
 */
export function exteriorDayBoost(
  altRad: number,
  blown: boolean,
  inside = true,
  weather: WeatherCondition = 'clear',
): number {
  // WEATHER-CONDITIONS. A window blows out because the OUTSIDE is receiving more than the room, so
  // the ratio is exterior-over-interior — and `weather.ts` already holds both halves: the outdoor
  // transmittance (Kasten & Czeplak) and the fill the interior is graded by. Under a full deck
  // their quotient is ~0.33, which is how "a window that barely blows out" falls out of numbers
  // that were fitted for something else instead of being a third constant to pick.
  //
  // `weather` defaults to `'clear'`, whose grade is the exact identity, so every existing caller
  // and every existing test is byte-identical.
  const wx = weatherGrade(weather, daylightFromAltitude(altRad))
  if (!blown || !inside) return EXTERIOR_DAY_BOOST * wx.blowout
  const here = lightingFromAltitude(altRad)
  const ref = lightingFromAltitude(REF_ALT_RAD)
  const refTotal = ref.sun + ref.ambient
  if (refTotal <= 0) return EXTERIOR_DAY_BOOST * wx.blowout
  const scale = (here.sun + here.ambient) / refTotal
  // Never below the old constant: this feature exists to ADD contrast, and a low SUN must not make
  // the view outside dimmer than it was before the flag existed. The weather scale is applied
  // OUTSIDE that floor and is deliberately not floored itself — an overcast sky is exactly the
  // case where the view outside SHOULD come down, and it is the same multiplier on both branches
  // above so the whole function scales uniformly.
  return Math.max(EXTERIOR_DAY_BOOST, BLOWN_RATIO_AT_REF * scale) * wx.blowout
}
/** Emissive intensity of lit windows / corridor tubes at full dark. */
const EXTERIOR_NIGHT_GLOW = 2.4
function materials(corridorNightMask: boolean) {
  if (!mats) mats = buildMaterials(corridorNightMask)
  return mats
}

// ── geometry helpers ─────────────────────────────────────────────────────────

/**
 * A box whose ±z and ±x faces carry façade UVs in TILE units: u = metres / TILE_W_M,
 * v = metres / TILE_H_M, with v = 0 at the box BOTTOM so storey lines land on storey
 * boundaries. three's BoxGeometry face order is +x, −x, +y, −y, +z, −z, 4 verts each,
 * default uv (0..1) with v = 1 at the top.
 */
export function tileBoxUv(w: number, h: number, d: number): BoxGeometry {
  const geo = new BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  const faceLen = [d, d, w, w, w, w]
  const faceTall = [h, h, d, d, h, h]
  for (let f = 0; f < 6; f++) {
    const su = faceLen[f] / TILE_W_M
    const sv = faceTall[f] / TILE_H_M
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    }
  }
  uv.needsUpdate = true
  return geo
}

function boxCentreY(b: EstateBox): number {
  return (b.yMin + b.yMax) / 2
}

/** No-op raycast: orbit selects furniture/rooms by pointer raycast and deselects via
 *  `onPointerMissed` — the estate (background scenery) must never intercept either, on any
 *  mesh or tree `InstancedMesh`. */
function noopRaycast() {
  // Intentionally empty — the estate is not a pointer target.
}

// ── the component that owns the meshes ───────────────────────────────────────

function EstateGeometry({
  plan,
  orbit,
  corridorNightMask,
}: {
  plan: ReturnType<typeof useStore.getState>['floorPlan']
  orbit: boolean
  corridorNightMask: boolean
}) {
  const invalidate = useThree((s) => s.invalidate)
  const [extW, extD] = planExtent(plan)
  // ESTATE-DOOR-SIDE: the common corridor fronts the plan's REAL main door, whichever of
  // the four exterior faces it is on (`corridorFromPlan`). `estateFrame` turns that into
  // the canonical inputs `buildEstateLayout` understands (corridor on +z, width along +x)
  // plus the yaw/offset applied to the whole group below.
  const frame = useMemo(() => estateFrame(corridorFromPlan(plan), [extW, extD]), [plan, extW, extD])
  const rawLayout = useMemo(
    () => buildEstateLayout({ extent: frame.extent, corridorSpan: frame.span }),
    [frame],
  )
  // Orbit sees the own block cut at the flat's ceiling — a building section, not a slab
  // capping the open dollhouse top (ESTATE-ORBIT). Walk mode gets the service light well
  // (YARD-ESTATE, audit finding S4): the neighbouring unit's re-entrant service void, without
  // which the yard's half-wall looks out at a blank wing wall 4.9 m away. Per-mode exactly like
  // `sectionCut`, so the orbit dollhouse is byte-identical.
  const serviceWellFlag = useFeature('estateServiceWell')
  const layout = useMemo(() => {
    if (orbit) {
      const ceilingHeight = plan.ceilingHeight ?? 2.6
      return sectionCut(rawLayout, ceilingHeight + 0.15)
    }
    return serviceWellFlag ? serviceWell(rawLayout) : rawLayout
  }, [rawLayout, orbit, plan.ceilingHeight, serviceWellFlag])
  const m = materials(corridorNightMask)
  // WINDOW-BLOWOUT. Read HERE rather than in `Estate()` and threaded as a prop, because unlike
  // `corridorNightMask` this is NOT baked into the cached materials — it only scales
  // `emissiveIntensity`, which the day/night effect below already rewrites whenever the sun
  // moves. So it is a live flag, not a boot-only one, and a scenario can toggle it with
  // `setFeatureFlag` instead of needing a `?ff=` URL override.
  const windowBlowout = useFeature('windowBlowout')
  const weatherFlag = useFeature('weatherConditions')
  const weather = useStore((s) => s.weather)
  // Only walk mode puts the camera inside a room; see `exteriorDayBoost`'s `inside`.
  const cameraMode = useStore((s) => s.cameraMode)

  // WINDOW-EXPOSURE (audit finding S1). The blown ratio is calibrated at ROOM-SCALE framing;
  // a real camera facing the glazing at close range re-exposes. `apertureCoverage.ts` estimates
  // the fraction of the viewport the panes cover on the CPU (no readback, no extra draw call)
  // and ramps the boost down above `BLOWOUT_RAMP_START`, eased like auto-exposure. Only in
  // WALK mode, for the same reason `exteriorDayBoost`'s `inside` exists: in orbit the estate is
  // the subject, not a view through an aperture, and there is no aperture coverage to speak of.
  const adaptiveFlag = useFeature('windowBlowoutAdaptive')
  const inside = cameraMode === 'firstPerson'
  const adaptive = adaptiveFlag && windowBlowout && inside
  const quads = useMemo(() => (adaptive ? planApertureQuads(plan) : []), [adaptive, plan])
  /** The eased exposure scale. 1 is "exactly what shipped", and it is the resting value at
   *  every calibrated room-scale pose — so those frames are byte-identical. */
  const exposureRef = useRef(1)
  const viewProj = useRef(new Matrix4()).current

  // Night: lit windows + corridor tubes fade in as the sun sets.
  const sunAlt = useSunPosition().altitude
  const daylight = daylightFromAltitude(sunAlt)
  const isNight = daylight < 0.5
  const night = (1 - daylight) ** 1.4 * EXTERIOR_NIGHT_GLOW
  const dayBase =
    daylight * exteriorDayBoost(sunAlt, windowBlowout, inside, weatherFlag ? weather : 'clear')

  /** Write the emissive levels for one exposure scale. `scale === 1` reproduces the shipped
   *  assignment operation-for-operation (`dayBase * 1` is exact in IEEE-754). */
  const applyLevels = useCallback(
    (scale: number) => {
      const day = dayBase * scale
      for (const mat of [...m.facade, ...m.corridor]) {
        const want = (isNight ? mat.userData.nightMap : mat.userData.dayMap) as Texture
        if (mat.emissiveMap !== want) mat.emissiveMap = want
        mat.emissiveIntensity = isNight ? night : day
      }
      for (const mat of [...m.endWall, m.roof, m.deck]) mat.emissiveIntensity = day
      m.ground.emissiveIntensity = day * 0.7
      m.road.emissiveIntensity = day * 0.7
      for (const mat of m.trees) mat.emissiveIntensity = day * 0.5
      invalidate()
    },
    [m, invalidate, isNight, night, dayBase],
  )

  useEffect(() => {
    if (!adaptive) exposureRef.current = 1
    applyLevels(exposureRef.current)
  }, [applyLevels, adaptive])

  useFrame(({ camera }, delta) => {
    if (!adaptive || isNight) return
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const target = adaptiveBlowoutScale(apertureCoverage(quads, viewProj.elements))
    const prev = exposureRef.current
    if (prev === target) return
    // Snap once the ease is inside a quarter of a count of emissive intensity, so the pump is
    // not held open by an asymptote (`frameloop="demand"` — `applyLevels` invalidates).
    const next = Math.abs(target - prev) < 1e-3 ? target : easeBlowout(prev, target, delta)
    exposureRef.current = next
    applyLevels(next)
  })

  // Tell the window panes the exterior is real (ESTATE-NIGHT-GLASS, `estateSignal.ts`).
  useEffect(() => {
    setEstateVisible(true)
    invalidate()
    return () => {
      setEstateVisible(false)
      invalidate()
    }
  }, [invalidate])

  const parts = useMemo(() => buildParts(layout, corridorNightMask), [layout, corridorNightMask])
  useEffect(() => {
    return () => {
      for (const g of parts.geometries) g.dispose()
    }
  }, [parts])

  const tree = useMemo(() => buildTrees(layout, m.trees), [layout, m.trees])
  useEffect(() => {
    return () => {
      for (const mesh of tree) mesh.geometry.dispose()
    }
  }, [tree])

  return (
    <group
      name="estate-surround"
      position={[frame.offset[0], 0, frame.offset[1]]}
      rotation={[0, frame.yaw, 0]}
      userData={noExportUserData()}
    >
      {parts.meshes.map((p) => (
        <mesh
          key={p.key}
          name={p.key}
          geometry={p.geometry}
          material={p.material}
          position={p.position}
          rotation={p.rotation}
          frustumCulled
          raycast={noopRaycast}
        />
      ))}
      {tree.map((mesh, i) => (
        <primitive key={`trees-${i}`} object={mesh} />
      ))}
    </group>
  )
}

interface Part {
  key: string
  geometry: BoxGeometry | PlaneGeometry
  material: Material | Material[]
  position: [number, number, number]
  rotation?: [number, number, number]
}

function buildParts(
  layout: EstateLayout,
  corridorNightMask: boolean,
): {
  meshes: Part[]
  geometries: (BoxGeometry | PlaneGeometry)[]
} {
  const m = materials(corridorNightMask)
  const meshes: Part[] = []
  const geometries: (BoxGeometry | PlaneGeometry)[] = []
  const box = (
    key: string,
    b: EstateBox,
    material: Material | Material[],
    tiled = true,
    yaw = 0,
  ) => {
    const h = b.yMax - b.yMin
    const geo = tiled ? tileBoxUv(b.w, h, b.d) : new BoxGeometry(b.w, h, b.d)
    geometries.push(geo)
    meshes.push({
      key,
      geometry: geo,
      material,
      position: [b.x, boxCentreY(b), b.z],
      rotation: yaw ? [0, yaw, 0] : undefined,
    })
  }
  // Face material array: +x, −x, +y, −y, +z, −z.
  const slabMats = (paint: number, windowSide: '+z' | '-z') => {
    const win = m.facade[paint % m.facade.length]
    const cor = m.corridor[paint % m.corridor.length]
    const end = m.endWall[paint % m.endWall.length]
    return windowSide === '+z'
      ? [end, end, m.roof, m.roof, win, cor]
      : [end, end, m.roof, m.roof, cor, win]
  }

  // Own block. Its residential faces: window façade on −z (the living/bedroom side of the
  // default plan), corridor on +z. Paint family 0 (the flat's own exterior is near-white).
  const own = layout.own
  const ownMats = slabMats(0, '-z')
  // Wings and the stack above/below are split at the void deck so the deck stays plain.
  const deckTop = layout.groundY + VOID_DECK_H
  for (const [key, b] of [
    ['own-west', own.westWing],
    ['own-east', own.eastWing],
    // Present only after `serviceWell` (walk mode) — the wing beyond the light well.
    ['own-west-far', own.westWingFar],
    ['own-east-far', own.eastWingFar],
    ['own-below', own.below],
  ] as const) {
    if (!b) continue
    if (b.yMin < deckTop) {
      box(`${key}-deck`, { ...b, yMax: Math.min(deckTop, b.yMax) }, m.deck, false)
      if (b.yMax > deckTop) box(`${key}-res`, { ...b, yMin: deckTop }, ownMats)
    } else {
      box(key, b, ownMats)
    }
  }
  // Absent after a section cut (orbit) — the storeys above the flat's ceiling would
  // otherwise cap the open dollhouse top.
  if (own.above) box('own-above', own.above, ownMats)
  if (own.roof) box('own-roof', own.roof, m.roof, false)
  // Corridor outside the main door: floor slab + parapet (the corridor ceiling is the
  // storey above's slab, already part of `own.above`/wings).
  box('own-corridor-floor', own.corridorFloor, m.deck, false)
  box('own-corridor-parapet', own.corridorParapet, m.endWall[0], false)

  // Neighbours.
  for (const b of layout.blocks) {
    const { deckTop: dTop, roofY } = blockYRange(layout.groundY, b.storeys)
    const fp = { x: b.x, z: b.z, w: b.w, d: b.d }
    box(`${b.id}-deck`, { ...fp, yMin: layout.groundY, yMax: dTop }, m.deck, false, b.yaw)
    box(
      `${b.id}-res`,
      { ...fp, yMin: dTop, yMax: roofY },
      slabMats(b.paint, b.windowSide),
      true,
      b.yaw,
    )
    box(
      `${b.id}-roof`,
      { ...fp, w: b.w + 0.3, d: b.d + 0.3, yMin: roofY, yMax: roofY + ROOF_PARAPET_H },
      m.roof,
      false,
      b.yaw,
    )
    // Lift-motor room / water tank on the roof (offset along the block's own axis).
    const lx = b.x + Math.cos(b.yaw) * b.w * 0.25
    const lz = b.z - Math.sin(b.yaw) * b.w * 0.25
    box(
      `${b.id}-lmr`,
      { x: lx, z: lz, w: 6, d: 5, yMin: roofY, yMax: roofY + 3.2 },
      m.endWall[(b.paint + 1) % m.endWall.length],
      false,
      b.yaw,
    )
  }

  // Ground: one big plane, tiled. 360 m (±180 m), inside the orbit sky dome's 200 m
  // radius (`skyDome.ts:SKY_DOME_RADIUS`) so the horizon meets haze rather than the
  // dome's far wall or z-fighting past it (ORBIT-SECTION-CUT, 2026-09-05).
  const gsize = 360
  const ground = new PlaneGeometry(gsize, gsize)
  {
    const uv = ground.attributes.uv
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * gsize) / GROUND_TILE_M, (uv.getY(i) * gsize) / GROUND_TILE_M)
    uv.needsUpdate = true
  }
  geometries.push(ground)
  meshes.push({
    key: 'ground',
    geometry: ground,
    material: m.ground,
    position: [own.footprint.x, layout.groundY - 0.02, own.footprint.z],
    rotation: [-Math.PI / 2, 0, 0],
  })
  // Roads: thin planes just above the ground.
  layout.roads.forEach((r, i) => {
    const g = new PlaneGeometry(r.w, r.d)
    const uv = g.attributes.uv
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * r.w) / ROAD_TILE_M, uv.getY(k))
    uv.needsUpdate = true
    geometries.push(g)
    meshes.push({
      key: `road-${i}`,
      geometry: g,
      material: m.road,
      position: [r.x, layout.groundY + 0.01, r.z],
      rotation: [-Math.PI / 2, 0, 0],
    })
  })
  return { meshes, geometries }
}

/** Two crossed instanced quads per tree, one InstancedMesh pair per sprite variant —
 *  cheap, and a rain tree's umbrella crown reads correctly from 30–150 m. */
function buildTrees(layout: EstateLayout, materials: Material[]): InstancedMesh[] {
  const out: InstancedMesh[] = []
  const scratch = new Object3D()
  materials.forEach((material, v) => {
    const mine = layout.trees.filter((_, i) => i % materials.length === v)
    const n = mine.length
    for (const yaw of [0, Math.PI / 2]) {
      const geo = new PlaneGeometry(1, 1)
      const mesh = new InstancedMesh(geo, material, Math.max(1, n))
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = noopRaycast
      mine.forEach((t, i) => {
        // The sprite is square; a rain tree is ~1.6× wider than tall, so scale x by that.
        const h = t.h
        const w = h * 1.6
        scratch.position.set(t.x, layout.groundY + h / 2, t.z)
        scratch.rotation.set(0, yaw + (i % 5) * 0.31, 0)
        scratch.scale.set(w, h, 1)
        scratch.updateMatrix()
        mesh.setMatrixAt(i, scratch.matrix)
      })
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      mesh.frustumCulled = false
      out.push(mesh)
    }
  })
  return out
}
