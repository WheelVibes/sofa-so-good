import { useLayoutEffect, useRef } from 'react'
import { Color, type InstancedMesh, Object3D } from 'three'

export interface BoxInstance {
  /** World-local centre of the box. */
  position: [number, number, number]
  /** Box dimensions (w, h, d) in metres. */
  size: [number, number, number]
  /** Optional per-instance colour (hex). Requires the child material to be
   *  white so the instance colour shows through unmodulated. */
  color?: string
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
  children,
}: {
  instances: BoxInstance[]
  castShadow?: boolean
  receiveShadow?: boolean
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
      dummy.position.set(inst.position[0], inst.position[1], inst.position[2])
      dummy.scale.set(inst.size[0], inst.size[1], inst.size[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
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
    >
      <boxGeometry args={[1, 1, 1]} />
      {children}
    </instancedMesh>
  )
}
