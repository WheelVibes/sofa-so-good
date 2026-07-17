import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import type { BoxInstance } from './InstancedBoxes'
import { InstancedLeaves, leafTintHex } from './leafFoliage'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Trailing plant — a raised pot whose vines arch up out of the crown then
 * cascade DOWN over the rim and drape well below the pot, plus a small upright
 * tuft at the centre. A genuinely different silhouette from the petite,
 * pot-bound `DeskPlant` (whose "trailing" stems only arch a few cm): this is a
 * hero set-dressing piece for shelves, sideboards, consoles and TV units where
 * the cascade reads against the surface edge.
 *
 * Rests at `surfaceHeight` (self-lifts in local space). Footprint-centred,
 * facing +Z, built in real metres. Each vine is a deterministically shaped
 * polyline of short cylinder segments hanging from the pot rim, with small oval
 * leaves clustered along it — so the drape varies vine-to-vine without RNG.
 */
export function TrailingPlant({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const potColor = readStr(props, 'potColor', '#cdbb9a')
  const leafColor = readStr(props, 'leafColor', '#4a7a44')
  const potFinish = readStr(props, 'potFinish', 'painted')
  const fullness = readStr(props, 'fullness', 'full') // 'full' | 'sparse'

  const potMat = getSurfaceMaterial(potFinish, potColor, 1, 0.08)
  const stemMat = getSurfaceMaterial('painted', '#5a7a36', 1, 0)
  const r = seg(18, useDetail())

  // Pot — a compact rounded planter raised slightly off the surface on a foot.
  const potH = 0.14
  const potRTop = 0.085
  const potRBot = 0.068
  const rimY = potH // crown of the pot in local pot-top space

  const vineCount = fullness === 'sparse' ? 4 : 6
  // Each vine: a start angle around the rim, a length (number of segments), a
  // sideways sway and a deterministic lean — derived from the index so the
  // primitive stays pure (no RNG) yet every vine differs.
  const vines = Array.from({ length: vineCount }, (_, i) => {
    const a = (i / vineCount) * Math.PI * 2 + 0.35
    const segs = 6 + (i % 3) * 2 // 6..10 segments → longer/shorter drape
    const sway = (i % 2 === 0 ? 1 : -1) * (0.5 + (i % 3) * 0.18) // lateral curl
    const reach = 0.05 + (i % 4) * 0.012 // how far the vine bows outward
    return { a, segs, sway, reach, shade: 0.82 + (i % 4) * 0.12 }
  })

  // Build a hanging polyline for one vine: it rises a touch out of the crown,
  // bows outward over the rim, then falls under gravity, curling sideways.
  function vinePath(v: (typeof vines)[number]) {
    const nodes: { x: number; y: number; z: number }[] = []
    const dirX = Math.sin(v.a)
    const dirZ = Math.cos(v.a)
    // Start just inside the rim, lifted a little above the crown.
    let x = dirX * potRTop * 0.7
    let z = dirZ * potRTop * 0.7
    let y = rimY + 0.05
    nodes.push({ x, y, z })
    // Outward+upward velocity that turns into downward as the vine droops.
    let vx = dirX * 0.024
    let vz = dirZ * 0.024
    let vy = 0.018
    for (let s = 0; s < v.segs; s++) {
      // Gravity pulls the tip down progressively; the outward push fades so the
      // vine bows out then hangs nearly vertical (a natural cascade).
      vy -= 0.012
      vx *= 0.86
      vz *= 0.86
      // Sideways curl, alternating slightly so vines don't all sweep one way.
      const curl = v.sway * 0.01 * Math.sin(s * 0.9)
      x += vx + dirZ * curl + dirX * v.reach * 0.18
      z += vz - dirX * curl + dirZ * v.reach * 0.18
      y += vy
      nodes.push({ x, y, z })
    }
    return nodes
  }

  // Precompute vine polylines, then collect every leaf into ONE instanced
  // cluster of pothos hearts (heart leaves attached along the vines + an upright
  // crown tuft). Each leaf bases on a stem node, so the drape stays connected.
  const vinesNodes = vines.map(vinePath)
  const leaves: BoxInstance[] = []
  let li = 0
  // Upright central tuft.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.2
    const tilt = 0.25 + (i % 2) * 0.14
    leaves.push({
      position: [Math.sin(a) * 0.02, rimY + 0.01, Math.cos(a) * 0.02],
      size: [0.055, 0.075 + (i % 3) * 0.015, 0.055],
      rotation: [Math.cos(a) * tilt, a, -Math.sin(a) * tilt],
      color: leafTintHex(li++, 1),
    })
  }
  // Leaves along each vine, draping downward.
  vinesNodes.forEach((nodes, vi) => {
    for (let ni = 1; ni < nodes.length; ni++) {
      if (ni % (fullness === 'sparse' ? 2 : 1) !== 0) continue
      const n = nodes[ni]
      const prev = nodes[ni - 1]
      const yaw = Math.atan2(n.x - prev.x, n.z - prev.z)
      const size = 0.05 + (ni % 3) * 0.012
      for (const s of [1, -1]) {
        leaves.push({
          position: [n.x + s * 0.008, n.y, n.z + s * 0.005],
          size: [size, size * 1.25, size],
          rotation: [1.9 + (ni % 3) * 0.16, yaw + s * 0.7, 0],
          color: leafTintHex(li++, vi + 2),
        })
      }
    }
  })

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Base foot — raises the pot a touch so the cascade clears the surface */}
      <mesh receiveShadow position={[0, 0.01, 0]} material={potMat}>
        <cylinderGeometry args={[potRBot * 0.9, potRBot * 0.82, 0.02, r]} />
      </mesh>
      {/* Pot body */}
      <mesh castShadow receiveShadow position={[0, 0.02 + potH / 2, 0]} material={potMat}>
        <cylinderGeometry args={[potRTop, potRBot, potH, r]} />
      </mesh>
      {/* Rim band */}
      <mesh castShadow position={[0, 0.02 + potH, 0]} material={potMat}>
        <cylinderGeometry args={[potRTop + 0.008, potRTop, 0.016, r]} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.02 + potH - 0.01, 0]}>
        <cylinderGeometry args={[potRTop - 0.008, potRTop - 0.008, 0.012, r]} />
        <meshStandardMaterial color="#2c1e0f" roughness={1} />
      </mesh>

      {/* Everything above sits in pot-top space (offset by the foot height) */}
      <group position={[0, 0.02, 0]}>
        {/* Vine stems */}
        {vinesNodes.map((nodes, vi) => (
          <group key={`vine${vi}`}>
            {nodes.slice(0, -1).map((n, ni) => {
              const next = nodes[ni + 1]
              const mx = (n.x + next.x) / 2
              const my = (n.y + next.y) / 2
              const mz = (n.z + next.z) / 2
              const dx = next.x - n.x
              const dy = next.y - n.y
              const dz = next.z - n.z
              const len = Math.hypot(dx, dy, dz) || 0.001
              const yaw = Math.atan2(dx, dz)
              const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)))
              const taper = 1 - ni / (nodes.length * 1.6)
              return (
                <mesh
                  key={`s${ni}`}
                  castShadow
                  position={[mx, my, mz]}
                  rotation={[pitch, yaw, 0]}
                  material={stemMat}
                >
                  <cylinderGeometry args={[0.0045 * taper, 0.0055 * taper, len, 5]} />
                </mesh>
              )
            })}
          </group>
        ))}
        <InstancedLeaves species="pothos" color={leafColor} instances={leaves} />
      </group>
    </group>
  )
}
