import { getFlutedRibMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes } from './InstancedBoxes'
import { readNum, readStr } from './shared'
import { pitchedCount, pitchedOffsets } from './slatLayout'

/**
 * Fluted / slatted feature wall panel — a floor-to-ceiling backdrop (the
 * popular modern HDB "fluted wood TV wall"). A thin backing board carries N
 * vertical battens: rounded half-dowels for 'fluted', square battens with
 * shadow gaps for 'slat'. Mounted flush against the wall behind it; faces +Z.
 */
export function FeatureWall({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.8)
  const height = readNum(props, 'height', 2.5)
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const style = readStr(props, 'style', 'fluted')

  const mat = getSurfaceMaterial(finish, color, 2, sheen)
  const ribMat = getFlutedRibMaterial(finish, color, 2, sheen)
  const backT = 0.02
  // Batten pitch ~6 cm; at least 6 across the panel.
  const pitch = style === 'slat' ? 0.09 : 0.06
  const n = pitchedCount(width, pitch, 6)
  const step = width / n
  const battenR = style === 'slat' ? step * 0.34 : step * 0.42
  const offsets = pitchedOffsets(width, n)

  // The backing board is a box, and the 'slat' battens are N identical boxes —
  // all share `mat`, so collapse the whole slat panel into ONE InstancedMesh
  // (one draw call) instead of a board + up to ~33 batten meshes. The 'fluted'
  // ribs are half-round cylinders, so they stay as separate meshes (only the
  // shared backing board is instanced there).
  const boxes: BoxInstance[] = [
    { position: [0, height / 2, backT / 2], size: [width, height, backT] },
  ]
  if (style === 'slat') {
    for (const x of offsets) {
      boxes.push({
        position: [x, height / 2, backT + battenR],
        size: [battenR * 2, height - 0.04, battenR * 1.6],
      })
    }
  }

  return (
    <group>
      <InstancedBoxes instances={boxes} castShadow receiveShadow>
        <primitive object={mat} attach="material" />
      </InstancedBoxes>
      {/* Fluted: half-round dowels (cylinders along Y) proud of the board. */}
      {style !== 'slat' &&
        offsets.map((x, i) => (
          <mesh
            key={i}
            castShadow
            position={[x, height / 2, backT + battenR * 0.5]}
            material={ribMat}
          >
            <cylinderGeometry args={[battenR, battenR, height - 0.02, 12]} />
          </mesh>
        ))}
    </group>
  )
}
