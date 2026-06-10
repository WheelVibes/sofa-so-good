import { useMemo } from 'react'
import { BackSide, CanvasTexture, MeshBasicMaterial, SphereGeometry, SRGBColorSpace } from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { useBackdropOffset } from './backdropOffset'
import { Ground } from './Ground'
import { useDisposeOnUnmount } from './geometryUtil'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/**
 * Studio / infinity-cove backdrop — a seamless product-shot cyclorama instead of
 * a bare ground disc: a large unlit gradient dome (lighter at the zenith, gently
 * deeper toward the horizon) wraps the scene so there's no hard skyline, and a
 * matching neutral floor sweeps into it. `MeshBasicMaterial` (unlit, fog-off) so
 * the sweep reads as an evenly-lit studio backdrop on every tier — cheap (one
 * mesh + a tiny gradient texture) and tier-agnostic.
 */
export function StudioBackdrop() {
  const offset = useBackdropOffset()
  const { geo, mat } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 256
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#f4f3f0') // zenith — brightest
    g.addColorStop(0.6, '#ece9e4')
    g.addColorStop(1, '#ddd9d2') // horizon — a touch deeper for a soft falloff
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 256)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    // BackSide so we see the inside of the dome; unlit + fog-off = a clean sweep.
    const geo = new SphereGeometry(170, 24, 16)
    const mat = new MeshBasicMaterial({ map: tex, side: BackSide, fog: false, depthWrite: false })
    return { geo, mat }
  }, [])
  useDisposeOnUnmount([geo, mat, mat.map])

  return (
    <group renderOrder={-1} position={offset}>
      <mesh geometry={geo} material={mat} position={[CX, 0, CZ]} />
      <Ground color="#e7e4de" />
    </group>
  )
}
