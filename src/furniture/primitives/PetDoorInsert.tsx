import { useMemo } from 'react'
import { getSolidMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/**
 * Pet-door insert (`doorBound`) — a sill-height panel that fills the bottom slice
 * of a doorway, carrying a small hinged flap so a pet can pass while the door
 * stays shut. Built in the wall plane like the pet gate: X across the opening, Y
 * from the floor (0) up to the panel head, thin in Z, facing +Z. The flap sits
 * in a slightly inset frame so it reads as a real flap, centred low in the panel.
 */
const FLAP_SIZE: Record<string, { w: number; h: number }> = {
  S: { w: 0.2, h: 0.24 },
  M: { w: 0.3, h: 0.34 },
}

export function PetDoorInsert({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.82)
  const frameColor = readStr(props, 'frameColor', '#c9c4bb')
  const size = readStr(props, 'flapSize', 'M')
  const flap = FLAP_SIZE[size] ?? FLAP_SIZE.M

  // Panel tall enough to host the flap + a margin; sill-height (well below head).
  const panelH = flap.h + 0.22
  const depth = 0.04
  const panelMat = useMemo(() => getSolidMaterial(frameColor, 0.7, 0.2), [frameColor])
  const flapMat = useMemo(() => getSolidMaterial('#8f8a80', 0.55, 0.25), [])
  const frameMat = useMemo(() => getSolidMaterial(frameColor, 0.6, 0.3), [frameColor])

  const flapCx = 0
  const flapCy = 0.06 + flap.h / 2
  const inset = 0.02
  const fr = 0.02 // flap frame member thickness
  // The insert is conceptually IN the door: offset the whole panel off the wall
  // centreline toward the drop side (doorSnap faces local +Z there) so it reads
  // as MOUNTED ON the closed leaf rather than z-fighting inside it. It does NOT
  // cut a real hole in the door — the leaf mesh stays whole; this is an honest
  // surface-mounted flap panel. (Accepted: opening the door swings the leaf
  // through this plane; a swing-aware exclusion is out of scope.)
  const zInset = 0.03

  return (
    <group position={[0, 0, zInset]}>
      {/* Sill-height solid panel with a flap-sized aperture (approximated as a
          recessed dark flap over the panel, framed). */}
      <mesh position={[0, panelH / 2, 0]} material={panelMat} castShadow receiveShadow>
        <boxGeometry args={[width, panelH, depth]} />
      </mesh>
      {/* The flap itself — a slightly proud panel in a recessed frame. */}
      <mesh position={[flapCx, flapCy, depth / 2]} material={flapMat}>
        <boxGeometry args={[flap.w, flap.h, 0.012]} />
      </mesh>
      {/* Inset frame around the flap (top/bottom/left/right members). */}
      {[flapCy + flap.h / 2 + inset / 2, flapCy - flap.h / 2 - inset / 2].map((y, i) => (
        <mesh key={`fh${i}`} position={[flapCx, y, depth / 2]} material={frameMat}>
          <boxGeometry args={[flap.w + 2 * inset + fr, fr, 0.02]} />
        </mesh>
      ))}
      {[flapCx - flap.w / 2 - inset - fr / 2, flapCx + flap.w / 2 + inset + fr / 2].map((x, i) => (
        <mesh key={`fv${i}`} position={[x, flapCy, depth / 2]} material={frameMat}>
          <boxGeometry args={[fr, flap.h + 2 * inset + fr, 0.02]} />
        </mesh>
      ))}
    </group>
  )
}
