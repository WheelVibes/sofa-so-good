import { useFrame } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import { type Mesh, type MeshStandardMaterial, Vector2 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../materials/types'
import {
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../materials/useMaterial'
import { SilentErrorBoundary } from '../scene/SilentErrorBoundary'
import { useStore } from '../state/store'
import { DOORS, WINDOWS } from './constants'
import { DoorLeaf } from './Door'
import { RoomFloor } from './floor/RoomFloor'
import type { ClippedWall, RoomShell as RoomShellData } from './roomShell'
import { WindowPane } from './Window'
import { wallThicknessMetres } from './wallSegments'

/** A clipped wall box, painted with the room's wall finish, that hides itself
 *  when the orbit camera is on its outward side — so you always see into the
 *  room (IKEA-planner-style camera-facing wall reveal). */
function WallBox({
  wall,
  center,
  material,
}: {
  wall: ClippedWall
  center: [number, number]
  material: MeshStandardMaterial
}) {
  const ref = useRef<Mesh>(null)
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const len = Math.hypot(ex - sx, ez - sz)
  const midX = (sx + ex) / 2
  const midZ = (sz + ez) / 2

  // Outward normal: from room centre toward the wall mid along the wall's
  // facing axis (the wall is axis-aligned).
  const toMid = new Vector2(midX - center[0], midZ - center[1])
  const horizontal = Math.abs(ez - sz) < 1e-3 // runs along X → faces ±Z
  const normal = horizontal
    ? new Vector2(0, Math.sign(toMid.y) || 1)
    : new Vector2(Math.sign(toMid.x) || 1, 0)

  useFrame((state) => {
    const m = ref.current
    if (!m) return
    const cam = state.camera.position
    const camDir = new Vector2(cam.x - midX, cam.z - midZ)
    m.visible = camDir.dot(normal) <= 0.05
  })

  if (len < 1e-6) return null
  const t = wallThicknessMetres(wall.spec)
  const h = wall.spec.topHeight ?? ceilingHeight
  const angle = Math.atan2(ez - sz, ex - sx)
  return (
    <mesh
      ref={ref}
      position={[midX, h / 2, midZ]}
      rotation={[0, -angle, 0]}
      castShadow={false}
      material={material}
    >
      <boxGeometry args={[len, h, t]} />
    </mesh>
  )
}

// Resolve a wall finish materialId to a MeshStandardMaterial, branching by
// kind exactly like the floor path so procedural/textured/solid all work.
function SolidWall(p: { def: SolidMaterialDef; wall: ClippedWall; center: [number, number] }) {
  return <WallBox {...p} material={useSolidMaterial(p.def)} />
}
function TexturedWall(p: {
  def: TexturedMaterialDef
  wall: ClippedWall
  center: [number, number]
}) {
  return <WallBox {...p} material={useTexturedMaterial(p.def)} />
}
function ProceduralWall(p: {
  def: ProceduralMaterialDef
  wall: ClippedWall
  center: [number, number]
}) {
  return <WallBox {...p} material={useProceduralMaterial(p.def)} />
}

function RoomWall({
  materialId,
  wall,
  center,
}: {
  materialId: MaterialId
  wall: ClippedWall
  center: [number, number]
}) {
  const def = useMaterialDef(materialId)
  const inner =
    def.kind === 'textured' ? (
      <TexturedWall def={def} wall={wall} center={center} />
    ) : def.kind === 'procedural' ? (
      <ProceduralWall def={def} wall={wall} center={center} />
    ) : (
      <SolidWall def={def} wall={wall} center={center} />
    )
  return (
    <SilentErrorBoundary resetKey={def.id}>
      <Suspense fallback={null}>{inner}</Suspense>
    </SilentErrorBoundary>
  )
}

/** Renders only the walls of an isolated room (clipped to its footprint) plus
 *  per-rect floors. Floor + wall finishes follow the store's per-room picks
 *  (with accent-wall overrides). Lightweight: no ceiling, no skirting, no
 *  exterior. Windows/doors are filtered to the room's own openings. */
export function RoomShell({ shell }: { shell: RoomShellData }) {
  const roomId = shell.roomId
  const floorFinish = useStore((s) => s.finishes.floor[roomId])
  const wallFinish = useStore((s) => s.finishes.walls[roomId])
  const wallAccents = useStore(useShallow((s) => s.finishes.wallAccents))
  const windowSet = new Set(shell.windowIds)
  const doorSet = new Set(shell.doorIds)
  return (
    <group>
      {shell.rects.map((r, i) => (
        <RoomFloor
          key={`floor-${i}`}
          roomId={roomId}
          origin={[r.x0, r.z0]}
          width={r.x1 - r.x0}
          depth={r.z1 - r.z0}
          materialId={floorFinish}
        />
      ))}
      {shell.walls.map((w, i) => (
        <RoomWall
          key={`${w.wallId}-${i}`}
          // An accent override for this wall in this room wins over the room
          // wall finish, matching WallSegment's resolution.
          materialId={wallAccents[`${w.wallId}:${roomId}`] ?? wallFinish}
          wall={w}
          center={shell.center}
        />
      ))}
      {WINDOWS.filter((w) => windowSet.has(w.id)).map((w) => (
        <WindowPane key={w.id} spec={w} />
      ))}
      {DOORS.filter((d) => doorSet.has(d.id)).map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  )
}
