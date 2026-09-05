import { useEffect, useMemo } from 'react'
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three'
import { MetalMaterial } from '../furniture/primitives/MetalMaterial'
import {
  CYLINDER_LEN_M,
  CYLINDER_R_M,
  type DoorHardware,
  type DoorLeverFace,
  ESCUTCHEON_SIZE_M,
  HARDWARE_METAL,
  HINGE_KNUCKLE_R_M,
  HINGE_LEAF_LEN_M,
  HINGE_PLATE_T_M,
  HINGE_PLATE_W_M,
  KEYPAD_COLOR,
  KEYPAD_SIZE_M,
  KICK_PLATE_H_M,
  KICK_PLATE_T_M,
  LEVER_TUBE_R_M,
  LOCK_BODY_COLOR,
  LOCK_BODY_SIZE_M,
  ROSE_SIZE_M,
  RUBBER_COLOR,
  STOPPER_H_M,
  STOPPER_R_M,
  STOPPER_TIP_H_M,
  type Vec3,
} from './doorHardwareModel'
import { markWallOverlay } from './walls/wallReveal'

/**
 * DOOR-HARDWARE renderers — the meshes for `doorHardwareModel.ts`.
 *
 * Split in two because the parts belong to two different frames, both anchored at the
 * hinge (see the model's module note):
 *
 * - {@link DoorHardwareLeafParts} rides the SWING group (lever set, cylinder, digital
 *   lock, kick plate, and each hinge's leaf plate).
 * - {@link DoorHardwareStaticParts} sits in the door's STATIC group (hinge knuckles +
 *   jamb plates, which must not travel with the leaf, and the floor stopper).
 *
 * Both are tagged `markWallOverlay()` on their root group: like the existing handle and
 * the security gate, this hardware is another translucent layer composited over a fading
 * wall, so the leaf's fade traverse hides the whole branch instead of blending it.
 *
 * Every mesh carries a stable `name` (`door-hinge`, `door-lever`, `door-cylinder`,
 * `door-lock`, `door-kickplate`, `door-stopper`) so a scene probe can count them.
 */

const METAL = HARDWARE_METAL

function HardwareMetal() {
  return (
    <MetalMaterial color={METAL.color} metalness={METAL.metalness} roughness={METAL.roughness} />
  )
}

/** Swept lever tube: the polyline through a Catmull-Rom, so the 90° neck reads rounded. */
function LeverTube({ points }: { points: readonly Vec3[] }) {
  const geo = useMemo(() => {
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(p[0], p[1], p[2])),
      false,
      'catmullrom',
      0.4,
    )
    return new TubeGeometry(curve, 16, LEVER_TUBE_R_M, 8, false)
  }, [points])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <mesh name="door-lever" geometry={geo} castShadow>
      <HardwareMetal />
    </mesh>
  )
}

/** Rose + returned lever + escutcheon + privacy-turn cylinder, on ONE leaf face. */
function LeverFace({ set }: { set: DoorLeverFace }) {
  return (
    <group>
      <mesh name="door-rose" position={set.rose} castShadow>
        <boxGeometry args={ROSE_SIZE_M} />
        <HardwareMetal />
      </mesh>
      <LeverTube points={set.lever} />
      {/* Rounded end cap — a real lever never terminates in a raw tube mouth. */}
      <mesh name="door-lever" position={set.leverEnd} castShadow>
        <sphereGeometry args={[LEVER_TUBE_R_M, 10, 8]} />
        <HardwareMetal />
      </mesh>
      <mesh name="door-escutcheon" position={set.escutcheon} castShadow>
        <boxGeometry args={ESCUTCHEON_SIZE_M} />
        <HardwareMetal />
      </mesh>
      <mesh name="door-cylinder" position={set.cylinder} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[CYLINDER_R_M, CYLINDER_R_M, CYLINDER_LEN_M, 16]} />
        <HardwareMetal />
      </mesh>
    </group>
  )
}

/** Hardware that travels with the leaf. Render INSIDE the swing group. */
export function DoorHardwareLeafParts({ hw }: { hw: DoorHardware }) {
  return (
    <group userData={markWallOverlay()}>
      {hw.hinges.map((h) =>
        h.parts
          .filter((p) => p.rides === 'leaf')
          .map((p) => (
            <mesh
              key={`${h.y}.${p.position[0]}`}
              name="door-hinge"
              position={p.position}
              castShadow
            >
              <boxGeometry args={[HINGE_PLATE_W_M, HINGE_LEAF_LEN_M, HINGE_PLATE_T_M]} />
              <HardwareMetal />
            </mesh>
          )),
      )}
      {hw.lever.map((set) => (
        <LeverFace key={set.face} set={set} />
      ))}
      {hw.lock ? (
        <group>
          <mesh name="door-lock" position={hw.lock.position} castShadow>
            <boxGeometry args={LOCK_BODY_SIZE_M} />
            <meshStandardMaterial color={LOCK_BODY_COLOR} metalness={0.35} roughness={0.45} />
          </mesh>
          <mesh name="door-lock" position={hw.lock.keypad}>
            <boxGeometry args={[KEYPAD_SIZE_M[0], KEYPAD_SIZE_M[1], 0.002]} />
            <meshStandardMaterial color={KEYPAD_COLOR} metalness={0.1} roughness={0.08} />
          </mesh>
        </group>
      ) : null}
      {hw.kickPlate ? (
        <mesh name="door-kickplate" position={hw.kickPlate.position} castShadow>
          <boxGeometry args={[hw.kickPlate.width, KICK_PLATE_H_M, KICK_PLATE_T_M]} />
          <HardwareMetal />
        </mesh>
      ) : null}
    </group>
  )
}

/** Hardware that must NOT travel with the leaf. Render in the door's static group,
 *  offset to the hinge (`position={[hingeLocalX, 0, 0]}`). */
export function DoorHardwareStaticParts({ hw }: { hw: DoorHardware }) {
  return (
    <group userData={markWallOverlay()}>
      {hw.hinges.map((h) =>
        h.parts
          .filter((p) => p.rides === 'jamb')
          .map((p) =>
            p.kind === 'knuckle' ? (
              <mesh key={`k${h.y}`} name="door-hinge" position={p.position} castShadow>
                <cylinderGeometry
                  args={[HINGE_KNUCKLE_R_M, HINGE_KNUCKLE_R_M, HINGE_LEAF_LEN_M, 10]}
                />
                <HardwareMetal />
              </mesh>
            ) : (
              <mesh key={`p${h.y}`} name="door-hinge" position={p.position} castShadow>
                <boxGeometry args={[HINGE_PLATE_W_M, HINGE_LEAF_LEN_M, HINGE_PLATE_T_M]} />
                <HardwareMetal />
              </mesh>
            ),
          ),
      )}
      {hw.stopper ? (
        <group>
          <mesh
            name="door-stopper"
            position={[
              hw.stopper.position[0],
              (STOPPER_H_M - STOPPER_TIP_H_M) / 2,
              hw.stopper.position[2],
            ]}
            castShadow
          >
            <cylinderGeometry
              args={[STOPPER_R_M * 0.72, STOPPER_R_M, STOPPER_H_M - STOPPER_TIP_H_M, 14]}
            />
            <HardwareMetal />
          </mesh>
          <mesh name="door-stopper" position={hw.stopper.tip}>
            <cylinderGeometry
              args={[STOPPER_R_M * 0.68, STOPPER_R_M * 0.72, STOPPER_TIP_H_M, 14]}
            />
            <meshStandardMaterial color={RUBBER_COLOR} roughness={0.9} metalness={0} />
          </mesh>
        </group>
      ) : null}
    </group>
  )
}
