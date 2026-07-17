import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Orthopedic dog bed — a low, rectangular memory-foam mattress with a raised
 * bolster headrest. Distinct from the round/rect `pet-bed`: this reads as a
 * thick, flat orthopedic mattress (a chamfered foam slab, matte fabric so it
 * catches light as dense foam, not a plush cushion) with either a single back
 * headrest bolster or a three-side U bolster, the front left open so an older
 * dog can step straight on. Floor-anchored, footprint-centred, faces +Z. Real
 * metres.
 */
export function DogBedOrthopedic({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.9)
  const depth = readNum(props, 'depth', 0.65)
  const mattressColor = readStr(props, 'mattress', '#c3c9cf')
  const bolsterColor = readStr(props, 'bolster', '#8a94a0')
  const bolster = readStr(props, 'bolster_style', 'headrest')

  // Matte fabric (higher roughness) → reads as dense memory foam, not plush.
  const foamMat = getFabricMaterial(mattressColor, 0.98)
  const bolsterMat = getFabricMaterial(bolsterColor, 0.95)

  const matT = 0.1 // memory-foam mattress thickness
  const bolT = 0.11 // bolster tube thickness (depth into the bed)
  const bolH = 0.16 // bolster height above the floor
  const w = width
  const d = depth

  return (
    <group>
      {/* Memory-foam mattress slab (thick, chamfered, matte). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, matT / 2, 0]}
        material={foamMat}
        args={[w, matT, d]}
        bevel={0.02}
      />
      {/* Back headrest bolster (−Z), always present. */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, matT + bolH / 2, -d / 2 + bolT / 2]}
        material={bolsterMat}
        args={[w, bolH, bolT]}
        bevel={0.03}
      />
      {/* Side bolsters for the three-side (U) variant; front stays open. */}
      {bolster === 'three-side'
        ? [-1, 1].map((s) => (
            <BeveledBox
              key={s}
              castShadow
              receiveShadow
              position={[s * (w / 2 - bolT / 2), matT + bolH / 2, 0]}
              material={bolsterMat}
              args={[bolT, bolH, d - bolT]}
              bevel={0.03}
            />
          ))
        : null}
    </group>
  )
}
