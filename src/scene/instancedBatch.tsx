import { useLayoutEffect, useRef } from 'react'
import {
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'

/** One placed instance: position, per-axis scale, Y-rotation. */
export interface BatchInstance {
  px: number
  py: number
  pz: number
  rot: number
  sx: number
  sy: number
  sz: number
}

const SCRATCH_M = new Matrix4()
const SCRATCH_Q = new Quaternion()
const SCRATCH_P = new Vector3()
const SCRATCH_S = new Vector3()
const Y_AXIS = new Vector3(0, 1, 0)

/**
 * An instanced batch of one shared geometry + material placed by
 * (position, Y-rotation, per-axis scale). Collapses many repeated meshes into a
 * single draw call. Matrices are composed once in a `useLayoutEffect`;
 * `frustumCulled={false}` keeps the whole batch alive (its bounds cover a wide
 * ring). Geometry/material lifecycles are owned by the caller (dispose them).
 */
export function InstancedBatch({
  geometry,
  material,
  instances,
}: {
  geometry: BufferGeometry
  material: Material
  instances: BatchInstance[]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < instances.length; i++) {
      const it = instances[i]!
      SCRATCH_P.set(it.px, it.py, it.pz)
      SCRATCH_Q.setFromAxisAngle(Y_AXIS, it.rot)
      SCRATCH_S.set(it.sx, it.sy, it.sz)
      SCRATCH_M.compose(SCRATCH_P, SCRATCH_Q, SCRATCH_S)
      mesh.setMatrixAt(i, SCRATCH_M)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  )
}
