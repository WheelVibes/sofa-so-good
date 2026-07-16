import { useMemo } from 'react'
import { MeshStandardMaterial, RepeatWrapping } from 'three'
import { getFabricMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'
import { getSisalTexture } from './sisalTexture'
import { seg, useDetail } from './useDetail'

/**
 * Scratching post — a sisal-wrapped scratcher in three styles: `vertical` (a
 * rope-wrapped column on a weighted base with a small topper), `angled` (an
 * inclined sisal board leaning on a low frame) and `pad` (a flat floor pad
 * wrapped in sisal). Shares the cat-tree sisal texture read. Floor-anchored,
 * footprint-centred, faces +Z. Real metres; the base is wide enough that a
 * vertical post won't tip (structural read).
 */
export function ScratchingPost({ props }: { props: ParamProps }) {
  const style = readStr(props, 'style', 'vertical')
  const height = readNum(props, 'height', 0.7)
  const baseColor = readStr(props, 'baseColor', '#c8bda8')
  const sisalColor = readStr(props, 'sisalColor', '#c9a875')
  const detail = useDetail()
  const r = seg(20, detail)

  const baseMat = getFabricMaterial(baseColor, 0.95)
  const sisalMat = useMemo(() => {
    const coils = Math.max(2, Math.round(height / 0.08))
    const tex = getSisalTexture(sisalColor).clone()
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(2, coils)
    tex.needsUpdate = true
    return new MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 })
  }, [sisalColor, height])

  if (style === 'pad') {
    // Flat floor scratch pad wrapped in sisal, on a low tray.
    const w = 0.5
    const d = 0.28
    return (
      <group>
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, 0.02, 0]}
          material={baseMat}
          args={[w + 0.04, 0.04, d + 0.04]}
        />
        <mesh castShadow receiveShadow position={[0, 0.05, 0]} material={sisalMat}>
          <boxGeometry args={[w, 0.03, d]} />
        </mesh>
      </group>
    )
  }

  if (style === 'angled') {
    // Inclined sisal board on a low triangular frame (a slope to scratch).
    const boardLen = Math.max(0.4, height + 0.2)
    const boardW = 0.3
    const tilt = -Math.PI / 5 // lean back
    const baseD = boardLen * Math.cos(tilt)
    return (
      <group>
        {/* Foot rail on the floor. */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, 0.03, baseD / 2]}
          material={baseMat}
          args={[boardW + 0.06, 0.06, 0.08]}
        />
        {/* Back support post. */}
        <mesh castShadow position={[0, height / 2, -0.02]} material={baseMat}>
          <boxGeometry args={[boardW + 0.06, height, 0.05]} />
        </mesh>
        {/* Inclined sisal board leaning from the foot rail up to the post. */}
        <mesh
          castShadow
          receiveShadow
          position={[0, height / 2 + 0.03, baseD / 4]}
          rotation={[tilt, 0, 0]}
          material={sisalMat}
        >
          <boxGeometry args={[boardW, boardLen, 0.03]} />
        </mesh>
      </group>
    )
  }

  // vertical (default): weighted base + rope column + a small topper ball.
  const postR = 0.04
  const baseR = 0.22
  return (
    <group>
      {/* Weighted round base. */}
      <mesh castShadow receiveShadow position={[0, 0.02, 0]} material={baseMat}>
        <cylinderGeometry args={[baseR, baseR, 0.04, r]} />
      </mesh>
      {/* Rope column. */}
      <mesh castShadow receiveShadow position={[0, 0.04 + height / 2, 0]} material={sisalMat}>
        <cylinderGeometry args={[postR, postR, height, Math.max(12, r)]} />
      </mesh>
      {/* Topper cap. */}
      <mesh castShadow position={[0, 0.04 + height + 0.03, 0]} material={baseMat}>
        <sphereGeometry args={[0.055, r, r]} />
      </mesh>
    </group>
  )
}
