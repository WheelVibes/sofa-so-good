import { RoundedBox } from '@react-three/drei'
import { getUpholsteryMaterial, getWoodMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Chaise lounge / daybed — a long reclining seat with an angled back at the
 * head end and a bolster cushion. `arm` adds a low arm on the back side.
 * Upholstered seat + back on slim wood/metal legs. Floor-anchored, centred,
 * faces +Z (you recline with your head toward −Z).
 */
export function ChaiseLounge({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.75) // length (along Z, head→foot)
  const depth = readNum(props, 'depth', 0.72) // seat width (X)
  const color = readStr(props, 'color', '#8a9aa0')
  const legColor = readStr(props, 'legColor', '#3a2c1d')
  const material = readStr(props, 'material', 'fabric')
  const sheen = readNum(props, 'sheen', 0)
  const arm = readStr(props, 'arm', 'one')

  const legH = 0.12
  const uphol = getUpholsteryMaterial(material, color, sheen)
  const legMat = getWoodMaterial(legColor, 0.4)
  const len = width

  return (
    <group>
      {/* Seat cushion (long axis along Z) */}
      <RoundedBox
        args={[depth, 0.16, len]}
        radius={0.05}
        smoothness={3}
        castShadow
        receiveShadow
        position={[0, legH + 0.08, 0]}
        material={uphol}
      />
      {/* Base under the cushion */}
      <mesh castShadow position={[0, legH + 0.16, 0]} material={uphol}>
        <boxGeometry args={[depth - 0.02, 0.04, len - 0.02]} />
      </mesh>
      {/* Angled backrest at the head (−Z) end */}
      <group position={[0, legH + 0.16, -len / 2 + 0.12]} rotation={[-0.32, 0, 0]}>
        <RoundedBox
          args={[depth, 0.5, 0.16]}
          radius={0.05}
          smoothness={3}
          castShadow
          position={[0, 0.22, 0]}
          material={uphol}
        />
      </group>
      {/* Bolster cushion at the head */}
      <mesh
        castShadow
        position={[0, legH + 0.26, -len / 2 + 0.22]}
        rotation={[0, 0, Math.PI / 2]}
        material={uphol}
      >
        <cylinderGeometry args={[0.09, 0.09, depth - 0.06, 16]} />
      </mesh>
      {/* Optional low arm on the back long side (+X) */}
      {arm === 'one' && (
        <RoundedBox
          args={[0.12, 0.34, len * 0.55]}
          radius={0.04}
          smoothness={3}
          castShadow
          position={[depth / 2 - 0.04, legH + 0.3, -len * 0.12]}
          material={uphol}
        />
      )}
      {/* Legs */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}.${sz}`}
            castShadow
            position={[sx * (depth / 2 - 0.08), legH / 2, sz * (len / 2 - 0.1)]}
            material={legMat}
          >
            <cylinderGeometry args={[0.022, 0.016, legH, 8]} />
          </mesh>
        )),
      )}
    </group>
  )
}
