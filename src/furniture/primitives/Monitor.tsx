import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { getScreenContent } from './screenContent'
import { readNum, readStr } from './shared'

/** Desktop monitor that sits on a desk: base + stem + panel. Its geometry
 *  starts at desk height (≈0.74 m) so it rests on a desktop when placed at a
 *  desk's position. Faces +Z (screen toward the viewer/seat at +Z). */
export function Monitor({ props }: { props: ParamProps }) {
  const diagIn = Number(readStr(props, 'size', '27')) || 27
  const deskH = readNum(props, 'deskHeight', 0.74)
  const screenColor = readStr(props, 'screenColor', '#10131a')
  const on = readStr(props, 'screen', 'off') === 'on'
  const content = readStr(props, 'screenContent', 'landscape')

  const diagM = diagIn * 0.0254
  const w = diagM * 0.87
  const h = diagM * 0.49
  const panelY = deskH + 0.06 + h / 2

  return (
    <group>
      {/* Base */}
      <BeveledBox
        args={[0.22, 0.016, 0.16]}
        bevel={0.003}
        castShadow
        receiveShadow
        position={[0, deskH + 0.008, 0.02]}
      >
        <meshStandardMaterial color="#26282d" roughness={0.5} metalness={0.4} />
      </BeveledBox>
      {/* Stem */}
      <BeveledBox
        args={[0.04, 0.12, 0.03]}
        bevel={0.003}
        castShadow
        position={[0, deskH + 0.06, -0.02]}
      >
        <meshStandardMaterial color="#26282d" roughness={0.5} metalness={0.4} />
      </BeveledBox>
      {/* Bezel */}
      <BeveledBox args={[w, h, 0.03]} bevel={0.003} castShadow position={[0, panelY, 0]}>
        <meshStandardMaterial color="#15171b" roughness={0.5} metalness={0.3} />
      </BeveledBox>
      {/* Screen — dark when off, lit wallpaper that self-illuminates when on.
          Flush in the bezel by design (coplanar overlay) → depthWrite off so it
          draws in front without z-fighting the bezel at grazing angles. */}
      <mesh position={[0, panelY, 0.017]}>
        <planeGeometry args={[w - 0.02, h - 0.02]} />
        {on ? (
          <meshStandardMaterial
            map={getScreenContent(content)}
            emissiveMap={getScreenContent(content)}
            emissive="#ffffff"
            // HDR (>1) so the lit screen reads self-lit + blooms (PHOTO-EMISSIVE).
            emissiveIntensity={1.15}
            roughness={0.2}
            metalness={0}
            toneMapped={false}
            depthWrite={false}
          />
        ) : (
          <meshStandardMaterial
            color={screenColor}
            roughness={0.16}
            metalness={0.1}
            emissive={screenColor}
            emissiveIntensity={0.15}
            depthWrite={false}
          />
        )}
      </mesh>
    </group>
  )
}
