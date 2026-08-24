import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type Group, Mesh, type MeshStandardMaterial, Vector3 } from 'three'
import { resolveDoorLeafMaterialKind } from '../floorplan/doorMaterial'
import { isDoubleDoor, isSlidingDoor, slidingParkDir } from '../floorplan/doorSwing'
import type { PlanOpening, PlanWall } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../floorplan/wallArc'
import { MetalMaterial } from '../furniture/primitives/MetalMaterial'
import {
  getMetalMaterial,
  getPaintedMaterial,
  getVinylMaterial,
  getWoodMaterial,
} from '../materials/furnitureMaterials'
import { dispatchWalkInteract } from '../state/editing'
import { useStore } from '../state/store'
import { FLAT } from './constants'
import { getWallOwnStrength } from './walls/wallReveal'
import {
  cornerSpreadStrength,
  DEFAULT_WALL_REVEAL_STRENGTH,
  facingToward,
  orientOutward,
  revealStrength,
  revealTargetOpacityForFade,
  SPREAD_ONSET,
} from './walls/wallRevealMath'

const SWING_RAD = Math.PI / 2
const SWING_SECONDS = 0.2
const LEAF_THICK = FLAT.doorThickness
// Scratch for the camera forward direction (avoids per-frame allocation).
const FWD = new Vector3()
const DEFAULT_LEAF = '#9d7c54'
const DEFAULT_PANEL = '#8a6c48'

/** Multiply a hex colour toward black by `f` (≤1) — used to derive the recessed
 *  panel shade a touch darker than a custom door-leaf colour. */
function shade(hex: string, f: number): string {
  return `#${new Color(hex).multiplyScalar(f).getHexString()}`
}

/**
 * A swinging, clickable door leaf for a **custom-plan** door opening — the 3D
 * equivalent of the default flat's {@link DoorLeaf}, driven by `PlanOpening`
 * data instead of the fixed `DoorSpec` tables. Without this a plan door reads as
 * an empty gap even when closed (and closed doors *do* block walk collision —
 * `planCollisionWalls` only opens a gap for an OPEN door), so the leaf removes
 * that visual/behaviour mismatch. Hinge/swing honour the opening; click toggles
 * it through the shared `doors` store (so collision + render stay in sync). It
 * fades out with the wall it sits in when that wall is between the orbit camera
 * and the plan centre, matching `FadeWall`.
 *
 * `style: 'bifold'` (the standard SG toilet/utility door) renders as two
 * half-width leaves instead of one: the outer leaf hinges at the jamb, the
 * inner leaf hinges at the outer leaf's far edge and folds further in the same
 * rotational sense, both driven by the same open/close `angleRef` timing — a
 * fully open bifold reads as outer 45° / inner 135° off the wall. This is a
 * simple, honest visual (not true accordion/piano-hinge kinematics); the 2D
 * plan swing arc (`doorSwing.ts`) intentionally keeps the standard full-width
 * quarter-round envelope for a bifold too (a conservative superset of the
 * folded leaves' actual sweep, not a literal trace of it — parameterising the
 * arc to the folded shape would need real per-leaf arc geometry the 2D layer
 * doesn't model for any door style yet).
 *
 * `style: 'sliding'` (the SG kitchen/service-yard/balcony norm) renders a
 * single full-width slab that TRANSLATES along the wall axis (no swing) —
 * driven by the same `angleRef` timing, `slideRef.position.x` moves the leaf
 * from centred (closed) to fully parked over the roomier adjacent wall segment
 * (open). `style: 'double'` (condo main doors / larger master bedrooms) renders
 * two half-width leaves hinged at BOTH jambs and swinging the same side (mirror
 * rotations about the two jamb pivots). Their 2D symbols live in
 * `doorSwing.ts:doorPlanSymbol` (sliding → leaf bar + slide arrow, no arc;
 * double → two quarter-arcs) and their keep-out in `doorSwingClearRect`
 * (sliding → none; double → a conservative full-width rect).
 */
export function PlanDoorLeaf({
  wall,
  opening,
  cx,
  cz,
  isInterior,
  neighborIds,
}: {
  wall: PlanWall
  opening: PlanOpening
  /** Plan-centre X/Z, used as the fallback reference for the camera-facing fade. */
  cx: number
  cz: number
  /** Point-in-room test used to orient the host wall's outward normal (robust on
   *  non-rectangular plans); falls back to the plan-centre reference if absent. */
  isInterior?: (x: number, z: number) => boolean
  /** Host wall's corner-neighbour ids — the leaf follows its wall's corner-spread
   *  fade (read-only; the wall body publishes the own-strength registry). */
  neighborIds?: readonly string[]
}) {
  const isOpen = useStore((s) => s.doors[opening.id]?.open ?? false)
  // BSJ-4: a bare-BTO / strip-out handover leaves the leaf ABSENT — the opening
  // (wall gap) stays, only the leaf is gone. The 2D plan symbol still draws the
  // opening (it reads `plan.openings`, not the doors state), so the doorway
  // remains marked on the plan.
  const leafAbsent = useStore((s) => s.doors[opening.id]?.leaf === 'none')
  const toggle = useStore((s) => s.toggleDoor)
  const rootRef = useRef<Group>(null)
  const swingRef = useRef<Group>(null!)
  // Bifold only: the second leaf's fold hinge, a child of `swingRef` anchored at
  // the outer leaf's far edge (see the `isBifold` render branch below).
  const foldRef = useRef<Group>(null)
  // Double-leaf only: the two mirror-hinged leaves (one at each jamb).
  const leafARef = useRef<Group>(null)
  const leafBRef = useRef<Group>(null)
  // Sliding only: the leaf group that translates along the wall axis.
  const slideRef = useRef<Group>(null)
  const angleRef = useRef(0)
  const opacityRef = useRef(1)
  const transparentRef = useRef(false)
  const { camera } = useThree()
  const isBifold = (opening.style ?? 'panel') === 'bifold'
  const isSliding = isSlidingDoor(opening)
  const isDouble = isDoubleDoor(opening)
  // Real leaf-surface material (door `material` axis) — painted (flat colour,
  // today's default), procedural wood grain, or smooth vinyl/PVC laminate (the
  // SG toilet-door standard, defaulted for `bifold`). A real three `Material`
  // instance (not a plain props object) per the furniture-material convention.
  const leafColor = opening.color ?? DEFAULT_LEAF
  const leafMaterialKind = resolveDoorLeafMaterialKind(opening)
  // Clone: the fade effect below mutates `opacity`/`transparent` per door, so
  // this leaf needs its OWN material even though the cached helper shares one
  // instance per (kind, colour) across every door — same pattern as
  // `WallSegment`'s `faded` clone (textures still shared by reference; the
  // clone only frees its own GPU program on unmount).
  const leafMat = useMemo(() => {
    const base =
      leafMaterialKind === 'vinyl'
        ? getVinylMaterial(leafColor)
        : leafMaterialKind === 'wood'
          ? getWoodMaterial(leafColor, 1, 0.45)
          : leafMaterialKind === 'metal'
            ? getMetalMaterial(leafColor, 'satin')
            : getPaintedMaterial(leafColor)
    return base.clone()
  }, [leafMaterialKind, leafColor])
  useEffect(() => () => leafMat.dispose(), [leafMat])

  const len = wallLength(wall)
  const sCentre = opening.offset + opening.width / 2
  const hinge = opening.hinge ?? 'start'
  const swing = opening.swing ?? 'right'
  const height = Math.max(0.4, opening.head - opening.sill)
  const direction = hinge === 'start' ? 1 : -1

  // Placement frame: a curved wall anchors the door at its mid-arc point + local
  // tangent (the swing group's local X runs along the wall); a straight wall uses
  // the wall midpoint + chord direction, with the hinge offset from that midpoint.
  let angle: number
  let midX: number
  let midZ: number
  let hingeLocalX: number
  // Local-X (along-wall, relative to the root group's origin) of the two jamb
  // pivots + the opening centre — used by the double-leaf + sliding branches.
  let startJambX: number
  let endJambX: number
  let centerLocalX: number
  let doorX: number // door world centre (fade test)
  let doorZ: number
  if (isCurvedWall(wall)) {
    const p = pointAtArcLength(wall, sCentre) // angle = atan2(dx, dz)
    midX = p.x
    midZ = p.z
    angle = Math.atan2(Math.cos(p.angle), Math.sin(p.angle)) // → atan2(dz, dx) convention
    hingeLocalX = hinge === 'start' ? -opening.width / 2 : opening.width / 2
    startJambX = -opening.width / 2
    endJambX = opening.width / 2
    centerLocalX = 0
    doorX = p.x
    doorZ = p.z
  } else {
    const dx = len === 0 ? 1 : (wall.end[0] - wall.start[0]) / len
    const dz = len === 0 ? 0 : (wall.end[1] - wall.start[1]) / len
    angle = Math.atan2(dz, dx)
    midX = (wall.start[0] + wall.end[0]) / 2
    midZ = (wall.start[1] + wall.end[1]) / 2
    hingeLocalX =
      hinge === 'start' ? opening.offset - len / 2 : opening.offset + opening.width - len / 2
    startJambX = opening.offset - len / 2
    endJambX = opening.offset + opening.width - len / 2
    centerLocalX = opening.offset + opening.width / 2 - len / 2
    doorX = wall.start[0] + dx * sCentre
    doorZ = wall.start[1] + dz * sCentre
  }
  // Sliding-door open direction along the wall: park the leaf over whichever
  // adjacent wall segment has more room (so the open leaf always overlaps real
  // wall, never floats past the end). −1 = toward the wall's start, +1 = end.
  // Shared with the 2D slide-arrow (`doorSwing.ts:slidingParkDir`) so the plan
  // and the 3D leaf always agree on which way the door opens.
  const slideDir = slidingParkDir(opening.offset, opening.width, len)

  useFrame((_, dt) => {
    // Hide with the host wall when an EXTERNAL wall sits between the orbit camera
    // and the plan centre (internal partitions never fade, so their doors stay).
    // Orientation-based (matches FadeWall): test the wall's outward broad-face
    // normal against the camera→centre direction, NOT the door's position
    // relative to centre — so a door in a long near wall hides together with its
    // wall instead of only when it happens to sit on the view axis.
    if (rootRef.current) {
      const st = useStore.getState()
      const fade = st.wallRevealStrength ?? DEFAULT_WALL_REVEAL_STRENGTH
      const revealScope = st.wallRevealScope ?? 'exterior'
      const revealEnabled = st.qualityOverrides.wallReveal ?? true
      const isExterior = wall.thickness === 'external'
      // Exterior doors fade with their wall; interior doors only in 'all' scope.
      const participates = isExterior || revealScope === 'all'
      let target = 1
      if (participates && revealEnabled && fade > 0 && st.cameraMode === 'orbit') {
        camera.getWorldDirection(FWD)
        let nx = -Math.sin(angle)
        let nz = Math.cos(angle)
        if (isExterior) {
          // Orient outward by probing which side of the wall is a room (robust on
          // notched/non-rectangular plans); fall back to "away from plan centre".
          const out = isInterior ? orientOutward(doorX, doorZ, nx, nz, isInterior, 0.3) : null
          if (out) {
            nx = out.nx
            nz = out.nz
          } else if (nx * (doorX - cx) + nz * (doorZ - cz) < 0) {
            nx = -nx
            nz = -nz
          }
        } else if (nx * FWD.x + nz * FWD.z > 0) {
          // Interior partition door: orient the normal toward the camera so it
          // fades when the camera faces the partition (revealing the room behind).
          nx = -nx
          nz = -nz
        }
        // Fade in lockstep with the host wall's own reveal, from the camera's look
        // direction only (ORIENTATION-ONLY — unaffected by zoom / pan) — the leaf
        // smoothly fades its opacity like the wall rather than hard-hiding. Same
        // angle-graded curve as the wall (WALL-REVEAL-ANGLE-GRADED), plus the
        // wall's corner-spread (WALL-REVEAL-CORNER-SPREAD) so the leaf doesn't
        // stay opaque in a wall that faded because its corner neighbour did.
        const toward = facingToward(FWD.x, FWD.z, nx, nz)
        let s = revealStrength(toward)
        if (neighborIds && toward > SPREAD_ONSET && neighborIds.length > 0) {
          let maxNb = 0
          for (const id of neighborIds) {
            const nb = getWallOwnStrength(id)
            if (nb > maxNb) maxNb = nb
          }
          s = Math.max(s, cornerSpreadStrength(toward, maxNb))
        }
        target = revealTargetOpacityForFade(fade, s)
      }
      opacityRef.current += (target - opacityRef.current) * 0.18
      const cur = opacityRef.current
      const root = rootRef.current
      root.visible = cur > 0.02
      const fading = cur < 0.985
      const changed = fading !== transparentRef.current
      transparentRef.current = fading
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return
        const m = o.material as MeshStandardMaterial
        // Capture each material's authored base opacity once (1 for the solid
        // leaf/handle, 0.55 for the glazed vision panel) so the fade scales it
        // rather than flattening the glass to opaque.
        if (m.userData.__baseOpacity == null) m.userData.__baseOpacity = m.opacity
        const base = m.userData.__baseOpacity as number
        const glass = base < 1
        m.transparent = glass || fading
        m.opacity = base * cur
        // depthWrite stays ON at all times (WALL-FADE-DEPTHWRITE, incl. glass) so
        // the leaf fades as one clean self-occluding surface that sorts
        // consistently with the wall, instead of popping 2D↔3D mid-fade.
        m.depthWrite = true
        if (changed) m.needsUpdate = true
      })
    }
    const target = isOpen ? SWING_RAD : 0
    if (angleRef.current !== target) {
      const step = (SWING_RAD / SWING_SECONDS) * dt
      angleRef.current =
        Math.abs(target - angleRef.current) < step
          ? target
          : angleRef.current + Math.sign(target - angleRef.current) * step
    }
    const swingSign = swing === 'left' ? 1 : -1
    if (isSliding) {
      // Slide the leaf along the wall axis (local X) — no rotation. Open = the
      // leaf fully translated by its own width so it clears the opening and
      // overlaps the adjacent wall segment.
      const t = angleRef.current / SWING_RAD
      if (slideRef.current)
        slideRef.current.position.x = centerLocalX + slideDir * t * opening.width
    } else if (isDouble) {
      // Two half-width leaves hinged at BOTH jambs, swinging to the same side:
      // mirror rotations (opposite signs) about the two jamb pivots.
      if (leafARef.current) leafARef.current.rotation.y = swingSign * angleRef.current
      if (leafBRef.current) leafBRef.current.rotation.y = -swingSign * angleRef.current
    } else if (isBifold) {
      // Simple honest visual (not true accordion kinematics): the outer leaf
      // swings 0→45° at the jamb, the inner leaf folds a further 0→90° at the
      // mid-fold hinge — both in the SAME rotational sense — so a fully open
      // bifold reads as outer 45° / inner 135° from the wall.
      const t = angleRef.current / SWING_RAD
      if (swingRef.current) swingRef.current.rotation.y = swingSign * t * (Math.PI / 4)
      if (foldRef.current) foldRef.current.rotation.y = swingSign * t * (Math.PI / 2)
    } else if (swingRef.current) {
      swingRef.current.rotation.y = swingSign * angleRef.current
    }
  })

  if (len === 0) return null
  if (leafAbsent) return null

  // Shared click handler (orbit mode is view-only — see Door.tsx).
  const onLeafToggle = (e: { stopPropagation: () => void }) => {
    if (!dispatchWalkInteract(useStore.getState(), opening.id, toggle)) return
    e.stopPropagation()
  }

  if (isSliding) {
    // Single full-width leaf that slides along the wall (no swing), mounted
    // barn-door style just PROUD of the wall on the room (swing) side so the
    // parked leaf stays visible against the adjacent wall instead of vanishing
    // into the wall cavity. `slideRef` starts centred in the opening and
    // translates by up to its own width (see the `useFrame` slide branch). Local
    // +Z is the wall's 'right' normal, so the room side is +Z for a right swing.
    const slideZ = (swing === 'right' ? 1 : -1) * (LEAF_THICK / 2 + 0.11)
    return (
      <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
        <group ref={slideRef} position={[centerLocalX, opening.sill, 0]}>
          <mesh
            position={[0, height / 2, slideZ]}
            onClick={onLeafToggle}
            material={leafMat}
            castShadow
          >
            <boxGeometry args={[opening.width, height, LEAF_THICK]} />
          </mesh>
        </group>
      </group>
    )
  }

  if (isDouble) {
    // Two half-width leaves hinged at BOTH jambs, swinging to the same side
    // (mirror rotations in the `useFrame` double branch). Leaf A pivots at the
    // start jamb and extends toward the centre (+X); leaf B pivots at the end
    // jamb and extends toward the centre (−X).
    const halfWidth = opening.width / 2
    const dblLeaf = (key: string, dir: 1 | -1) => (
      <mesh
        key={key}
        position={[(dir * halfWidth) / 2, height / 2, 0]}
        onClick={onLeafToggle}
        material={leafMat}
        castShadow
      >
        <boxGeometry args={[halfWidth, height, LEAF_THICK]} />
      </mesh>
    )
    return (
      <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
        <group ref={leafARef} position={[startJambX, opening.sill, 0]}>
          {dblLeaf('leafA', 1)}
        </group>
        <group ref={leafBRef} position={[endJambX, opening.sill, 0]}>
          {dblLeaf('leafB', -1)}
        </group>
      </group>
    )
  }

  if (isBifold) {
    // Two half-width leaves: the outer leaf hinges at the jamb (`swingRef`,
    // reusing the same click/toggle + fade infrastructure as the single-leaf
    // door); the inner leaf hinges at the outer leaf's far edge (`foldRef`) and
    // folds further in the same rotational sense (see the `useFrame` above).
    const halfWidth = opening.width / 2
    const onLeafClick = (e: { stopPropagation: () => void }) => {
      // Orbit mode is view-only (VIEW-EDIT-SPLIT) — see Door.tsx.
      if (!dispatchWalkInteract(useStore.getState(), opening.id, toggle)) return
      e.stopPropagation()
    }
    const leaf = (key: string) => (
      <mesh
        key={key}
        position={[(direction * halfWidth) / 2, 0, 0]}
        onClick={onLeafClick}
        material={leafMat}
        castShadow
      >
        <boxGeometry args={[halfWidth, height, LEAF_THICK]} />
      </mesh>
    )
    return (
      <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
        <group ref={swingRef} position={[hingeLocalX, opening.sill, 0]}>
          <group position={[0, height / 2, 0]}>{leaf('outer')}</group>
          <group ref={foldRef} position={[direction * halfWidth, height / 2, 0]}>
            {leaf('inner')}
          </group>
        </group>
      </group>
    )
  }

  return (
    <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group ref={swingRef} position={[hingeLocalX, opening.sill, 0]}>
        <group position={[(direction * opening.width) / 2, height / 2, 0]}>
          <mesh
            onClick={(e) => {
              // Orbit mode is view-only (VIEW-EDIT-SPLIT) — see Door.tsx.
              if (!dispatchWalkInteract(useStore.getState(), opening.id, toggle)) return
              e.stopPropagation()
            }}
            material={leafMat}
            castShadow
          >
            <boxGeometry args={[opening.width, height, LEAF_THICK]} />
          </mesh>
          {/* Recessed panels (two per face) for a panelled-door look — the
              default 'panel' style only; 'flush' is a plain slab. */}
          {(opening.style ?? 'panel') === 'panel'
            ? [1, -1].map((face) =>
                [
                  { y: height * 0.24, h: height * 0.34 },
                  { y: -height * 0.22, h: height * 0.42 },
                ].map((p, i) => (
                  <mesh
                    key={`${face}.${i}`}
                    position={[0, p.y, face * (LEAF_THICK / 2 + 0.001)]}
                    rotation={[0, face === 1 ? 0 : Math.PI, 0]}
                  >
                    <planeGeometry args={[opening.width * 0.62, p.h]} />
                    <meshStandardMaterial
                      color={opening.color ? shade(opening.color, 0.82) : DEFAULT_PANEL}
                      roughness={0.75}
                    />
                  </mesh>
                )),
              )
            : null}
          {/* 'glazed': a frosted glass vision panel in the upper third. */}
          {opening.style === 'glazed' ? (
            <mesh position={[0, height * 0.22, 0]}>
              <boxGeometry args={[opening.width * 0.62, height * 0.4, LEAF_THICK + 0.004]} />
              <meshStandardMaterial
                color="#cddbe4"
                transparent
                opacity={0.55}
                roughness={0.25}
                metalness={0}
              />
            </mesh>
          ) : null}
        </group>
        {/* Handle. */}
        <group position={[direction * (opening.width - 0.06), Math.min(0.95, height - 0.1), 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
            <MetalMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
          {[0.06, -0.06].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <sphereGeometry args={[0.025, 16, 12]} />
              <MetalMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}
