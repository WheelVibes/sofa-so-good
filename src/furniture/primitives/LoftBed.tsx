import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/**
 * Loft / cabin bed (kids) — a raised single sleeping platform on four sturdy
 * posts, with guardrails, an integral end ladder, and an open void beneath for a
 * desk or wardrobe (the HDB space-saver). Faces +Z; single-mattress platform
 * (~1.0 × 2.0 m) at ~1.75 m with ~1.6 m under-clearance. `under`: 'open' (clear
 * space) | 'desk' (a built-in worktop + shelf under the head end) | 'wardrobe'
 * (a boxed closet under the head end). All members connect; posts reach the
 * floor. Real metres, footprint-centred, floor-anchored.
 */
export function LoftBed({ props }: { props: ParamProps }) {
  const frameColor = readStr(props, 'frameColor', '#c2a06a')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const bedding = readStr(props, 'bedding', '#cdd7de')
  const under = readStr(props, 'under', 'open')

  const W = 1.0
  const L = 2.0
  const postR = 0.045
  const platformY = 1.68 // slat-base top → ~1.6 m under-clearance
  const guardRailY = platformY + 0.36
  const postH = guardRailY + 0.04
  const mattT = 0.14

  const frame = getSurfaceMaterial(finish, frameColor, 1.4, sheen)
  const matFab = (c: string) => ({ color: c, roughness: 0.92, metalness: 0 })

  const px = W / 2 - postR
  const pz = L / 2 - postR
  const posts: [number, number][] = [
    [-px, -pz],
    [px, -pz],
    [-px, pz],
    [px, pz],
  ]

  // Head end = −Z (fit-out lives here); foot end = +Z (ladder access).
  const headZ = -L / 2

  return (
    <group>
      {/* Four posts, floor → guardrail top */}
      {posts.map(([x, z], i) => (
        <mesh key={`post${i}`} castShadow position={[x, postH / 2, z]} material={frame}>
          <cylinderGeometry args={[postR, postR, postH, 12]} />
        </mesh>
      ))}

      {/* Long side rails at platform level tie the posts */}
      {[-1, 1].map((sx) => (
        <BeveledBox
          key={`rail${sx}`}
          castShadow
          position={[sx * (W / 2 - postR), platformY - 0.03, 0]}
          material={frame}
          args={[0.05, 0.1, L - postR]}
        />
      ))}
      {/* End rails at platform level (both ends) */}
      {[-1, 1].map((sz) => (
        <BeveledBox
          key={`erail${sz}`}
          castShadow
          position={[0, platformY - 0.03, sz * (L / 2 - postR)]}
          material={frame}
          args={[W - postR, 0.1, 0.05]}
        />
      ))}

      {/* Slat platform + mattress + pillow */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, platformY, 0]}
        material={frame}
        args={[W - postR, 0.05, L - postR]}
      />
      <mesh castShadow receiveShadow position={[0, platformY + 0.03 + mattT / 2, 0]}>
        <boxGeometry args={[W - 0.12, mattT, L - 0.12]} />
        <meshStandardMaterial {...matFab(bedding)} />
      </mesh>
      <mesh castShadow position={[0, platformY + 0.03 + mattT + 0.04, headZ + 0.32]}>
        <boxGeometry args={[W - 0.3, 0.1, 0.34]} />
        <meshStandardMaterial {...matFab('#ece5da')} />
      </mesh>

      {/* Long-side guardrails: top rail + vertical balusters (leave the +X foot
          half open for ladder access on that side) */}
      {[-1, 1].map((sx) => {
        const x = sx * (W / 2 - postR)
        // The +X side foot half is left open for the ladder.
        const open = sx === 1
        const railZ0 = -L / 2 + postR
        const railZ1 = open ? 0 : L / 2 - postR
        const railLen = railZ1 - railZ0
        const balusters = Math.max(2, Math.round(railLen / 0.28))
        return (
          <group key={`guard${sx}`}>
            <BeveledBox
              castShadow
              position={[x, guardRailY, (railZ0 + railZ1) / 2]}
              material={frame}
              args={[0.05, 0.05, railLen]}
            />
            {Array.from({ length: balusters }, (_, i) => {
              const t = balusters > 1 ? i / (balusters - 1) : 0.5
              const z = railZ0 + t * railLen
              return (
                <mesh
                  key={i}
                  castShadow
                  position={[x, (platformY + 0.06 + guardRailY) / 2, z]}
                  material={frame}
                >
                  <cylinderGeometry args={[0.014, 0.014, guardRailY - platformY - 0.06, 8]} />
                </mesh>
              )
            })}
          </group>
        )
      })}
      {/* Head-end guardrail top rail */}
      <BeveledBox
        castShadow
        position={[0, guardRailY, headZ + postR]}
        material={frame}
        args={[W - postR, 0.05, 0.05]}
      />

      {/* Integral ladder at the foot (+Z) end, +X side */}
      <group position={[W / 2 - postR - 0.02, 0, L / 2 - 0.1]}>
        {[-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * 0.14, platformY / 2, 0]} material={frame}>
            <boxGeometry args={[0.035, platformY, 0.035]} />
          </mesh>
        ))}
        {Array.from({ length: 5 }, (_, i) => (0.3 + i * 0.3) * (platformY / 1.68)).map((y, i) => (
          <mesh
            key={`rung${i}`}
            castShadow
            position={[0, y, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={frame}
          >
            <cylinderGeometry args={[0.016, 0.016, 0.28, 8]} />
          </mesh>
        ))}
      </group>

      {/* Under-bed fit-out (head end) */}
      {under === 'desk' && (
        <group>
          {/* Worktop spanning between the two head-end posts */}
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, 0.74, headZ + 0.32]}
            material={frame}
            args={[W - postR, 0.04, 0.52]}
          />
          {/* Under-worktop shelf */}
          <BeveledBox
            castShadow
            receiveShadow
            position={[0, 0.32, headZ + 0.32]}
            material={frame}
            args={[W - postR - 0.06, 0.03, 0.44]}
          />
          {/* Shelf end supports reaching the floor (tie the shelf down) */}
          {[-1, 1].map((sx) => (
            <BeveledBox
              key={sx}
              castShadow
              position={[sx * (W / 2 - postR - 0.02), 0.16, headZ + 0.32]}
              material={frame}
              args={[0.03, 0.32, 0.44]}
            />
          ))}
        </group>
      )}
      {under === 'wardrobe' && (
        <group>
          {(() => {
            const wardH = 1.5
            const wZ0 = headZ + postR
            const wDepth = 0.58
            const wZ = wZ0 + wDepth / 2
            const t = 0.02
            const iw = W - postR
            return (
              <>
                {/* Side panels (floor → wardrobe top), overlapping the posts */}
                {[-1, 1].map((sx) => (
                  <BeveledBox
                    key={sx}
                    castShadow
                    receiveShadow
                    position={[sx * (W / 2 - postR), wardH / 2, wZ]}
                    material={frame}
                    args={[t, wardH, wDepth]}
                  />
                ))}
                {/* Back + top + bottom panels */}
                <BeveledBox
                  receiveShadow
                  position={[0, wardH / 2, wZ0 + t / 2]}
                  material={frame}
                  args={[iw, wardH, t]}
                />
                {[0.02, wardH - t / 2].map((y, i) => (
                  <BeveledBox
                    key={`d${i}`}
                    castShadow
                    receiveShadow
                    position={[0, y, wZ]}
                    material={frame}
                    args={[iw, t, wDepth]}
                  />
                ))}
                {/* Door front (proud, shadow-gap reveal) + bar handle */}
                <BeveledBox
                  castShadow
                  position={[0, wardH / 2, wZ0 + wDepth + 0.004]}
                  material={frame}
                  args={[iw - 0.02, wardH - 0.03, 0.018]}
                />
                <mesh castShadow position={[iw / 2 - 0.06, wardH / 2, wZ0 + wDepth + 0.02]}>
                  <boxGeometry args={[0.02, 0.24, 0.024]} />
                  <MetalMaterial color="#3a3d42" roughness={0.4} metalness={0.6} />
                </mesh>
              </>
            )
          })()}
        </group>
      )}
    </group>
  )
}
