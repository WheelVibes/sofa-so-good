import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/**
 * Upright piano — a tall cabinet body with a keyboard, fall-board, music desk
 * and a pedal lyre, on a low plinth. (A `digital` style is a slimmer console.)
 * Faces +Z (keyboard toward the player at +Z). Floor-anchored, centred.
 */
export function Piano({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#23211f')
  const finish = readStr(props, 'finish', 'gloss')
  const sheen = readNum(props, 'sheen', 0.6)
  const style = readStr(props, 'style', 'upright')

  const width = 1.45
  const depth = style === 'digital' ? 0.34 : 0.6
  const bodyH = style === 'digital' ? 0.85 : 1.2
  const body = getSurfaceMaterial(finish, color, 1.4, sheen)
  const keyW = { color: '#f4f1ea', roughness: 0.35 } as const
  const keyB = { color: '#1a1a1a', roughness: 0.3 } as const
  const plinthH = 0.06

  const keyY = 0.62
  const kbDepth = 0.16
  const kbZ = depth / 2 - 0.02

  return (
    <group>
      {/* Plinth */}
      <mesh castShadow receiveShadow position={[0, plinthH / 2, 0]} material={body}>
        <boxGeometry args={[width, plinthH, depth]} />
      </mesh>
      {/* Main body (upper cabinet) */}
      <mesh castShadow receiveShadow position={[0, plinthH + bodyH / 2, -0.04]} material={body}>
        <boxGeometry args={[width, bodyH, depth - 0.08]} />
      </mesh>
      {/* Keybed shelf jutting toward the player */}
      <mesh castShadow position={[0, keyY - 0.03, kbZ - kbDepth / 2]} material={body}>
        <boxGeometry args={[width - 0.04, 0.08, kbDepth + 0.06]} />
      </mesh>
      {/* White keys */}
      <mesh position={[0, keyY + 0.025, kbZ - kbDepth / 2]}>
        <boxGeometry args={[width - 0.16, 0.02, kbDepth]} />
        <meshStandardMaterial {...keyW} />
      </mesh>
      {/* Black keys (a strip with gaps faked by a darker row set back) */}
      {Array.from({ length: 18 }, (_, i) => {
        const span = width - 0.22
        const x = -span / 2 + (span * i) / 17
        // skip a couple to fake the 2-3 grouping
        if (i % 7 === 2 || i % 7 === 6) return null
        return (
          <mesh key={i} position={[x, keyY + 0.035, kbZ - kbDepth / 2 - 0.03]}>
            <boxGeometry args={[0.018, 0.02, kbDepth * 0.6]} />
            <meshStandardMaterial {...keyB} />
          </mesh>
        )
      })}
      {/* Music desk (upright only) */}
      {style === 'upright' && (
        <mesh castShadow position={[0, keyY + 0.34, -0.02]} rotation={[0.12, 0, 0]} material={body}>
          <boxGeometry args={[width - 0.2, 0.4, 0.02]} />
        </mesh>
      )}
      {/* Pedals */}
      {[-0.08, 0.08].map((x) => (
        <mesh
          key={x}
          position={[x, plinthH + 0.04, depth / 2 - 0.04]}
          rotation={[Math.PI / 2.2, 0, 0]}
        >
          <boxGeometry args={[0.03, 0.08, 0.012]} />
          <MetalMaterial color="#c9a24b" roughness={0.3} metalness={0.7} />
        </mesh>
      ))}
    </group>
  )
}
