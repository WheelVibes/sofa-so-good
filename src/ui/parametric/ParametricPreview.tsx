import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  buildParametricObject,
  disposeParametricObject,
} from '../../furniture/parametric/buildObject'
import type { ParametricSpec } from '../../furniture/parametric/spec'

/** The generated piece, built by the SAME `buildParametricObject` the save
 *  path exports (so the preview can never drift from the saved GLB).
 *  Rebuilt + disposed when the spec changes. */
function GeneratedPiece({ spec }: { spec: ParametricSpec }) {
  const { object } = useMemo(() => buildParametricObject(spec), [spec])
  useEffect(() => () => disposeParametricObject(object), [object])
  return <primitive object={object} />
}

/** Live 3D preview canvas for the parametric dialog (PF1). Mirrors the GLB
 *  designer's lightweight preview: flat studio light + a ground grid, with
 *  `Bounds` keeping any size piece framed. */
export function ParametricPreview({ spec }: { spec: ParametricSpec }) {
  return (
    <Canvas shadows camera={{ position: [1.8, 1.5, 2.2], fov: 40 }}>
      <ambientLight intensity={0.7} />
      <hemisphereLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
      <gridHelper args={[6, 12, '#999', '#ccc']} />
      <Bounds fit clip observe margin={1.15}>
        <GeneratedPiece spec={spec} />
      </Bounds>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
