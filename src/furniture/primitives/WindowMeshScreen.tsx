import { useMemo } from 'react'
import { DoubleSide, RepeatWrapping, type Texture } from 'three'
import type { ParamProps } from '../types'
import { getMeshGridTexture } from './meshGridTexture'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Window / balcony safety mesh screen (Cat Management Framework compliance) —
 * a slim internal frame around the window opening filled with a fine wire mesh
 * (aperture ≤5 cm — the "cat-head rule"). Built to read as *safety mesh*, not a
 * fly screen or an opaque panel: the fill is an alpha-mapped plane carrying a
 * procedurally canvas-drawn grid texture (tiled to the chosen wire density) so
 * the grid reads through at typical zoom with near-zero geometry cost.
 *
 * A `windowBound` fixture: placement snaps it onto the nearest window and sizes
 * it (`windowFixtureProps` supplies `width`/`sillY`/`topY`), so the primitive is
 * built in the wall plane — X across the opening, Y from sill to head, thin in
 * Z, facing the room interior (+Z). Real metres. Internal mounting only (a small
 * +Z inset off the glass), per HDB/BCA façade rules.
 */

/** Physical wire spacing (m) per density. Fine reads as a taut cat-safe mesh;
 *  standard is a coarser insect-screen look. Both stay ≤5 cm apertures. */
const CELL_M: Record<string, number> = { fine: 0.014, standard: 0.028 }

export function WindowMeshScreen({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2)
  const sillY = readNum(props, 'sillY', 0.9)
  const topY = readNum(props, 'topY', 2.1)
  const frameColor = readStr(props, 'frameColor', '#3a3d42')
  const frameFinish = readStr(props, 'frameFinish', 'satin')
  const density = readStr(props, 'density', 'fine')
  const style = readStr(props, 'frameStyle', 'slim')

  const height = Math.max(0.1, topY - sillY)
  const midY = sillY + height / 2
  // Frame member cross-section + how far it stands off the glass into the room.
  const bar = style === 'box' ? 0.035 : 0.022
  const depth = style === 'box' ? 0.06 : 0.03
  const zInset = 0.04 // internal mounting: a small stand-off from the glass

  const cell = CELL_M[density] ?? CELL_M.fine
  const wireColor = readStr(props, 'meshColor', '#2b2d31')

  const frameMat = useMemo(
    () => metalLeg(frameColor, frameFinish === 'black-steel' ? 'black-steel' : 'satin'),
    [frameColor, frameFinish],
  )

  const meshTex = useMemo<Texture>(() => {
    const t = getMeshGridTexture(wireColor).clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(Math.max(2, Math.round(width / cell)), Math.max(2, Math.round(height / cell)))
    return t
  }, [wireColor, width, height, cell])

  const halfW = width / 2
  return (
    <group>
      {/* Mesh fill — one thin plane spanning the inner opening. The grid texture's
          own alpha channel cuts the cells to see-through and keeps the wires, so
          it reads as fine safety mesh rather than an opaque panel. */}
      <mesh position={[0, midY, zInset]}>
        <planeGeometry args={[width - bar, height - bar]} />
        <meshStandardMaterial
          map={meshTex}
          transparent
          side={DoubleSide}
          depthWrite={false}
          roughness={0.85}
          metalness={0.1}
        />
      </mesh>
      {/* Slim frame: four members boxing the opening. */}
      {/* Top + bottom rails */}
      {[topY - bar / 2, sillY + bar / 2].map((y, i) => (
        <mesh key={`h${i}`} position={[0, y, zInset]} material={frameMat} castShadow>
          <boxGeometry args={[width, bar, depth]} />
        </mesh>
      ))}
      {/* Left + right stiles */}
      {[-halfW + bar / 2, halfW - bar / 2].map((x, i) => (
        <mesh key={`v${i}`} position={[x, midY, zInset]} material={frameMat} castShadow>
          <boxGeometry args={[bar, height, depth]} />
        </mesh>
      ))}
    </group>
  )
}
