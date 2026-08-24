import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { MetalMaterial } from './MetalMaterial'
import { metalLeg, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Dog crate (parametric) — a floor-standing crate sized XXS–M (Singapore HDB
 * allows only small approved breeds, so the range stops at Medium). Two styles:
 *
 *  - `wire` — the classic collapsible wire crate: thin bright bars on all four
 *    sides + roof, a moulded plastic tray base, and a barred front door with a
 *    latch. Reads unmistakably as a crate.
 *  - `furniture` — the popular SG wood-top crate that doubles as a side table:
 *    a solid overhanging timber top, corner posts, vertical wood slats on the
 *    sides/back and a slatted front door with a knob. Reads as furniture.
 *
 * Floor-anchored, footprint-centred, faces +Z (door on the front). Real metres.
 * Every member connects (posts reach floor→top, rails tie the corners).
 */
export const CRATE_SIZES: Record<string, { w: number; d: number; h: number }> = {
  XXS: { w: 0.41, d: 0.28, h: 0.23 },
  XS: { w: 0.46, d: 0.31, h: 0.33 },
  S: { w: 0.51, d: 0.36, h: 0.41 },
  M: { w: 0.61, d: 0.46, h: 0.51 },
}

export function DogCrate({ props }: { props: ParamProps }) {
  const size = readStr(props, 'size', 'S')
  const style = readStr(props, 'style', 'wire')
  const color = readStr(props, 'color', '#6b6f76')
  const woodColor = readStr(props, 'woodColor', '#9d7c54')
  const finish = readStr(props, 'finish', 'wood')
  const detail = useDetail()
  const r = seg(12, detail)

  const dim = CRATE_SIZES[size] ?? CRATE_SIZES.S
  const w = dim.w
  const d = dim.d
  const h = dim.h
  const halfW = w / 2
  const halfD = d / 2

  if (style === 'furniture') {
    const wood = getSurfaceMaterial(finish, woodColor, 1.1)
    const topT = 0.03
    const postT = 0.04
    const overhang = 0.03
    const bodyH = h - topT
    // Vertical slats on a side of the given length (along local X or Z).
    const slats = (length: number) => {
      const slatW = 0.035
      const gap = 0.03
      const n = Math.max(2, Math.floor((length - slatW) / (slatW + gap)))
      const pitch = (length - slatW) / (n - 1)
      return Array.from({ length: n }, (_, i) => -length / 2 + slatW / 2 + i * pitch)
    }
    const innerLen = (full: number) => full - 2 * postT
    return (
      <group>
        {/* Overhanging solid top — the side-table surface. */}
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, h - topT / 2, 0]}
          material={wood}
          args={[w + overhang, topT, d + overhang]}
        />
        {/* Base floor panel. */}
        <BeveledBox
          receiveShadow
          position={[0, 0.012, 0]}
          material={wood}
          args={[w - 2 * postT, 0.024, d - 2 * postT]}
        />
        {/* Four corner posts. */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <BeveledBox
              key={`post${sx}${sz}`}
              castShadow
              receiveShadow
              position={[sx * (halfW - postT / 2), bodyH / 2 + 0.024, sz * (halfD - postT / 2)]}
              material={wood}
              args={[postT, bodyH, postT]}
            />
          )),
        )}
        {/* Back slats (−Z) + two side slat runs. Front is the door. */}
        {slats(innerLen(w)).map((x) => (
          <BeveledBox
            key={`bslat${x.toFixed(3)}`}
            castShadow
            position={[x, bodyH / 2 + 0.024, -halfD + postT / 2]}
            material={wood}
            args={[0.035, bodyH - 0.02, 0.02]}
          />
        ))}
        {[-1, 1].map((sz) =>
          slats(innerLen(d)).map((z) => (
            <BeveledBox
              key={`sslat${sz}${z.toFixed(3)}`}
              castShadow
              position={[sz * (halfW - postT / 2), bodyH / 2 + 0.024, z]}
              material={wood}
              args={[0.02, bodyH - 0.02, 0.035]}
            />
          )),
        )}
        {/* Front door: a slatted panel inset between the front posts + a knob. */}
        {slats(innerLen(w)).map((x) => (
          <BeveledBox
            key={`dslat${x.toFixed(3)}`}
            castShadow
            position={[x, bodyH / 2 + 0.024, halfD - postT / 2]}
            material={wood}
            args={[0.035, bodyH - 0.02, 0.02]}
          />
        ))}
        <mesh castShadow position={[halfW - 0.1, bodyH / 2 + 0.024, halfD + 0.005]}>
          <sphereGeometry args={[0.014, 10, 10]} />
          <MetalMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
        </mesh>
      </group>
    )
  }

  // Wire crate: bright metal bars over a dark plastic tray.
  const bars = metalLeg(color, 'satin')
  const barT = 0.008
  const tray = getSurfaceMaterial('painted', '#33363b', 1)
  // Evenly-spaced positions along `length` at ≈6 cm pitch (bounded).
  const spread = (length: number, pitch = 0.06) => {
    const n = Math.max(2, Math.min(14, Math.round(length / pitch) + 1))
    return Array.from({ length: n }, (_, i) => -length / 2 + (length * i) / (n - 1))
  }
  const barTop = h - 0.01
  return (
    <group>
      {/* Moulded plastic tray base. */}
      <BeveledBox
        receiveShadow
        position={[0, 0.02, 0]}
        material={tray}
        args={[w * 0.98, 0.04, d * 0.98]}
      />
      {/* Corner posts. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`wp${sx}${sz}`}
            castShadow
            position={[sx * (halfW - barT), (barTop + 0.04) / 2, sz * (halfD - barT)]}
            material={bars}
          >
            <cylinderGeometry args={[barT / 2, barT / 2, barTop - 0.04, r]} />
          </mesh>
        )),
      )}
      {/* Top + upper + lower perimeter rails (4 sides each). */}
      {[0.05, barTop * 0.5 + 0.02, barTop].map((y, ri) => (
        <group key={`rail${ri}`}>
          {[-1, 1].map((sz) => (
            <mesh
              key={`rx${sz}`}
              castShadow
              position={[0, y, sz * (halfD - barT)]}
              rotation={[0, 0, Math.PI / 2]}
              material={bars}
            >
              <cylinderGeometry args={[barT / 2, barT / 2, w - barT, r]} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh
              key={`rz${sx}`}
              castShadow
              position={[sx * (halfW - barT), y, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={bars}
            >
              <cylinderGeometry args={[barT / 2, barT / 2, d - barT, r]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Vertical bars: back (−Z) + two sides. Front is the door. */}
      {spread(w).map((x) => (
        <mesh
          key={`vb${x.toFixed(3)}`}
          castShadow
          position={[x, (barTop + 0.04) / 2, -halfD + barT]}
          material={bars}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, barTop - 0.04, r]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) =>
        spread(d).map((z) => (
          <mesh
            key={`vs${sx}${z.toFixed(3)}`}
            castShadow
            position={[sx * (halfW - barT), (barTop + 0.04) / 2, z]}
            material={bars}
          >
            <cylinderGeometry args={[barT / 2, barT / 2, barTop - 0.04, r]} />
          </mesh>
        )),
      )}
      {/* Roof bars spanning front→back. */}
      {spread(w).map((x) => (
        <mesh
          key={`rf${x.toFixed(3)}`}
          castShadow
          position={[x, barTop, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          material={bars}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, d - barT, r]} />
        </mesh>
      ))}
      {/* Front door: vertical bars + a latch knob. */}
      {spread(w).map((x) => (
        <mesh
          key={`db${x.toFixed(3)}`}
          castShadow
          position={[x, (barTop + 0.04) / 2, halfD - barT]}
          material={bars}
        >
          <cylinderGeometry args={[barT / 2, barT / 2, barTop - 0.04, r]} />
        </mesh>
      ))}
      <mesh castShadow position={[halfW - 0.06, barTop * 0.5, halfD]} material={bars}>
        <boxGeometry args={[0.05, 0.03, 0.012]} />
      </mesh>
    </group>
  )
}
