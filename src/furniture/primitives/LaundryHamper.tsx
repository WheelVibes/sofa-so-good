import { getFabricMaterial, getRattanMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Laundry hamper — a floor basket for the bedroom/bathroom/laundry. `style`
 * picks a round woven basket or a rectangular bin; `weave` swaps the woven
 * rattan body for a soft canvas one. A fabric liner folds over the rim and an
 * optional lid sits on top. Floor-anchored, footprint-centred, real metres.
 */
export function LaundryHamper({ props }: { props: ParamProps }) {
  const style = readStr(props, 'style', 'round')
  const weave = readStr(props, 'weave', 'rattan')
  const color = readStr(props, 'color', '#cbb791')
  const liner = readStr(props, 'liner', '#eee7d8')
  const height = readNum(props, 'height', 0.56)
  const lid = readStr(props, 'lid', 'none')
  const round = style === 'round'
  const r = seg(24, useDetail())

  const bodyMat = weave === 'rattan' ? getRattanMaterial(color, 3) : getFabricMaterial(color, 0.95)
  const linerMat = getFabricMaterial(liner, 0.92)

  const topR = 0.21
  const botR = 0.17
  const w = 0.42
  const d = 0.34
  const linerH = 0.06
  const rimY = height

  return (
    <group>
      {/* Tapered woven body — round basket or rectangular bin */}
      {round ? (
        <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={bodyMat}>
          <cylinderGeometry args={[topR, botR, height, r]} />
        </mesh>
      ) : (
        <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={bodyMat}>
          <boxGeometry args={[w, height, d]} />
        </mesh>
      )}

      {/* Fabric liner folded over the rim */}
      {round ? (
        <mesh castShadow position={[0, rimY - linerH / 2 + 0.01, 0]} material={linerMat}>
          <cylinderGeometry args={[topR + 0.012, topR + 0.012, linerH, r, 1, true]} />
        </mesh>
      ) : (
        <mesh castShadow position={[0, rimY - linerH / 2 + 0.01, 0]} material={linerMat}>
          <boxGeometry args={[w + 0.02, linerH, d + 0.02]} />
        </mesh>
      )}

      {/* Optional lid sitting on the rim */}
      {lid !== 'none' &&
        (round ? (
          <mesh castShadow receiveShadow position={[0, rimY + 0.02, 0]} material={bodyMat}>
            <cylinderGeometry args={[topR + 0.01, topR + 0.01, 0.04, r]} />
          </mesh>
        ) : (
          <mesh castShadow receiveShadow position={[0, rimY + 0.02, 0]} material={bodyMat}>
            <boxGeometry args={[w + 0.02, 0.04, d + 0.02]} />
          </mesh>
        ))}
    </group>
  )
}
