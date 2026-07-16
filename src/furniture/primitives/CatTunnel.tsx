import { useMemo } from 'react'
import { CatmullRomCurve3, DoubleSide, Quaternion, TubeGeometry, Vector3 } from 'three'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Cat tunnel — a soft fabric tube in two shapes: `straight` and `s-curve` (an
 * S-bend). Built as a `TubeGeometry` swept along a centre-line curve laid in the
 * floor plane at tube-radius height, rendered double-sided so the inside reads,
 * with a few rib rings (the collapsible-tunnel wire hoops) along its length.
 * Floor-anchored, footprint-centred, faces +Z (length runs along X). Real
 * metres.
 */
export function CatTunnel({ props }: { props: ParamProps }) {
  const shape = readStr(props, 'shape', 'straight')
  const length = readNum(props, 'length', 1.0)
  const diameter = readNum(props, 'diameter', 0.3)
  const color = readStr(props, 'color', '#7f8a94')
  const detail = useDetail()
  const radial = seg(20, detail)

  const radius = diameter / 2
  const half = length / 2

  const curve = useMemo(() => {
    const pts: Vector3[] = []
    if (shape === 's-curve') {
      const amp = Math.min(0.35, length * 0.28)
      const n = 8
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const x = -half + length * t
        const z = amp * Math.sin(t * Math.PI * 2)
        pts.push(new Vector3(x, radius, z))
      }
    } else {
      pts.push(new Vector3(-half, radius, 0))
      pts.push(new Vector3(0, radius, 0))
      pts.push(new Vector3(half, radius, 0))
    }
    return new CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  }, [shape, length, half, radius])

  const geom = useMemo(
    () => new TubeGeometry(curve, Math.max(24, radial * 2), radius, Math.max(10, radial), false),
    [curve, radius, radial],
  )

  // Rib rings: sample the curve, orient each torus so its axis follows the
  // tangent, so the hoops sit square across the tube.
  const ribs = useMemo(() => {
    const count = Math.max(3, Math.round(length / 0.28))
    const zAxis = new Vector3(0, 0, 1)
    const out: { pos: [number, number, number]; quat: [number, number, number, number] }[] = []
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t).normalize()
      // Torus lies in its local XY plane (symmetry axis = local Z); align that
      // axis with the tube tangent.
      const q = new Quaternion().setFromUnitVectors(zAxis, tan)
      out.push({ pos: [p.x, p.y, p.z], quat: [q.x, q.y, q.z, q.w] })
    }
    return out
  }, [curve, length])

  return (
    <group>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.98} side={DoubleSide} />
      </mesh>
      {ribs.map((rib, i) => (
        <mesh key={i} position={rib.pos} quaternion={rib.quat} castShadow>
          <torusGeometry args={[radius + 0.006, 0.01, 8, Math.max(16, radial)]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
    </group>
  )
}
