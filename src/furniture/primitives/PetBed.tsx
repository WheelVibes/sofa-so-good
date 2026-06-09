import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Pet bed — a cushioned dog/cat bed for the corner of a room. `shape` is a round
 * basket (a soft cushion inside a raised bolster ring) or a rectangular mat with
 * bolsters on three sides (the head end open). Floor-anchored, footprint-centred,
 * faces +Z (open side toward the room for the rectangular one). Real metres.
 */
export function PetBed({ props }: { props: ParamProps }) {
  const shape = readStr(props, 'shape', 'round')
  const color = readStr(props, 'color', '#9b6f52')
  const cushion = readStr(props, 'cushion', '#d8c9b0')
  const size = readNum(props, 'size', 0.7)
  const r = seg(28, useDetail())

  const bolsterMat = getFabricMaterial(color, 0.95)
  const cushionMat = getFabricMaterial(cushion, 0.9)

  if (shape === 'round') {
    const outer = size / 2
    const tube = outer * 0.26
    const ringY = tube * 0.85
    return (
      <group>
        {/* Inner cushion pad */}
        <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={cushionMat}>
          <cylinderGeometry args={[outer - tube * 0.7, outer - tube * 0.5, 0.1, r]} />
        </mesh>
        {/* Raised bolster ring */}
        <mesh castShadow receiveShadow position={[0, ringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[outer - tube, tube, 12, r]} />
          <primitive object={bolsterMat} attach="material" />
        </mesh>
      </group>
    )
  }

  // Rectangular mat: a base cushion with three raised bolsters (back + two sides),
  // the +Z end left open so the pet can step in.
  const w = size
  const d = size * 0.82
  const bolH = 0.13
  const bolT = 0.1
  return (
    <group>
      {/* Base cushion */}
      <mesh castShadow receiveShadow position={[0, 0.045, 0]} material={cushionMat}>
        <boxGeometry args={[w, 0.09, d]} />
      </mesh>
      {/* Back bolster (−Z) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, bolH / 2 + 0.05, -d / 2 + bolT / 2]}
        material={bolsterMat}
      >
        <boxGeometry args={[w, bolH, bolT]} />
      </mesh>
      {/* Side bolsters */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          castShadow
          receiveShadow
          position={[s * (w / 2 - bolT / 2), bolH / 2 + 0.05, 0]}
          material={bolsterMat}
        >
          <boxGeometry args={[bolT, bolH, d - bolT]} />
        </mesh>
      ))}
    </group>
  )
}
