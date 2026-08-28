import { useLayoutEffect, useRef } from 'react'
import { Color, type InstancedMesh, type Matrix4, Object3D } from 'three'

export interface BoxInstance {
  /** World-local centre of the box. */
  position: [number, number, number]
  /** Box dimensions (w, h, d) in metres — or, for {@link InstancedCylinders},
   *  the `[radius, length, radius]` scale of the unit cylinder. */
  size: [number, number, number]
  /** Optional per-instance Euler rotation (radians, XYZ order). Omitted → axis
   *  aligned. Baked into the instance matrix BETWEEN the translate and the
   *  size-scale, so a rotated instance is exactly equivalent to a `<mesh
   *  position rotation>` wrapping the same-dimensioned geometry (this is what
   *  lets the venetian-blind slats / drying-rack bars, which tilt, be
   *  instanced — the earlier translation-only pass had to skip them). */
  rotation?: [number, number, number]
  /** Optional per-instance colour (hex). Requires the child material to be
   *  white so the instance colour shows through unmodulated. */
  color?: string
}

/**
 * Bakes one instance into a transform matrix: translate to its centre, apply
 * its optional Euler rotation, then scale a unit (1×1×1) primitive to its size
 * — i.e. `T · R · S`, so the size-scale is innermost and a rotated instance
 * matches a `<mesh position rotation>` wrapping a `size`-dimensioned geometry
 * exactly. Pure (writes through the supplied scratch `Object3D` and returns its
 * `matrix`) so the instance-placement maths is testable without a renderer.
 * Shared by {@link InstancedBoxes} and {@link InstancedCylinders}.
 */
export function bakeInstanceMatrix(inst: BoxInstance, scratch: Object3D): Matrix4 {
  scratch.position.set(inst.position[0], inst.position[1], inst.position[2])
  scratch.scale.set(inst.size[0], inst.size[1], inst.size[2])
  // Apply the instance's rotation if any; reset to identity otherwise so a
  // caller reusing a dirtied Object3D between instances stays axis-aligned.
  const r = inst.rotation
  if (r) scratch.rotation.set(r[0], r[1], r[2])
  else scratch.rotation.set(0, 0, 0)
  scratch.updateMatrix()
  return scratch.matrix
}

/**
 * Renders many axis-aligned boxes as a single `InstancedMesh` — one draw call
 * instead of one-per-box. Used to collapse high-count repeated decoration
 * (shelf books, slats) inside a furniture primitive. Per-instance size is baked
 * into the instance matrix scale of a unit box; per-instance colour rides on
 * `instanceColor`. Pass the material as a child (`<meshStandardMaterial .../>`).
 */
export function InstancedBoxes({
  instances,
  castShadow,
  receiveShadow,
  userData,
  children,
}: {
  instances: BoxInstance[]
  castShadow?: boolean
  receiveShadow?: boolean
  /** Forwarded to the instanced mesh — lets a caller tag the whole bucket (e.g.
   *  `markWallOverlay()` so the wall-reveal fade can cull it). */
  userData?: Record<string, unknown>
  /** The shared material element, e.g. `<meshStandardMaterial .../>`. */
  children: React.ReactNode
}) {
  const ref = useRef<InstancedMesh>(null)
  const count = instances.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const color = new Color()
    let hasColor = false
    instances.forEach((inst, i) => {
      mesh.setMatrixAt(i, bakeInstanceMatrix(inst, dummy))
      if (inst.color) {
        color.set(inst.color)
        mesh.setColorAt(i, color)
        hasColor = true
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={ref}
      // key on count so the buffers are re-allocated when the instance count
      // changes (e.g. a parametric width change adds/removes books).
      key={count}
      args={[undefined as never, undefined as never, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={userData}
    >
      <boxGeometry args={[1, 1, 1]} />
      {children}
    </instancedMesh>
  )
}

/**
 * Renders many cylinders (rods, dowels, drying bars) as a single `InstancedMesh`
 * — one draw call instead of one mesh per rod. Each instance's `size` scales a
 * **unit cylinder** (radius 1, height 1, axis +Y) as `[radius, length, radius]`,
 * and its optional `rotation` tilts it (e.g. the drying rack's ±0.32 rad splayed
 * legs, or the horizontal bars rotated `PI/2` about Z). Pass the shared material
 * as a child (`<primitive object={mat} attach="material" />`). Only cylinders
 * with equal top/bottom radius are representable (a unit cylinder scaled) — that
 * covers every plain rod. `radialSegments` fixes the tessellation for all.
 * `thetaStart`/`thetaLength` cut a partial arc shared by every instance — e.g.
 * `thetaLength={Math.PI}` for half-round flutes (the fluted-partition ribs),
 * matching a per-mesh `cylinderGeometry(r, r, h, seg, 1, false, 0, Math.PI)`.
 */
export function InstancedCylinders({
  instances,
  radialSegments = 8,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  castShadow,
  receiveShadow,
  userData,
  children,
}: {
  instances: BoxInstance[]
  radialSegments?: number
  thetaStart?: number
  thetaLength?: number
  castShadow?: boolean
  receiveShadow?: boolean
  /** Forwarded to the instanced mesh — see {@link InstancedBoxes}. */
  userData?: Record<string, unknown>
  children: React.ReactNode
}) {
  const ref = useRef<InstancedMesh>(null)
  const count = instances.length

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const color = new Color()
    let hasColor = false
    instances.forEach((inst, i) => {
      mesh.setMatrixAt(i, bakeInstanceMatrix(inst, dummy))
      if (inst.color) {
        color.set(inst.color)
        mesh.setColorAt(i, color)
        hasColor = true
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={ref}
      key={count}
      args={[undefined as never, undefined as never, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      userData={userData}
    >
      <cylinderGeometry args={[1, 1, 1, radialSegments, 1, false, thetaStart, thetaLength]} />
      {children}
    </instancedMesh>
  )
}
