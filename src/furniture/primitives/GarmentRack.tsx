import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/**
 * Freestanding garment rack — an open clothing rail on a metal/wood frame with a
 * lower shoe shelf and a row of hung garments. The open-storage alternative to a
 * wardrobe (bedrooms, staging, retail). Faces +Z, floor-anchored, real metres.
 */
export function GarmentRack({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.1)
  const color = readStr(props, 'color', '#3b3d42')
  const finish = readStr(props, 'finish', 'gloss')
  const clothes = readStr(props, 'clothes', '#9aa6ad')

  const w = width
  const d = 0.45
  const h = 1.6
  const postT = 0.03
  const frameMat = getSurfaceMaterial(finish, color, 1, 0.4)
  const clothMat = getFabricMaterial(clothes, 0.95)

  const railY = h - 0.08
  const shelfY = 0.22
  const px = w / 2 - postT / 2

  // A row of hung garments: slim tapered blocks hanging from the rail.
  const tones = ['#8c98a0', '#b7a98f', '#6f7a82', '#a98f86', '#7d8a76']
  const n = Math.max(3, Math.round(w / 0.16))

  return (
    <group>
      {/* Feet */}
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} castShadow position={[s * px, 0.02, 0]} material={frameMat}>
          <boxGeometry args={[postT * 1.4, 0.04, d]} />
        </mesh>
      ))}
      {/* Uprights */}
      {[-1, 1].map((s) => (
        <mesh key={`u${s}`} castShadow position={[s * px, h / 2, 0]} material={frameMat}>
          <boxGeometry args={[postT, h, postT]} />
        </mesh>
      ))}
      {/* Top hanging rail */}
      <mesh castShadow position={[0, railY, 0]} rotation={[0, 0, Math.PI / 2]} material={frameMat}>
        <cylinderGeometry args={[0.014, 0.014, w - postT, 12]} />
      </mesh>
      {/* Lower shoe shelf (two cross bars + slats) */}
      <mesh castShadow position={[0, shelfY, 0]} material={frameMat}>
        <boxGeometry args={[w - postT, 0.02, d - 0.08]} />
      </mesh>
      {/* Hung garments */}
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + 0.12 + (i * (w - 0.24)) / (n - 1)
        const len = 0.6 + ((i * 7) % 4) * 0.06
        const tone = tones[i % tones.length]
        return (
          <group key={i} position={[x, railY - 0.02, 0]}>
            {/* Hanger hook */}
            <mesh castShadow position={[0, 0.01, 0]}>
              <torusGeometry args={[0.018, 0.003, 6, 10, Math.PI]} />
              <MetalMaterial color="#b7bcc2" roughness={0.4} metalness={0.6} />
            </mesh>
            {/* Garment body (tapered, slightly varied) — its shoulders meet the
                hanger hook/rail (previously it hung ~3 cm clear of the hook). */}
            <mesh castShadow receiveShadow position={[0, -len / 2 + 0.006, 0]}>
              <boxGeometry args={[0.13, len, 0.05]} />
              {i % 2 === 0 ? (
                <primitive object={clothMat} attach="material" />
              ) : (
                <meshStandardMaterial color={tone} roughness={0.95} />
              )}
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
