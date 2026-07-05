import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, type Group, Mesh, type MeshStandardMaterial, Vector3 } from 'three'
import type { PlanOpening, PlanWall } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { isCurvedWall, pointAtArcLength } from '../floorplan/wallArc'
import { dispatchWalkInteract } from '../state/editing'
import { useStore } from '../state/store'
import { FLAT } from './constants'
import { orientOutward, WALL_TRANSLUCENT_MIN, wallRevealFacing } from './walls/wallRevealMath'

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
 */
export function PlanDoorLeaf({
  wall,
  opening,
  cx,
  cz,
  isInterior,
}: {
  wall: PlanWall
  opening: PlanOpening
  /** Plan-centre X/Z, used as the fallback reference for the camera-facing fade. */
  cx: number
  cz: number
  /** Point-in-room test used to orient the host wall's outward normal (robust on
   *  non-rectangular plans); falls back to the plan-centre reference if absent. */
  isInterior?: (x: number, z: number) => boolean
}) {
  const isOpen = useStore((s) => s.doors[opening.id]?.open ?? false)
  const toggle = useStore((s) => s.toggleDoor)
  const rootRef = useRef<Group>(null)
  const swingRef = useRef<Group>(null!)
  const angleRef = useRef(0)
  const opacityRef = useRef(1)
  const transparentRef = useRef(false)
  const { camera } = useThree()

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
  let doorX: number // door world centre (fade test)
  let doorZ: number
  if (isCurvedWall(wall)) {
    const p = pointAtArcLength(wall, sCentre) // angle = atan2(dx, dz)
    midX = p.x
    midZ = p.z
    angle = Math.atan2(Math.cos(p.angle), Math.sin(p.angle)) // → atan2(dz, dx) convention
    hingeLocalX = hinge === 'start' ? -opening.width / 2 : opening.width / 2
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
    doorX = wall.start[0] + dx * sCentre
    doorZ = wall.start[1] + dz * sCentre
  }

  useFrame((_, dt) => {
    // Hide with the host wall when an EXTERNAL wall sits between the orbit camera
    // and the plan centre (internal partitions never fade, so their doors stay).
    // Orientation-based (matches FadeWall): test the wall's outward broad-face
    // normal against the camera→centre direction, NOT the door's position
    // relative to centre — so a door in a long near wall hides together with its
    // wall instead of only when it happens to sit on the view axis.
    if (rootRef.current) {
      const st = useStore.getState()
      const revealMode = st.wallRevealMode ?? 'translucent'
      const revealScope = st.wallRevealScope ?? 'exterior'
      const revealEnabled = st.qualityOverrides.wallReveal ?? true
      const isExterior = wall.thickness === 'external'
      // Exterior doors fade with their wall; interior doors only in 'all' scope.
      const participates = isExterior || revealScope === 'all'
      let target = 1
      if (participates && revealEnabled && revealMode !== 'opaque' && st.cameraMode === 'orbit') {
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
        // smoothly fades its opacity like the wall rather than hard-hiding.
        const factor = wallRevealFacing(FWD.x, FWD.z, nx, nz)
        target = revealMode === 'auto-hide' ? factor : Math.max(WALL_TRANSLUCENT_MIN, factor)
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
    if (swingRef.current)
      swingRef.current.rotation.y = (swing === 'left' ? 1 : -1) * angleRef.current
  })

  if (len === 0) return null

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
            castShadow
          >
            <boxGeometry args={[opening.width, height, LEAF_THICK]} />
            <meshStandardMaterial color={opening.color ?? DEFAULT_LEAF} roughness={0.7} />
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
            <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
          {[0.06, -0.06].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <sphereGeometry args={[0.025, 16, 12]} />
              <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}
