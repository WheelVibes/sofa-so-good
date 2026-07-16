import { getFabricMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { readNum, readStr } from './shared'

/**
 * Dog ramp / steps — pet access up to a sofa seat or bed (0.4–0.7 m). Two
 * styles:
 *  - `ramp` — an inclined carpeted board rising from the floor (+Z front, low)
 *    to `height` at the back (−Z, against the sofa), on side skirts + a support
 *    under the high end so it never floats.
 *  - `steps` — carpeted box steps, count derived from the height at a comfy
 *    ~16 cm rise.
 * Optional side rails on either style. Floor-anchored, footprint-centred, faces
 * +Z, `length` = the run into the room. Real metres.
 */
export function DogRamp({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.4)
  const length = readNum(props, 'length', 0.95)
  const height = readNum(props, 'height', 0.45)
  const style = readStr(props, 'style', 'ramp')
  const rails = readStr(props, 'rails', 'no')
  const treadColor = readStr(props, 'tread', '#7d746a')
  const frameColor = readStr(props, 'frame', '#6b5947')

  const carpet = getFabricMaterial(treadColor, 0.97)
  const frame = getSurfaceMaterial('painted', frameColor, 1)
  const w = width
  const halfW = w / 2

  if (style === 'steps') {
    const rise = 0.16
    const n = Math.max(2, Math.min(4, Math.round(height / rise)))
    const rh = height / n
    const td = length / n
    const frontZ = length / 2
    const steps = Array.from({ length: n }, (_, i) => {
      const boxH = (i + 1) * rh
      const zc = frontZ - td / 2 - i * td
      return { boxH, zc }
    })
    return (
      <group>
        {steps.map((s, i) => (
          <BeveledBox
            key={`step${i}`}
            castShadow
            receiveShadow
            position={[0, s.boxH / 2, s.zc]}
            material={carpet}
            args={[w, s.boxH, td]}
            bevel={0.012}
          />
        ))}
        {rails === 'yes'
          ? [-1, 1].map((s) => (
              <RailStrip
                key={s}
                x={s * (halfW + 0.012)}
                length={length}
                height={height}
                material={frame}
              />
            ))
          : null}
      </group>
    )
  }

  // Ramp: an inclined carpeted board on two side skirts + a high-end support.
  const theta = Math.atan2(height, length)
  const slabLen = Math.hypot(length, height)
  const slabT = 0.035
  const skirtT = 0.02
  return (
    <group>
      {/* Inclined tread board (+Z low → −Z high). */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, height / 2, 0]}
        rotation={[theta, 0, 0]}
        material={carpet}
        args={[w, slabT, slabLen]}
        bevel={0.012}
      />
      {/* Side skirts under the board edges (same incline). */}
      {[-1, 1].map((s) => (
        <mesh
          key={`skirt${s}`}
          castShadow
          receiveShadow
          position={[s * (halfW - skirtT / 2), height / 2 - 0.05, 0]}
          rotation={[theta, 0, 0]}
          material={frame}
        >
          <boxGeometry args={[skirtT, 0.08, slabLen]} />
        </mesh>
      ))}
      {/* Support post under the high (back) end so the ramp is grounded. */}
      <mesh
        castShadow
        receiveShadow
        position={[0, height / 2 - 0.02, -length / 2 + 0.05]}
        material={frame}
      >
        <boxGeometry args={[w - 2 * skirtT, height - 0.04, 0.05]} />
      </mesh>
      {rails === 'yes'
        ? [-1, 1].map((s) => (
            <RailStrip
              key={s}
              x={s * (halfW + 0.012)}
              length={length}
              height={height}
              material={frame}
            />
          ))
        : null}
    </group>
  )
}

/** A thin diagonal side rail running from the floor front up to the high end. */
function RailStrip({
  x,
  length,
  height,
  material,
}: {
  x: number
  length: number
  height: number
  material: import('three').Material
}) {
  const theta = Math.atan2(height, length)
  const len = Math.hypot(length, height)
  return (
    <mesh
      castShadow
      position={[x, height / 2 + 0.11, 0]}
      rotation={[theta, 0, 0]}
      material={material}
    >
      <boxGeometry args={[0.02, 0.05, len]} />
    </mesh>
  )
}
