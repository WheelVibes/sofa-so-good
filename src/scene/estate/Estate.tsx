import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  type Material,
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
import { useStore } from '../../state/store'
import { daylightFromAltitude } from '../lighting/altitudeCurve'
import { useSunPosition } from '../lighting/useSunPosition'
import { isPhotoBackdropActive } from '../SceneBackdrop'
import { corridorFromPlan, estateFrame } from './estateCorridor'
import {
  blockYRange,
  buildEstateLayout,
  type EstateBox,
  type EstateLayout,
  ROOF_PARAPET_H,
  sectionCut,
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
  // capping the open dollhouse top (ESTATE-ORBIT). Walk mode gets the untouched layout.
  const layout = useMemo(() => {
    if (!orbit) return rawLayout
    const ceilingHeight = plan.ceilingHeight ?? 2.6
    return sectionCut(rawLayout, ceilingHeight + 0.15)
  }, [rawLayout, orbit, plan.ceilingHeight])
  const m = materials(corridorNightMask)

  // Night: lit windows + corridor tubes fade in as the sun sets.
  const sunAlt = useSunPosition().altitude
  const daylight = daylightFromAltitude(sunAlt)
  useEffect(() => {
    const isNight = daylight < 0.5
    const night = (1 - daylight) ** 1.4 * EXTERIOR_NIGHT_GLOW
    const day = daylight * EXTERIOR_DAY_BOOST
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
  }, [daylight, m, invalidate])

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
    ['own-below', own.below],
  ] as const) {
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
