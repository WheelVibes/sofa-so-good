import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { drawerSlideDistance, isCabinetOpen } from '../cabinetOpen'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { SlideDrawer } from './openable'
import { readNum, readStr } from './shared'

/** Wide chest of drawers: body + a grid of drawer fronts. `handle` picks the
 *  hardware (round knob / horizontal bar pull / recessed top reveal) and
 *  `base` sits it on short legs or a recessed plinth. Faces +Z.
 *
 *  `variant: 'pedestal'` turns it into a slim under-desk mobile drawer pedestal
 *  on swivel castors — a shorter body (~desk-clearance height) rolling on four
 *  castors instead of legs/plinth (the `base` enum is ignored in that mode). */
export function Dresser({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2)
  const depth = readNum(props, 'depth', 0.5)
  const rows = Math.max(2, Math.round(readNum(props, 'rows', 3)))
  const cols = Math.max(1, Math.round(readNum(props, 'cols', 2)))
  const color = readStr(props, 'color', '#8a6b48')
  const finish = readStr(props, 'finish', 'wood')
  const sheen = readNum(props, 'sheen', 0)
  const handle = readStr(props, 'handle', 'knob')
  const base = readStr(props, 'base', 'legs')
  const variant = readStr(props, 'variant', 'chest')
  const isPedestal = variant === 'pedestal'

  const legH = isPedestal ? 0.06 : 0.08
  const bodyH = isPedestal ? 0.54 : 0.85
  const wood = getSurfaceMaterial(finish, color, 1.6, sheen)
  const metal = { color: '#2b2b2b', roughness: 0.4, metalness: 0.6 }
  const gap = 0.02
  const dw = (width - gap * (cols + 1)) / cols
  const dh = (bodyH - gap * (rows + 1)) / rows
  const isOpen = isCabinetOpen(props)
  const drawerSlide = drawerSlideDistance(depth)

  return (
    <group>
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, legH + bodyH / 2, 0]}
        material={wood}
        args={[width, bodyH, depth]}
      />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const x = -width / 2 + gap + dw / 2 + c * (dw + gap)
          const y = legH + gap + dh / 2 + r * (dh + gap)
          return (
            <SlideDrawer key={`${r}.${c}`} open={isOpen} distance={drawerSlide}>
              <BeveledBox
                position={[x, y, depth / 2 + 0.003]}
                material={wood}
                args={[dw, dh, 0.02]}
              />
              {handle === 'knob' && (
                <mesh position={[x, y, depth / 2 + 0.03]}>
                  <sphereGeometry args={[0.018, 12, 10]} />
                  <meshStandardMaterial {...metal} />
                </mesh>
              )}
              {handle === 'bar' && (
                <mesh position={[x, y, depth / 2 + 0.028]}>
                  <boxGeometry args={[Math.min(dw * 0.5, 0.16), 0.016, 0.018]} />
                  <meshStandardMaterial {...metal} />
                </mesh>
              )}
              {handle === 'recessed' && (
                <mesh position={[x, y + dh / 2 - 0.02, depth / 2 + 0.006]}>
                  <boxGeometry args={[dw * 0.6, 0.012, 0.012]} />
                  <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.4} />
                </mesh>
              )}
            </SlideDrawer>
          )
        }),
      )}
      {isPedestal ? (
        // Four swivel castors: a dark housing socketing into the body underside
        // + a wheel touching the floor (the assembly runs body → housing →
        // wheel to the floor, so it stays one grounded component).
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => {
            const cx = sx * (width / 2 - 0.06)
            const cz = sz * (depth / 2 - 0.08)
            const wheelR = 0.026
            return (
              <group key={`${sx}.${sz}`}>
                {/* Housing: from the wheel up into the body underside */}
                <mesh castShadow position={[cx, legH - 0.015, cz]}>
                  <cylinderGeometry args={[0.016, 0.016, 0.03, 10]} />
                  <meshStandardMaterial color="#2b2b2b" roughness={0.5} metalness={0.5} />
                </mesh>
                {/* Wheel: touches the floor at y=0 */}
                <mesh castShadow position={[cx, wheelR, cz]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[wheelR, wheelR, 0.018, 12]} />
                  <meshStandardMaterial color="#1e1e1e" roughness={0.6} metalness={0.3} />
                </mesh>
              </group>
            )
          }),
        )
      ) : base === 'legs' ? (
        [-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <BeveledBox
              key={`${sx}.${sz}`}
              castShadow
              position={[sx * (width / 2 - 0.06), legH / 2, sz * (depth / 2 - 0.06)]}
              args={[0.05, legH, 0.05]}
            >
              <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.1} />
            </BeveledBox>
          )),
        )
      ) : (
        <BeveledBox
          castShadow
          receiveShadow
          position={[0, legH / 2, 0.01]}
          material={wood}
          args={[width - 0.08, legH, depth - 0.06]}
        />
      )}
    </group>
  )
}
