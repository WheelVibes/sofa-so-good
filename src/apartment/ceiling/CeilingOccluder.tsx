import { DoubleSide, MeshBasicMaterial } from 'three'
import { noExportUserData } from '../../export/sceneGltf'
import type { OccluderRect } from './occluderRects'

/**
 * Shared occluder material: writes NOTHING to the colour or depth buffer in the
 * beauty pass (so the orbit camera sees straight into the room), but the meshes
 * that use it are `castShadow` so they still render into the sun's shadow map.
 * `shadowSide: DoubleSide` guarantees the overhead sun captures the plane
 * regardless of winding. One instance, shared across every plane.
 */
const OCCLUDER_MAT = new MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  transparent: true,
  opacity: 0,
  side: DoubleSide,
})
OCCLUDER_MAT.shadowSide = DoubleSide

/**
 * Invisible shadow-casting "virtual ceiling" (ORBIT-CEILING). Orbit culls the
 * real ceiling so you can see in; without this the directional sun would pour
 * straight down onto the floor. These planes block the sun so the interior is
 * lit through windows / open doors only — "as if a ceiling were there" — while
 * staying invisible to the camera. Present in walk mode too, so both views are
 * physically consistent. Costs one extra shadow-caster draw per room, and only
 * where sun shadows already run (no-op when `shadowMapSize === 0`).
 */
export function CeilingOccluder({ rects }: { rects: OccluderRect[] }) {
  return (
    // EXPORT-HELPERS: never ship these to glTF/OBJ. They are a render-only stand-in
    // for the ceiling orbit culls — invisible via `colorWrite: false`, which is a
    // WebGL renderer state with NO glTF equivalent, so an importer would get solid
    // planes capping every room. In walk mode they are also coincident with the REAL
    // ceiling, which would z-fight.
    <group userData={noExportUserData()}>
      {rects.map((r) => (
        <mesh
          key={r.id}
          castShadow
          position={[r.cx, r.y, r.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={OCCLUDER_MAT}
        >
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  )
}
