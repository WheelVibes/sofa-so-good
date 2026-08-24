import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Group, Mesh, type MeshStandardMaterial } from 'three'
import { resolveDoorLeafMaterialKind } from '../floorplan/doorMaterial'
import { MetalMaterial } from '../furniture/primitives/MetalMaterial'
import {
  getMetalMaterial,
  getPaintedMaterial,
  getVinylMaterial,
  getWoodMaterial,
} from '../materials/furnitureMaterials'
import { dispatchWalkInteract } from '../state/editing'
import { useStore } from '../state/store'
import { DOORS, FLAT, WALLS } from './constants'
import type { DoorSpec, WallSpec } from './types'
import { getWallOpacity } from './walls/wallReveal'

const SWING_RAD = Math.PI / 2
const SWING_SECONDS = 0.2
const DEFAULT_LEAF = '#9d7c54'
const DEFAULT_PANEL = '#8a6c48'
// The HDB metal security gate opens a touch wider/faster-reading than the
// door leaf it's paired with (it folds flat against the exterior wall).
const GATE_OPEN_FACTOR = 1.15

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId)
}

/**
 * HDB metal security gate — hinged at the SAME jamb as its door leaf but
 * mounted on the wall's EXTERIOR face (offset opposite the door's swing side)
 * and swinging the opposite rotation sign (gates fold flat against the
 * outside wall rather than into the room). Thin outer frame + round vertical
 * bars + two horizontal rails, all sharing ONE cloned metal material (the
 * wall-fade traverse mutates opacity per mesh, so every member must point at
 * the same instance rather than a shared cache entry other doors also use).
 */
function SecurityGate({
  spec,
  wall,
  direction,
  swingSign,
  hingeLocalX,
  angleRef,
}: {
  spec: DoorSpec
  wall: WallSpec
  direction: 1 | -1
  swingSign: 1 | -1
  hingeLocalX: number
  angleRef: { current: number }
}) {
  const gateRef = useRef<Group>(null)
  const gateMat = useMemo(() => getMetalMaterial('#6d7177', 'satin').clone(), [])
  useEffect(() => () => gateMat.dispose(), [gateMat])

  const wallThick =
    wall.thickness === 'external' ? FLAT.externalWallThickness : FLAT.internalWallThickness
  const gateThick = 0.03
  // Opposite side from where the door swings INTO the room (the exterior).
  // The leaf's swing (`rotation.y = swingSign·θ`) carries its tip toward
  // local `−swingSign·Z` — that's the room side — so the exterior face this
  // gate mounts on is the `+swingSign·Z` side.
  const gateZSign = swingSign
  const gateZ = gateZSign * (wallThick / 2 + gateThick / 2 + 0.01)
  const gateSwingSign = -swingSign

  useFrame(() => {
    if (gateRef.current) {
      gateRef.current.rotation.y = gateSwingSign * (angleRef.current ?? 0) * GATE_OPEN_FACTOR
    }
  })

  const width = spec.width
  const height = FLAT.doorHeight
  const memberT = 0.025
  const barCount: number = 8
  const barSpan = width - memberT * 2

  return (
    <group position={[hingeLocalX, 0, gateZ]} ref={gateRef}>
      <group position={[(direction * width) / 2, height / 2, 0]}>
        {/* Outer frame: top/bottom rails + two stiles. */}
        <mesh position={[0, height / 2 - memberT / 2, 0]} material={gateMat} castShadow>
          <boxGeometry args={[width, memberT, gateThick]} />
        </mesh>
        <mesh position={[0, -height / 2 + memberT / 2, 0]} material={gateMat} castShadow>
          <boxGeometry args={[width, memberT, gateThick]} />
        </mesh>
        <mesh position={[-width / 2 + memberT / 2, 0, 0]} material={gateMat} castShadow>
          <boxGeometry args={[memberT, height, gateThick]} />
        </mesh>
        <mesh position={[width / 2 - memberT / 2, 0, 0]} material={gateMat} castShadow>
          <boxGeometry args={[memberT, height, gateThick]} />
        </mesh>
        {/* Two mid horizontal rails. */}
        {[height * 0.16, -height * 0.16].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={gateMat} castShadow>
            <boxGeometry args={[width - memberT * 2, memberT * 0.8, gateThick]} />
          </mesh>
        ))}
        {/* Vertical round bars. */}
        {Array.from({ length: barCount }, (_, i) => {
          const t = barCount === 1 ? 0.5 : i / (barCount - 1)
          const x = -barSpan / 2 + t * barSpan
          return (
            // cylinderGeometry is already Y-aligned — no rotation, the bar
            // stands vertically between the top/bottom frame rails.
            <mesh key={i} position={[x, 0, 0]} material={gateMat} castShadow>
              <cylinderGeometry args={[0.008, 0.008, height - memberT * 2, 8]} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function DoorLeaf({ spec }: { spec: DoorSpec }) {
  const wall = findWall(spec.wallId)
  const isOpen = useStore((s) => s.doors[spec.id]?.open ?? spec.defaultOpen)
  // BSJ-4: a bare-BTO / strip-out handover leaves this leaf ABSENT (opening +
  // frame stay via the wall cutout; only the swinging leaf is gone).
  const leafAbsent = useStore((s) => s.doors[spec.id]?.leaf === 'none')
  const toggle = useStore((s) => s.toggleDoor)
  const swingRef = useRef<Group>(null!)
  // Bifold only: the inner leaf's fold hinge (mirrors `PlanDoorLeaf`).
  const foldRef = useRef<Group>(null)
  const rootRef = useRef<Group>(null)
  const angleRef = useRef(0)
  // Last-applied `transparent` flag — toggling it at runtime needs a
  // `needsUpdate` for the blend to engage (see WallSegment).
  const transparentRef = useRef(false)

  // The household shelter's blast door is a thick reinforced steel slab, not
  // a panelled timber leaf — a recognisable HDB detail. Recognised either by
  // its id (legacy) or by an explicit `material: 'metal'` with no style
  // override (the SPEC-driven path — `constants.ts` now sets this directly).
  const blast = spec.id === 'door-householdShelter' || (spec.material === 'metal' && !spec.style)
  const style = spec.style ?? 'panel'
  const isBifold = !blast && style === 'bifold'
  const isGlazed = !blast && style === 'glazed'
  const isFlush = !blast && style === 'flush'
  const isPanel = !blast && !isBifold && !isGlazed && !isFlush

  const leafMaterialKind = blast ? 'metal' : resolveDoorLeafMaterialKind(spec)
  const leafColor = spec.color ?? (blast ? '#9aa0a6' : DEFAULT_LEAF)
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

  useFrame((_, dt) => {
    // Fade the door leaf WITH its host wall during the orbit reveal (so an opaque
    // leaf doesn't float in a translucent external wall).
    const root = rootRef.current
    if (root) {
      const wallOp = getWallOpacity(spec.wallId)
      root.visible = wallOp > 0.02
      const fading = wallOp < 0.985
      const changed = fading !== transparentRef.current
      transparentRef.current = fading
      root.traverse((o) => {
        if (!(o instanceof Mesh)) return
        const m = o.material as MeshStandardMaterial
        m.transparent = fading
        m.opacity = wallOp
        // Keep depthWrite ON at all times (WALL-FADE-DEPTHWRITE, matching the
        // host wall + WallSegment). Any threshold that flips it — the old 0.6, or
        // even the wall's own ~0.985 — snapped the leaf between a see-through
        // blend (front/back/panel faces don't self-occlude → flat "2D") and solid
        // self-occluding "3D" mid-fade, popping the door thickness as you orbited.
        // Writing depth constantly keeps the leaf a clean self-occluding surface
        // that just gets more transparent, and sorts consistently with the wall
        // (no bright bleed through their overlap).
        m.depthWrite = true
        if (changed) m.needsUpdate = true
      })
    }
    const target = isOpen ? SWING_RAD : 0
    if (angleRef.current !== target) {
      const step = (SWING_RAD / SWING_SECONDS) * dt
      if (Math.abs(target - angleRef.current) < step) {
        angleRef.current = target
      } else {
        angleRef.current += Math.sign(target - angleRef.current) * step
      }
    }
    const swingSign = spec.swing === 'left' ? 1 : -1
    if (isBifold) {
      // Simple honest visual (matches `PlanDoorLeaf`): the outer leaf swings
      // 0→45° at the jamb, the inner leaf folds a further 0→90° at the
      // mid-fold hinge, same rotational sense.
      const t = angleRef.current / SWING_RAD
      if (swingRef.current) swingRef.current.rotation.y = swingSign * t * (Math.PI / 4)
      if (foldRef.current) foldRef.current.rotation.y = swingSign * t * (Math.PI / 2)
    } else if (swingRef.current) {
      swingRef.current.rotation.y = swingSign * angleRef.current
    }
  })

  if (!wall) return null
  if (leafAbsent) return null
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  const hingeLocalX =
    spec.hinge === 'start' ? spec.offset - length / 2 : spec.offset + spec.width - length / 2
  const direction = spec.hinge === 'start' ? 1 : -1
  const swingSign = spec.swing === 'left' ? 1 : -1
  const leafThick = blast ? 0.14 : FLAT.doorThickness
  const height = FLAT.doorHeight

  // Lever handle (flush/glazed — the UPVC/aluminium laminate doors in the
  // spec photos carry a modern lever on a rectangular rose, not a brass
  // knob) vs the classic knob (panel) vs a small recessed pull (bifold).
  const halfWidth = spec.width / 2

  return (
    <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {isBifold ? (
        <group ref={swingRef} position={[hingeLocalX, 0, 0]}>
          <group position={[(direction * halfWidth) / 2, height / 2, 0]}>
            <mesh
              onClick={(e) => {
                if (!dispatchWalkInteract(useStore.getState(), spec.id, toggle)) return
                e.stopPropagation()
              }}
              material={leafMat}
              castShadow
            >
              <boxGeometry args={[halfWidth, height, leafThick]} />
            </mesh>
            {/* Recessed pull (bifold's small hardware detail). */}
            <mesh
              position={[(direction * halfWidth) / 2 - direction * 0.04, 0, leafThick / 2 + 0.006]}
            >
              <boxGeometry args={[0.03, 0.14, 0.012]} />
              <MetalMaterial color="#c9ccd1" metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
          <group ref={foldRef} position={[direction * halfWidth, height / 2, 0]}>
            <mesh
              onClick={(e) => {
                if (!dispatchWalkInteract(useStore.getState(), spec.id, toggle)) return
                e.stopPropagation()
              }}
              material={leafMat}
              castShadow
            >
              <boxGeometry args={[halfWidth, height, leafThick]} />
            </mesh>
          </group>
        </group>
      ) : (
        <group ref={swingRef} position={[hingeLocalX, 0, 0]}>
          <group position={[(direction * spec.width) / 2, height / 2, 0]}>
            <mesh
              onClick={(e) => {
                // Orbit mode is view-only (VIEW-EDIT-SPLIT) — a door click only
                // toggles the swing in walk mode; in orbit it falls through to
                // whatever's behind (no selection semantics on a door leaf).
                if (!dispatchWalkInteract(useStore.getState(), spec.id, toggle)) return
                e.stopPropagation()
              }}
              material={leafMat}
              castShadow
            >
              <boxGeometry args={[spec.width, height, leafThick]} />
            </mesh>
            {blast ? (
              /* Bolt grid on the front face of the blast door. */
              [-1, 1].map((face) =>
                [-0.7, -0.35, 0, 0.35, 0.7].map((fy) =>
                  [-0.35, 0.35].map((fx) => (
                    <mesh
                      key={`${face}.${fy}.${fx}`}
                      position={[
                        fx * spec.width * 0.5,
                        fy * (height / 2 - 0.1),
                        face * (leafThick / 2 + 0.01),
                      ]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
                      <MetalMaterial color="#6d7177" roughness={0.5} metalness={0.7} />
                    </mesh>
                  )),
                ),
              )
            ) : isPanel ? (
              /* Recessed panels (two per face) for a panelled-door look. */
              [1, -1].map((face) =>
                [
                  { y: height * 0.24, h: height * 0.34 },
                  { y: -height * 0.22, h: height * 0.42 },
                ].map((p, i) => (
                  <mesh
                    key={`${face}.${i}`}
                    position={[0, p.y, face * (leafThick / 2 + 0.001)]}
                    rotation={[0, face === 1 ? 0 : Math.PI, 0]}
                  >
                    <planeGeometry args={[spec.width * 0.62, p.h]} />
                    <meshStandardMaterial
                      color={spec.color ? spec.color : DEFAULT_PANEL}
                      roughness={0.75}
                    />
                  </mesh>
                )),
              )
            ) : isGlazed ? (
              /* Aluminium-framed glazed panel — a large tinted glass inset. */
              <mesh position={[0, height * 0.02, 0]}>
                <boxGeometry args={[spec.width * 0.7, height * 0.55, leafThick + 0.006]} />
                <meshStandardMaterial
                  color="#a9bcc9"
                  transparent
                  opacity={0.45}
                  roughness={0.15}
                  metalness={0}
                />
              </mesh>
            ) : null}
          </group>
          {/* Handle. */}
          {isFlush || isGlazed ? (
            /* Modern stainless lever on a rectangular rose, both faces. */
            <group position={[direction * (spec.width - 0.08), height * 0.42, 0]}>
              {[1, -1].map((face) => (
                <group key={face} position={[0, 0, face * (leafThick / 2 + 0.002)]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.045, 0.09, 0.006]} />
                    <MetalMaterial color="#c9ccd1" metalness={0.75} roughness={0.3} />
                  </mesh>
                  <mesh
                    position={[direction * -0.06, 0, 0.02]}
                    rotation={[0, 0, Math.PI / 2]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.009, 0.009, 0.12, 12]} />
                    <MetalMaterial color="#c9ccd1" metalness={0.75} roughness={0.3} />
                  </mesh>
                </group>
              ))}
            </group>
          ) : !blast ? (
            /* Classic knob (panel door). */
            <group position={[direction * (spec.width - 0.06), 0.95, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
                <MetalMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0, 0.06]} castShadow>
                <sphereGeometry args={[0.025, 16, 12]} />
                <MetalMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0, -0.06]} castShadow>
                <sphereGeometry args={[0.025, 16, 12]} />
                <MetalMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
              </mesh>
            </group>
          ) : null}
        </group>
      )}
      {spec.gate ? (
        <SecurityGate
          spec={spec}
          wall={wall}
          direction={direction}
          swingSign={swingSign}
          hingeLocalX={hingeLocalX}
          angleRef={angleRef}
        />
      ) : null}
    </group>
  )
}

export function Doors() {
  return (
    <group>
      {DOORS.map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  )
}
