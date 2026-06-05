import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/** Wall mirror: thin frame + a low-roughness reflective-looking pane.
 *  Mounted on a wall (group offset up); faces +Z. `shape` is 'rect' (framed
 *  rectangle), 'round' (framed circle, width = diameter) or 'frameless'. */
export function Mirror({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6)
  const height = readNum(props, 'height', 0.9)
  const centerY = readNum(props, 'mountHeight', 1.5)
  const frameColor = readStr(props, 'frameColor', '#c9ccd1')
  const shape = readStr(props, 'shape', 'rect')
  const detail = useDetail()

  // Shared reflective pane — low roughness + metalness picks up the IBL so it
  // reads as a mirror without a real probe; the light base + faint emissive
  // keeps it from going black on the Low tier (IBL off).
  const pane = (
    <meshStandardMaterial
      color="#dfe8ee"
      roughness={0.07}
      metalness={0.7}
      envMapIntensity={2.0}
      emissive="#b9c6d0"
      emissiveIntensity={0.16}
    />
  )

  if (shape === 'round') {
    const r = width / 2
    return (
      <group position={[0, centerY, 0]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.025, 14, seg(40, detail)]} />
          <meshStandardMaterial color={frameColor} roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <circleGeometry args={[r - 0.005, seg(44, detail)]} />
          {pane}
        </mesh>
      </group>
    )
  }

  return (
    <group position={[0, centerY, 0]}>
      {shape !== 'frameless' && (
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[width + 0.04, height + 0.04, 0.03]} />
          <meshStandardMaterial color={frameColor} roughness={0.35} metalness={0.6} />
        </mesh>
      )}
      <mesh position={[0, 0, shape === 'frameless' ? 0.004 : 0.018]}>
        <planeGeometry args={[width, height]} />
        {pane}
      </mesh>
      {/* Frameless gets a slim backing slab so it has presence on the wall */}
      {shape === 'frameless' && (
        <mesh position={[0, 0, -0.004]}>
          <boxGeometry args={[width, height, 0.012]} />
          <meshStandardMaterial color="#5a5e63" roughness={0.5} metalness={0.3} />
        </mesh>
      )}
    </group>
  )
}
