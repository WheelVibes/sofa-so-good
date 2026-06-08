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
    sink: readStr(props, 'sink', 'no') === 'yes',
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
      {model.sinkCutout && <SinkBasin cut={model.sinkCutout} />}
    </group>
  )
}

/** Stainless basin + faucet dropped into a worktop cut-out (`SinkCutout`). The
 *  bowl is an open box (floor + 4 inset walls) recessed below the rim so no face
 *  is coplanar with the worktop (avoids z-fighting), mirroring KitchenCounter. */
function SinkBasin({ cut }: { cut: NonNullable<ReturnType<typeof buildCabinet>['sinkCutout']> }) {
  const steel = { color: '#b7bdc2', roughness: 0.25, metalness: 0.8 } as const
  const wallT = 0.02
  const bw = cut.w - 0.02
  const bd = cut.d - 0.02
  const rimY = cut.topY - 0.008
  const floorY = cut.topY - 0.18 // bowl depth ~17 cm
  const wallH = rimY - floorY
  const wallCY = floorY + wallH / 2
  const walls: [number, number, number, number][] = [
    [-bw / 2 + wallT / 2, 0, wallT, bd],
    [bw / 2 - wallT / 2, 0, wallT, bd],
    [0, -bd / 2 + wallT / 2, bw, wallT],
    [0, bd / 2 - wallT / 2, bw, wallT],
  ]
  return (
    <group position={[cut.x, 0, cut.z]}>
      <mesh receiveShadow position={[0, floorY, 0]}>
        <boxGeometry args={[bw - wallT * 2, 0.016, bd - wallT * 2]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      {walls.map(([dx, dz, sw, sd], k) => (
        <mesh key={k} receiveShadow position={[dx, wallCY, dz]}>
          <boxGeometry args={[sw, wallH, sd]} />
          <meshStandardMaterial {...steel} />
        </mesh>
      ))}
      {/* Faucet: base + riser + curved spout, at the back edge of the bowl. */}
      <mesh castShadow position={[0, cut.topY + 0.02, -bd / 2 - 0.03]}>
        <cylinderGeometry args={[0.03, 0.035, 0.04, 12]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      <mesh castShadow position={[0, cut.topY + 0.15, -bd / 2 - 0.03]}>
        <cylinderGeometry args={[0.014, 0.014, 0.26, 10]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      <mesh
        castShadow
        position={[0, cut.topY + 0.27, -bd / 2 + 0.04]}
        rotation={[Math.PI / 2.2, 0, 0]}
      >
        <cylinderGeometry args={[0.013, 0.013, 0.18, 10]} />
        <meshStandardMaterial {...steel} />
      </mesh>
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
