import { RoundedBox } from '@react-three/drei'
import { getSolidMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Soundbar — a slim media speaker that mounts on the wall just below a TV (or
 * sits on a console). A dark rounded enclosure with a speaker-cloth front, a
 * subtle indicator LED, and an optional separate subwoofer block to one side.
 * Mounted (faces +Z, offset to `mountHeight`); place it on the media wall.
 */
export function Soundbar({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.0)
  const centerY = readNum(props, 'mountHeight', 1.0)
  const color = readStr(props, 'color', '#202024')
  const grille = readStr(props, 'grille', 'fabric')
  const sub = readStr(props, 'sub', 'none')

  const h = 0.075
  const d = 0.09
  const bodyMat = getSolidMaterial(color, 0.5, 0.2)
  // Speaker cloth (woven grey) vs a perforated metal grille.
  const grilleMat =
    grille === 'metal'
      ? { color: '#3a3a3e', roughness: 0.4, metalness: 0.6 }
      : { color: '#33332f', roughness: 0.95, metalness: 0 }

  return (
    <group position={[0, centerY, 0]}>
      {/* Enclosure */}
      <RoundedBox
        args={[width, h, d]}
        radius={0.015}
        smoothness={3}
        castShadow
        receiveShadow
        material={bodyMat}
      />
      {/* Speaker-cloth front face */}
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[width - 0.03, h - 0.018]} />
        <meshStandardMaterial {...grilleMat} />
      </mesh>
      {/* Indicator LED */}
      <mesh position={[width / 2 - 0.06, -h / 2 + 0.018, d / 2 + 0.004]}>
        <circleGeometry args={[0.004, 8]} />
        <meshStandardMaterial color="#6fd0ff" emissive="#6fd0ff" emissiveIntensity={0.8} />
      </mesh>
      {/* Optional subwoofer block, set to the right and slightly forward */}
      {sub === 'wireless' && (
        <RoundedBox
          args={[0.22, 0.34, 0.22]}
          radius={0.015}
          smoothness={3}
          castShadow
          receiveShadow
          position={[width / 2 + 0.3, -centerY + 0.17, 0.06]}
          material={bodyMat}
        />
      )}
    </group>
  )
}
