import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafTintHex } from './leafFoliage'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Ceiling-hung trailing plant — a pot on three cords with cascading foliage.
 * Mounted: the group offsets up to `mountHeight` (the pot hangs below). Adds
 * vertical greenery (biophilic). Faces down; symmetric.
 */
export function HangingPlant({ props }: { props: ParamProps }) {
  const mountH = readNum(props, 'mountHeight', 2.45)
  const detail = useDetail()
  const drop = readNum(props, 'drop', 0.4)
  const potColor = readStr(props, 'potColor', '#cdbb9a')
  const leafColor = readStr(props, 'leafColor', '#4a7a44')
  const size = readStr(props, 'size', 'medium')

  const potR = size === 'large' ? 0.16 : 0.12
  const potH = potR * 1.1
  const potY = mountH - drop
  const trail = size === 'large' ? 0.7 : 0.5

  const GOLD = 2.399963
  // Trailing pothos: heart leaves. An upright crown mound + longer leaves that
  // drape DOWN over the rim (tilt past horizontal) for the cascade. Every leaf
  // bases at the pot, so the whole plant stays one connected piece.
  const crownY = potY + potH / 2
  const nCrown = Math.max(5, Math.round(8 * detail))
  const nTrail = Math.max(5, Math.round((size === 'large' ? 12 : 8) * detail))
  const leaves: BoxInstance[] = []
  for (let i = 0; i < nCrown; i++) {
    const a = i * GOLD
    const tilt = 0.35 + (i % 4) * 0.2
    leaves.push({
      position: [Math.sin(a) * potR * 0.4, crownY, Math.cos(a) * potR * 0.4],
      size: [0.1, 0.13 + (i % 3) * 0.02, 0.1],
      rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
      color: leafTintHex(i),
    })
  }
  for (let i = 0; i < nTrail; i++) {
    const a = i * GOLD + 0.3
    const tilt = 2.05 + (i % 3) * 0.22 // past horizontal → drapes downward
    const len = trail * (0.55 + (i % 4) * 0.14)
    leaves.push({
      position: [Math.cos(a) * potR * 0.72, potY - 0.01, Math.sin(a) * potR * 0.72],
      size: [0.09, len, 0.09],
      rotation: [Math.cos(a) * tilt, a + Math.PI / 2, -Math.sin(a) * tilt],
      color: leafTintHex(i, 4),
    })
  }

  return (
    <group>
      {/* Three hanging cords to the pot rim */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * potR * 0.8, potY + drop / 2, Math.sin(a) * potR * 0.8]}
            rotation={[0, 0, Math.cos(a) * 0.18]}
          >
            <cylinderGeometry args={[0.004, 0.004, drop, 5]} />
            <meshStandardMaterial color="#8a7f6a" roughness={0.9} />
          </mesh>
        )
      })}
      {/* Pot */}
      <mesh castShadow position={[0, potY, 0]}>
        <cylinderGeometry args={[potR, potR * 0.8, potH, seg(16, detail)]} />
        <meshStandardMaterial color={potColor} roughness={0.8} />
      </mesh>
      {/* Soil so the crown reads as planted, not floating */}
      <mesh position={[0, crownY - 0.008, 0]}>
        <cylinderGeometry args={[potR * 0.92, potR * 0.92, 0.02, seg(12, detail)]} />
        <meshStandardMaterial color="#2c1e0f" roughness={1} />
      </mesh>
      {/* Trailing pothos leaves — crown mound + draping cascade */}
      <InstancedLeaves species="pothos" color={leafColor} instances={leaves} />
    </group>
  )
}
