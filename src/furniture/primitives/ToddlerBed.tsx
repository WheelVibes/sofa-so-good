import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readStr } from './shared'

/**
 * Toddler bed: a low single-ish bed with a headboard, a low footboard and short
 * safety side rails along the head-half of each side (the foot-half stays open
 * to climb in) — the nursery's step up from a crib. Faces +Z (headboard at −Z).
 */
export function ToddlerBed({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#c8b48f')
  const finish = readStr(props, 'finish', 'painted')
  const bedding = readStr(props, 'bedding', '#e7e0d2')
  const w = 0.78
  const len = 1.45
  const frameMat = getSurfaceMaterial(finish, color, 1, 0)
  const beddingMat = getFabricMaterial(bedding, 0.95)
  const legH = 0.16
  const frameY = legH
  const mattressY = frameY + 0.05 + 0.07

  const legX = w / 2 - 0.05
  const legZ = len / 2 - 0.05
  const leg = (sx: number, sz: number) => (
    <mesh key={`${sx}-${sz}`} castShadow position={[sx, legH / 2, sz]} material={frameMat}>
      <boxGeometry args={[0.06, legH, 0.06]} />
    </mesh>
  )

  return (
    <group>
      {leg(-legX, -legZ)}
      {leg(legX, -legZ)}
      {leg(-legX, legZ)}
      {leg(legX, legZ)}
      {/* Low slatted base */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, frameY + 0.025, 0]}
        material={frameMat}
        args={[w, 0.05, len]}
      />
      {/* Mattress + bedding */}
      <mesh castShadow receiveShadow position={[0, mattressY, 0.03]}>
        <boxGeometry args={[w - 0.08, 0.14, len - 0.12]} />
        <primitive object={beddingMat} attach="material" />
      </mesh>
      {/* Pillow at the head */}
      <mesh castShadow position={[0, mattressY + 0.09, -len / 2 + 0.22]}>
        <boxGeometry args={[w - 0.22, 0.07, 0.26]} />
        <primitive object={beddingMat} attach="material" />
      </mesh>
      {/* Headboard (tall) + footboard (low) */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, 0.42, -len / 2 + 0.025]}
        material={frameMat}
        args={[w, 0.52, 0.05]}
      />
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, 0.28, len / 2 - 0.025]}
        material={frameMat}
        args={[w, 0.24, 0.05]}
      />
      {/* Safety side rails over the head-half of each side */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          castShadow
          position={[s * (w / 2 - 0.025), mattressY + 0.12, -len / 4]}
          material={frameMat}
        >
          <boxGeometry args={[0.04, 0.16, len / 2 - 0.1]} />
        </mesh>
      ))}
    </group>
  )
}
