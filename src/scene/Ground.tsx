import { useMemo } from 'react'
import { MeshStandardMaterial } from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { useDisposeOnUnmount } from './geometryUtil'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/** Far estate ground disc, just below the apartment slab. Shared by backdrops. */
export function Ground({ color }: { color: string }) {
  const mat = useMemo(
    () => new MeshStandardMaterial({ color, roughness: 1, metalness: 0 }),
    [color],
  )
  useDisposeOnUnmount([mat])
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[CX, -0.2, CZ]}
      material={mat}
      receiveShadow={false}
    >
      <circleGeometry args={[240, 48]} />
    </mesh>
  )
}
