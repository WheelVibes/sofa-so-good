import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafTintHex } from './leafFoliage'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Floor vase — a tall ceramic styling accent for a corner, optionally holding
 * dried pampas / branch stems. `shape` sets the silhouette (tall taper, round
 * belly, or wide). Floor-anchored, centred. Built at real-world metres.
 */
export function FloorVase({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 0.7)
  const color = readStr(props, 'color', '#d8cfc0')
  const finish = readStr(props, 'finish', 'gloss')
  const sheen = readNum(props, 'sheen', 0.3)
  const shape = readStr(props, 'shape', 'tall')
  const stems = readStr(props, 'stems', 'pampas')
  const stemColor = readStr(props, 'stemColor', '#cdbb93')
  const r = seg(24, useDetail())

  const mat = getSurfaceMaterial(finish, color, 1.0, sheen)
  // Body profile by shape: [bottomR, midR, topR].
  const prof: [number, number, number] =
    shape === 'round' ? [0.1, 0.2, 0.11] : shape === 'wide' ? [0.16, 0.22, 0.18] : [0.09, 0.13, 0.1]
  const [br, mr, tr] = prof
  const h1 = height * 0.45
  const h2 = height * 0.55
  const stemMat = { color: stemColor, roughness: 0.9, metalness: 0 } as const

  // Foliage atop the stems: feathery pampas plumes (drawn in the dried stem
  // tone), or small sage leaves along decorative branches. Each foliage instance
  // shares its stem's centre + lean so it overlaps the stem (stays connected).
  const nStems = stems === 'branch' ? 5 : 9
  const foliage: BoxInstance[] = []
  if (stems === 'pampas' || stems === 'branch') {
    for (let i = 0; i < nStems; i++) {
      const a = (i / nStems) * Math.PI * 2
      const lean = stems === 'branch' ? 0.22 : 0.14
      const len = (stems === 'branch' ? 0.7 : 0.55) * (0.8 + (i % 3) * 0.12)
      const cx = Math.cos(a) * tr * 0.5
      const cz = Math.sin(a) * tr * 0.5
      const cy = height + len / 2 - 0.02
      const rot: [number, number, number] = [Math.cos(a) * lean, 0, -Math.sin(a) * lean]
      if (stems === 'pampas') {
        foliage.push({
          position: [cx, cy - len * 0.35, cz],
          size: [0.17, len * 1.1, 0.17],
          rotation: rot,
          color: leafTintHex(i),
        })
      } else {
        // A few small leaves fanned along the branch.
        for (let k = 0; k < 3; k++) {
          foliage.push({
            position: [cx, cy - len * 0.2 + k * len * 0.22, cz],
            size: [0.05, 0.07, 0.05],
            rotation: [rot[0] + (k - 1) * 0.3, a + k * 1.3, rot[2]],
            color: leafTintHex(i * 3 + k, 2),
          })
        }
      }
    }
  }

  return (
    <group>
      {/* Lower body (bottom → belly) */}
      <mesh castShadow receiveShadow position={[0, h1 / 2, 0]} material={mat}>
        <cylinderGeometry args={[mr, br, h1, r]} />
      </mesh>
      {/* Upper body (belly → neck) */}
      <mesh castShadow receiveShadow position={[0, h1 + h2 / 2, 0]} material={mat}>
        <cylinderGeometry args={[tr, mr, h2, r]} />
      </mesh>

      {/* Stems */}
      {stems !== 'none' &&
        Array.from({ length: stems === 'branch' ? 5 : 9 }, (_, i) => {
          const n = stems === 'branch' ? 5 : 9
          const a = (i / n) * Math.PI * 2
          const lean = stems === 'branch' ? 0.22 : 0.14
          const len = (stems === 'branch' ? 0.7 : 0.55) * (0.8 + (i % 3) * 0.12)
          return (
            <mesh
              key={i}
              castShadow
              position={[Math.cos(a) * tr * 0.5, height + len / 2 - 0.02, Math.sin(a) * tr * 0.5]}
              rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
            >
              <cylinderGeometry
                args={stems === 'pampas' ? [0.012, 0.004, len, 6] : [0.006, 0.004, len, 5]}
              />
              <meshStandardMaterial {...stemMat} />
            </mesh>
          )
        })}

      {/* Feathery plumes / sage branch leaves */}
      {stems === 'pampas' && (
        <InstancedLeaves species="pampas" color={stemColor} instances={foliage} />
      )}
      {stems === 'branch' && <InstancedLeaves species="oval" color="#8a9a63" instances={foliage} />}
    </group>
  )
}
