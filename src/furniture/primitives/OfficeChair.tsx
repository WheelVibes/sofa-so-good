import { RoundedBox } from '@react-three/drei'
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Darken a #rrggbb hex toward black by factor f (0 = unchanged, 1 = black). */
function darkenHex(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = Number.parseInt(m[1], 16)
  const r = Math.round(((n >> 16) & 0xff) * (1 - f))
  const g = Math.round(((n >> 8) & 0xff) * (1 - f))
  const b = Math.round((n & 0xff) * (1 - f))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Office chair on a 5-star castor base + gas lift. Styles: 'task' (padded
 *  seat + curved back), 'executive' (taller padded back + headrest), 'mesh' (a
 *  slim mesh-panel back), and 'gaming' (a racing bucket seat — winged backrest,
 *  headrest + lumbar pillows, contrast side bolsters). Faces +Z. */
export function OfficeChair({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#2b2f33')
  const detail = useDetail()
  const material = readStr(props, 'material', 'fabric')
  const sheen = readNum(props, 'sheen', 0)
  const pattern = readStr(props, 'pattern', 'plain')
  const style = readStr(props, 'style', 'task')

  const seatH = 0.48
  const seatW = 0.46
  const seatD = 0.46
  const mat = getUpholsteryMaterial(material, color, sheen, pattern)
  // Gaming bucket seat uses a contrast trim (darker shade of the upholstery)
  // for the wings / bolsters / pillows.
  const accent = getUpholsteryMaterial(material, darkenHex(color, 0.45), sheen, pattern)
  const plastic = { color: '#1d1f22', roughness: 0.5, metalness: 0.2 }
  // Polished-steel gas-lift column → shared brushed-metal (the castor base hub /
  // shroud / wheels stay matte black plastic).
  const liftMetal = metalLeg('#9aa0a6', 'stainless')
  const meshMat = { color, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.82 }

  const backH = style === 'executive' ? 0.62 : style === 'gaming' ? 0.7 : 0.5
  const legs = 5

  return (
    <group>
      {/* Castor legs */}
      {Array.from({ length: legs }, (_, i) => {
        const a = (i / legs) * Math.PI * 2
        const lx = Math.sin(a) * 0.26
        const lz = Math.cos(a) * 0.26
        return (
          <group key={i}>
            <mesh castShadow position={[lx / 2, 0.05, lz / 2]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.04, 0.03, 0.28]} />
              <meshStandardMaterial {...plastic} />
            </mesh>
            <mesh castShadow position={[lx, 0.025, lz]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.05, 10]} />
              <meshStandardMaterial color="#0e0f10" roughness={0.4} />
            </mesh>
          </group>
        )
      })}
      {/* Gas lift — runs from the base hub (~0.06) up to the seat underside */}
      {(() => {
        const liftBottom = 0.05
        const liftTop = seatH - 0.05
        const liftH = liftTop - liftBottom
        return (
          <>
            {/* Telescoping column */}
            <mesh castShadow position={[0, (liftBottom + liftTop) / 2, 0]} material={liftMetal}>
              <cylinderGeometry args={[0.03, 0.032, liftH, seg(16, detail)]} />
            </mesh>
            {/* Black plastic shroud over the lower half */}
            <mesh castShadow position={[0, liftBottom + liftH * 0.28, 0]}>
              <cylinderGeometry args={[0.04, 0.045, liftH * 0.5, seg(16, detail)]} />
              <meshStandardMaterial color="#1d1f22" roughness={0.5} metalness={0.2} />
            </mesh>
            {/* Central hub the legs radiate from */}
            <mesh castShadow position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.05, 0.055, 0.06, seg(16, detail)]} />
              <meshStandardMaterial color="#1d1f22" roughness={0.5} metalness={0.2} />
            </mesh>
          </>
        )
      })()}
      {/* Seat (contoured padded cushion) */}
      <RoundedBox
        args={[seatW, 0.11, seatD]}
        radius={0.03}
        smoothness={3}
        castShadow
        position={[0, seatH, 0]}
        material={mat}
      />

      {/* Gaming bucket seat: raised contrast bolsters along the seat sides */}
      {style === 'gaming' &&
        [-1, 1].map((s) => (
          <RoundedBox
            key={s}
            args={[0.07, 0.08, seatD - 0.05]}
            radius={0.03}
            smoothness={3}
            castShadow
            // 6 mm lower than the armrest-post top (seatH+0.10) so the bolster top
            // isn't coplanar with the post top where they meet at the seat corner.
            position={[s * (seatW / 2 - 0.03), seatH + 0.054, 0]}
            material={accent}
          />
        ))}

      {/* Back-support bracket — the moulded arm that carries the backrest up
          from behind the seat, so the back is anchored to the seat rather than
          floating a couple of cm above it (notably in the slim 'mesh' style). */}
      <mesh castShadow position={[0, seatH - 0.01, -seatD / 2 + 0.06]}>
        <boxGeometry args={[0.12, 0.18, 0.05]} />
        <meshStandardMaterial {...plastic} />
      </mesh>

      {/* Back — mesh panel, or padded (task/executive) with a slight recline */}
      <group position={[0, seatH + 0.08, -seatD / 2 + 0.05]} rotation={[0.08, 0, 0]}>
        {style === 'mesh' ? (
          <>
            {/* Slim frame + translucent mesh panel */}
            <mesh castShadow position={[0, backH / 2, 0]}>
              <boxGeometry args={[seatW - 0.02, backH, 0.012]} />
              <meshStandardMaterial {...meshMat} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} castShadow position={[s * (seatW / 2 - 0.02), backH / 2, 0]}>
                <boxGeometry args={[0.025, backH, 0.03]} />
                <meshStandardMaterial {...plastic} />
              </mesh>
            ))}
            {/* Lumbar support bar */}
            <mesh castShadow position={[0, backH * 0.32, 0.02]}>
              <boxGeometry args={[seatW - 0.06, 0.05, 0.02]} />
              <meshStandardMaterial {...plastic} />
            </mesh>
          </>
        ) : style === 'gaming' ? (
          <>
            {/* Padded bucket back panel */}
            <RoundedBox
              args={[seatW - 0.04, backH, 0.09]}
              radius={0.04}
              smoothness={3}
              castShadow
              position={[0, backH / 2, 0]}
              material={mat}
            />
            {/* Winged side bolsters (contrast), angled outward */}
            {[-1, 1].map((s) => (
              <RoundedBox
                key={s}
                args={[0.07, backH * 0.82, 0.14]}
                radius={0.035}
                smoothness={3}
                castShadow
                position={[s * (seatW / 2 - 0.05), backH * 0.52, 0.03]}
                rotation={[0, 0, s * -0.08]}
                material={accent}
              />
            ))}
            {/* Lumbar pillow */}
            <RoundedBox
              args={[seatW - 0.18, 0.14, 0.07]}
              radius={0.035}
              smoothness={3}
              castShadow
              position={[0, backH * 0.26, 0.06]}
              material={accent}
            />
            {/* Headrest pillow on the back top */}
            <RoundedBox
              args={[seatW - 0.2, 0.15, 0.08]}
              radius={0.04}
              smoothness={3}
              castShadow
              position={[0, backH + 0.01, 0.03]}
              material={accent}
            />
          </>
        ) : (
          <RoundedBox
            args={[seatW - 0.02, backH, 0.08]}
            radius={0.04}
            smoothness={3}
            castShadow
            position={[0, backH / 2, 0]}
            material={mat}
          />
        )}
        {/* Executive headrest */}
        {style === 'executive' && (
          <RoundedBox
            args={[seatW - 0.12, 0.16, 0.07]}
            radius={0.04}
            smoothness={3}
            castShadow
            position={[0, backH + 0.06, 0]}
            material={mat}
          />
        )}
      </group>

      {/* Armrests (padded tops) */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh castShadow position={[s * (seatW / 2 + 0.005), seatH + 0.02, 0.02]}>
            <boxGeometry args={[0.03, 0.16, 0.03]} />
            <meshStandardMaterial {...plastic} />
          </mesh>
          <RoundedBox
            args={[0.06, 0.03, 0.22]}
            radius={0.012}
            smoothness={2}
            castShadow
            position={[s * (seatW / 2 + 0.005), seatH + 0.12, 0.02]}
          >
            <meshStandardMaterial {...plastic} />
          </RoundedBox>
        </group>
      ))}
    </group>
  )
}
