import { useMemo } from 'react'
import { CylinderGeometry, IcosahedronGeometry, MeshStandardMaterial, SphereGeometry } from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { mulberry32 } from '../materials/procedural/noise'
import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'
import { useBackdropOffset } from './backdropOffset'
import { CityBackdrop } from './CityBackdrop'
import { useDisposeOnUnmount } from './geometryUtil'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/** The four selectable scene backdrops (label/sub for the picker UI). */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'city', label: 'City', sub: 'HDB estate blocks' },
  { id: 'park', label: 'Park', sub: 'Trees & greenery' },
  { id: 'hills', label: 'Hills', sub: 'Calm green horizon' },
  { id: 'none', label: 'Studio', sub: 'Clean, no surroundings' },
]

/** Far estate ground disc, just below the apartment slab. */
function Ground({ color }: { color: string }) {
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

/** A calm ring of low-poly trees on a green common — natural, uncluttered. */
function ParkBackdrop() {
  const offset = useBackdropOffset()
  const trunkGeo = useMemo(() => new CylinderGeometry(0.35, 0.5, 1, 6), [])
  const foliageGeo = useMemo(() => new IcosahedronGeometry(1, 0), [])
  const trunkMat = useMemo(() => new MeshStandardMaterial({ color: '#6b5743', roughness: 1 }), [])
  const foliageMats = useMemo(
    () =>
      ['#5c8a4a', '#6f9c54', '#4e7d42'].map(
        (c) => new MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }),
      ),
    [],
  )
  useDisposeOnUnmount([trunkGeo, foliageGeo, trunkMat, ...foliageMats])
  const trees = useMemo(() => {
    const rnd = mulberry32(0x77ee)
    const out: { x: number; z: number; h: number; r: number; mat: number }[] = []
    const count = 30
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.3
      const radius = 26 + rnd() * 42
      out.push({
        x: CX + Math.cos(ang) * radius,
        z: CZ + Math.sin(ang) * radius,
        h: 5 + rnd() * 7,
        r: 2.4 + rnd() * 2.4,
        mat: i % 3,
      })
    }
    return out
  }, [])
  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#7d8a5f" />
      {trees.map((t, i) => (
        <group key={i} position={[t.x, -0.2, t.z]}>
          <mesh
            geometry={trunkGeo}
            material={trunkMat}
            position={[0, t.h * 0.3, 0]}
            scale={[1, t.h * 0.6, 1]}
          />
          <mesh
            geometry={foliageGeo}
            material={foliageMats[t.mat]}
            position={[0, t.h * 0.6 + t.r * 0.6, 0]}
            scale={[t.r, t.r * 1.15, t.r]}
          />
        </group>
      ))}
    </group>
  )
}

/** Distant rolling green hills — a low, calm horizon. */
function HillsBackdrop() {
  const offset = useBackdropOffset()
  const domeGeo = useMemo(() => new SphereGeometry(1, 16, 8), [])
  const mats = useMemo(
    () =>
      ['#6f8f57', '#7e9a63', '#5f8050'].map(
        (c) => new MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }),
      ),
    [],
  )
  useDisposeOnUnmount([domeGeo, ...mats])
  const hills = useMemo(() => {
    const rnd = mulberry32(0x4111)
    const out: { x: number; z: number; r: number; h: number; mat: number }[] = []
    const count = 16
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.25
      const radius = 80 + rnd() * 60
      out.push({
        x: CX + Math.cos(ang) * radius,
        z: CZ + Math.sin(ang) * radius,
        r: 28 + rnd() * 34,
        h: 10 + rnd() * 16,
        mat: i % 3,
      })
    }
    return out
  }, [])
  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#869266" />
      {hills.map((h, i) => (
        <mesh
          key={i}
          geometry={domeGeo}
          material={mats[h.mat]}
          position={[h.x, -h.r + h.h - 0.2, h.z]}
          scale={[h.r, h.r, h.r]}
        />
      ))}
    </group>
  )
}

/** Clean studio: just a neutral ground, no surroundings. */
function StudioBackdrop() {
  const offset = useBackdropOffset()
  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#c9c6c0" />
    </group>
  )
}

/** Dispatches to the selected backdrop. Defaults to the city skyline. */
export function SceneBackdrop() {
  const kind = useStore((s) => s.backdrop)
  if (kind === 'park') return <ParkBackdrop />
  if (kind === 'hills') return <HillsBackdrop />
  if (kind === 'none') return <StudioBackdrop />
  return <CityBackdrop />
}
