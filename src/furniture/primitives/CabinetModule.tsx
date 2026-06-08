import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { buildCabinet, type CabinetFront, type CabinetType } from '../cabinet/cabinetModel'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Parametric cabinet primitives (K1) — render the pure `buildCabinet` model as
 * textured meshes. All structural geometry lives in `cabinet/cabinetModel.ts`;
 * this file maps each `CabinetPart` role to a material + adds the light cosmetic
 * detailing (shaker rails) the model leaves to the renderer.
 *
 * The cabinet `type` (base / wall / tall) is baked into the component — one thin
 * wrapper per type — rather than threaded through a prop, matching the
 * one-primitive-per-PrimitiveKind convention and keeping the editable
 * paramSchema free of a non-editable type field.
 */
function CabinetBody({ props, type }: { props: ParamProps; type: CabinetType }) {
  const front = readStr(props, 'front', 'slab') as CabinetFront
  const color = readStr(props, 'color', '#e6e2d8')
  const finish = readStr(props, 'finish', 'painted')
  const sheen = readNum(props, 'sheen', 0)
  const worktopColor = readStr(props, 'worktopColor', '#34373d')

  const model = buildCabinet({
    type,
    width: readNum(props, 'width', 0.6),
    height: readNum(props, 'height', type === 'tall' ? 2.0 : 0.72),
    depth: readNum(props, 'depth', type === 'wall' ? 0.35 : 0.6),
    columns: readNum(props, 'columns', type === 'tall' ? 1 : 2),
    front,
    toeKick: readNum(props, 'toeKick', 0.1),
    countertop: readStr(props, 'countertop', 'yes') === 'yes',
    countertopThickness: readNum(props, 'countertopThickness', 0.04),
    cornice: readStr(props, 'cornice', 'no') === 'yes',
    drawerRows: readNum(props, 'drawerRows', 3),
  })

  const bodyMat = getSurfaceMaterial(finish, color, 1, sheen)
  const handleMat = { color: '#8a8d92', roughness: 0.3, metalness: 0.7 } as const

  return (
    <group>
      {model.parts.map((p, i) => {
        const key = `${p.role}-${i}`
        if (p.role === 'countertop') {
          return (
            <mesh key={key} castShadow receiveShadow position={p.position}>
              <boxGeometry args={p.size} />
              <meshStandardMaterial color={worktopColor} roughness={0.22} metalness={0.15} />
            </mesh>
          )
        }
        if (p.role === 'glass') {
          return (
            <mesh key={key} position={p.position}>
              <boxGeometry args={p.size} />
              <meshStandardMaterial
                color="#cfe0e6"
                roughness={0.05}
                metalness={0.1}
                transparent
                opacity={0.35}
              />
            </mesh>
          )
        }
        if (p.role === 'handle') {
          return (
            <mesh key={key} castShadow position={p.position}>
              <boxGeometry args={p.size} />
              <meshStandardMaterial {...handleMat} />
            </mesh>
          )
        }
        // carcass / toeKick / cornice / door / drawer / shelf share the body
        // material. Shaker doors get a recessed-panel frame drawn on top.
        const isShakerDoor = p.role === 'door' && front === 'shaker'
        return (
          <group key={key}>
            <mesh castShadow receiveShadow position={p.position} material={bodyMat}>
              <boxGeometry args={p.size} />
            </mesh>
            {isShakerDoor &&
              shakerRails(p.size[0], p.size[1]).map(([dx, dy, bw, bh], k) => (
                <mesh
                  key={k}
                  position={[p.position[0] + dx, p.position[1] + dy, p.position[2] + 0.004]}
                  material={bodyMat}
                >
                  <boxGeometry args={[bw, bh, 0.01]} />
                </mesh>
              ))}
          </group>
        )
      })}
    </group>
  )
}

export function CabinetBase({ props }: { props: ParamProps }) {
  return <CabinetBody props={props} type="base" />
}
export function CabinetWall({ props }: { props: ParamProps }) {
  return <CabinetBody props={props} type="wall" />
}
export function CabinetTall({ props }: { props: ParamProps }) {
  return <CabinetBody props={props} type="tall" />
}

/** Four proud border rails framing a recessed shaker panel, sized to the door. */
function shakerRails(w: number, h: number): [number, number, number, number][] {
  const rail = 0.05
  return [
    [0, h / 2 - rail / 2, w - 0.08, rail],
    [0, -h / 2 + rail / 2, w - 0.08, rail],
    [-w / 2 + 0.04, 0, rail, h - 2 * rail],
    [w / 2 - 0.04, 0, rail, h - 2 * rail],
  ]
}
