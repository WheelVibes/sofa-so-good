import type { Camera, Material, Object3D } from 'three'
import { DoubleSide, MeshBasicMaterial } from 'three'
import { noExportUserData } from '../../export/sceneGltf'
import { STUDIO_KEY_SHADOW_TAG } from '../../scene/orbitStudioLook'
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
 * Per-object, per-shadow-camera opt-out (ORBIT-STUDIO-LOOK / OCCLUDER-OPT-OUT).
 *
 * `onBeforeShadow` is three's own hook: it fires immediately before
 * `renderBufferDirect`, with BOTH the shadow camera and the resolved depth
 * material in hand, which makes it the one place a caster can answer "not for
 * THIS light". Turning both write masks off makes the draw contribute nothing to
 * the key's depth texture (which is what actually occludes) and nothing to its
 * VSM variance target; `onAfterShadow` restores them unconditionally, so the
 * state cannot leak into the sun's pass however the two lights are ordered.
 *
 * **It mutates the depth material three hands it, and does NOT bring its own.**
 * A `customDepthMaterial` was the first shape and was reverted: three's
 * `_depthMaterial` is shared with every caster in the scene, so owning an
 * instance looked safer — but it is also the ONLY part of this change that
 * reaches WALK mode, where the occluder is present for consistency and casts
 * into the sun's map, and walk must be byte-identical. Two shadow draws never
 * interleave (`WebGLShadowMap.renderObject` is a serial recursion, one
 * `renderBufferDirect` at a time), so a restore in `onAfterShadow` is exactly as
 * safe and leaves walk on the identical engine path.
 */
function skipStudioKeyShadow(
  _renderer: unknown,
  _object: Object3D,
  _camera: Camera,
  shadowCamera: Camera,
  _geometry: unknown,
  depthMaterial: Material,
): void {
  const skip = shadowCamera.userData?.[STUDIO_KEY_SHADOW_TAG] === true
  depthMaterial.colorWrite = !skip
  depthMaterial.depthWrite = !skip
}

function restoreShadowWrites(
  _renderer: unknown,
  _object: Object3D,
  _camera: Camera,
  _shadowCamera: Camera,
  _geometry: unknown,
  depthMaterial: Material,
): void {
  depthMaterial.colorWrite = true
  depthMaterial.depthWrite = true
}

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
          // ORBIT-STUDIO-LOOK: block the SUN as always, but never the orbit
          // studio key — see `scene/orbitStudioLook.ts:STUDIO_KEY_SHADOW_TAG`
          // for why `layers` and a near plane both structurally cannot do this.
          onBeforeShadow={skipStudioKeyShadow}
          onAfterShadow={restoreShadowWrites}
        >
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  )
}
