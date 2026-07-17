import { useEffect, useMemo } from 'react'
import { RepeatWrapping, type Texture } from 'three'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { getPegboardTexture } from './pegboardTexture'
import { metalLeg, readNum, readStr } from './shared'

/** Wall-mounted pegboard organiser — the service-yard / workshop wall panel. A
 *  perforated board (a real peg-hole grid via the bounded-LRU canvas texture,
 *  the meshGridTexture precedent — no per-hole geometry) in a slim frame, hung
 *  at mount height (group offset in Y, board flat on the wall). A `kit` of
 *  accessories sockets into the board front (+Z) so the whole thing is one
 *  connected assembly: 'shelf+hooks' (a small shelf on brackets + two hooks),
 *  'hooks' (a row of J-hooks), or 'cups' (three hanging pots). Real metres. */
export function Pegboard({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8)
  const height = readNum(props, 'height', 0.9)
  const mountH = readNum(props, 'mountHeight', 1.3)
  const boardColor = readStr(props, 'color', '#d8c39a')
  const kit = readStr(props, 'kit', 'shelf+hooks')

  const boardT = 0.014
  const frameT = 0.022
  const holeSpacing = 0.032
  const wood = getSurfaceMaterial('wood', '#6f553f', 1.0)
  const metal = metalLeg('#3a3d42', 'satin')

  // Perforated-board face texture: one hole cell tiled to the hole grid.
  const holeTex = useMemo<Texture>(() => {
    const t = getPegboardTexture(boardColor).clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(
      Math.max(3, Math.round(width / holeSpacing)),
      Math.max(3, Math.round(height / holeSpacing)),
    )
    return t
  }, [boardColor, width, height])
  useEffect(() => () => holeTex.dispose(), [holeTex])

  const front = boardT // board front face into the room (+Z)
  const hookXs = [-width * 0.28, 0, width * 0.28]

  return (
    <group position={[0, mountH, 0]}>
      {/* Perforated board — 4 mm smaller each edge than the frame envelope so its
          top/bottom/side faces tuck BEHIND the frame rails instead of sitting
          coplanar with them (the rails overhang the board edges → no z-fight). */}
      <mesh castShadow receiveShadow position={[0, 0, boardT / 2]}>
        <boxGeometry args={[width - 0.008, height - 0.008, boardT]} />
        <meshStandardMaterial map={holeTex} roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Slim frame around the board (four members, proud of the face) */}
      {[
        [0, height / 2 - frameT / 2, width, frameT] as const,
        [0, -height / 2 + frameT / 2, width, frameT] as const,
      ].map(([x, y, w, h], i) => (
        <BeveledBox
          key={`h${i}`}
          castShadow
          position={[x, y, front / 2]}
          material={wood}
          args={[w, h, boardT + 0.006]}
        />
      ))}
      {[-width / 2 + frameT / 2, width / 2 - frameT / 2].map((x, i) => (
        <BeveledBox
          key={`v${i}`}
          castShadow
          position={[x, 0, front / 2]}
          material={wood}
          args={[frameT, height - frameT * 2, boardT + 0.006]}
        />
      ))}

      {/* Accessories — each sockets into the board front */}
      {(kit === 'hooks' || kit === 'shelf+hooks') &&
        (kit === 'hooks' ? hookXs : [-width * 0.28, width * 0.28]).map((x, i) => (
          <group key={`hk${i}`} position={[x, kit === 'hooks' ? 0.05 : -height * 0.22, front]}>
            <mesh castShadow position={[0, 0, 0.02]} material={metal}>
              <boxGeometry args={[0.012, 0.012, 0.05]} />
            </mesh>
            <mesh castShadow position={[0, -0.022, 0.043]} material={metal}>
              <boxGeometry args={[0.012, 0.05, 0.012]} />
            </mesh>
          </group>
        ))}
      {kit === 'shelf+hooks' && (
        <group position={[0, height * 0.18, front]}>
          {/* Shelf plank projecting forward */}
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, 0.05, 0.07]}
            material={wood}
            args={[width * 0.7, 0.016, 0.13]}
          />
          {/* Two support brackets down to the board */}
          {[-width * 0.28, width * 0.28].map((x, i) => (
            <mesh key={i} castShadow position={[x, 0.018, 0.028]} material={metal}>
              <boxGeometry args={[0.012, 0.07, 0.056]} />
            </mesh>
          ))}
        </group>
      )}
      {kit === 'cups' &&
        hookXs.map((x, i) => (
          <group key={`cup${i}`} position={[x, -height * 0.05, front]}>
            {/* Bracket socketing into the board */}
            <mesh castShadow position={[0, 0.04, 0.025]} material={metal}>
              <boxGeometry args={[0.012, 0.012, 0.055]} />
            </mesh>
            {/* Small open cup hanging off the bracket */}
            <mesh castShadow position={[0, -0.005, 0.052]} material={metal}>
              <cylinderGeometry args={[0.032, 0.026, 0.075, 16, 1, true]} />
            </mesh>
            <mesh position={[0, -0.041, 0.052]} material={metal}>
              <cylinderGeometry args={[0.026, 0.026, 0.006, 16]} />
            </mesh>
          </group>
        ))}
    </group>
  )
}
