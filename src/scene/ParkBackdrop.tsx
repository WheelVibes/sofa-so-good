import { useMemo } from 'react'
import { ConeGeometry, IcosahedronGeometry, MeshStandardMaterial } from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { mulberry32 } from '../materials/procedural/noise'
import { useBackdropOffset } from './backdropOffset'
import { Ground } from './Ground'
import { useDisposeOnUnmount } from './geometryUtil'
import { type BatchInstance, InstancedBatch } from './instancedBatch'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/** Tree archetypes: round broadleaf (icosa foliage) or conical conifer (cone). */
type Species = 'broadleaf' | 'conifer'

interface Tree {
  x: number
  z: number
  h: number
  r: number
  species: Species
  /** Index into the foliage material palette. */
  mat: number
}

interface Shrub {
  x: number
  z: number
  r: number
  mat: number
}

/**
 * Lay out two depth rings of trees on a green common plus a scatter of low
 * shrubs, deterministically (seeded RNG → stable layout). Trees mix round
 * broadleaf and conical conifer species at varied heights; the near ring is
 * fuller, the far ring fills the horizon.
 */
function makePark(): { trees: Tree[]; shrubs: Shrub[] } {
  const rnd = mulberry32(0x77ee)
  const trees: Tree[] = []
  const ring = (count: number, rMin: number, rSpan: number, hMin: number, hSpan: number) => {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.4
      const radius = rMin + rnd() * rSpan
      const species: Species = rnd() < 0.32 ? 'conifer' : 'broadleaf'
      trees.push({
        x: CX + Math.cos(ang) * radius,
        z: CZ + Math.sin(ang) * radius,
        h: hMin + rnd() * hSpan,
        r: 2.2 + rnd() * 2.6,
        species,
        mat: Math.floor(rnd() * 3),
      })
    }
  }
  ring(34, 24, 26, 5, 6) // near ring (fuller, varied)
  ring(30, 52, 40, 6, 9) // far ring (taller, fills horizon)

  // Low shrubs scattered nearer the flat for ground-level fullness.
  const shrubs: Shrub[] = []
  const shrubCount = 26
  for (let i = 0; i < shrubCount; i++) {
    const ang = rnd() * Math.PI * 2
    const radius = 16 + rnd() * 22
    shrubs.push({
      x: CX + Math.cos(ang) * radius,
      z: CZ + Math.sin(ang) * radius,
      r: 1.1 + rnd() * 1.4,
      mat: Math.floor(rnd() * 3),
    })
  }
  return { trees, shrubs }
}

/** A calm common of low-poly trees + shrubs, instanced into a few draw calls. */
export function ParkBackdrop() {
  const offset = useBackdropOffset()

  // Shared geometries: a unit trunk (cone, narrower at top), round foliage,
  // and a conifer cone. Built once.
  const trunkGeo = useMemo(() => new ConeGeometry(0.5, 1, 6), [])
  const foliageGeo = useMemo(() => new IcosahedronGeometry(1, 0), [])
  const coniferGeo = useMemo(() => new ConeGeometry(1, 1, 7), [])

  const trunkMat = useMemo(() => new MeshStandardMaterial({ color: '#6b5743', roughness: 1 }), [])
  const broadleafMats = useMemo(
    () =>
      ['#5c8a4a', '#6f9c54', '#4e7d42'].map(
        (c) => new MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }),
      ),
    [],
  )
  const coniferMats = useMemo(
    () =>
      ['#3f6b40', '#4c7a47', '#35603a'].map(
        (c) => new MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }),
      ),
    [],
  )
  const shrubMats = useMemo(
    () =>
      ['#6e9b56', '#7fae62', '#5f8c4a'].map(
        (c) => new MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }),
      ),
    [],
  )

  useDisposeOnUnmount([
    trunkGeo,
    foliageGeo,
    coniferGeo,
    trunkMat,
    ...broadleafMats,
    ...coniferMats,
    ...shrubMats,
  ])

  const { trees, shrubs } = useMemo(makePark, [])

  // Build per-material instance lists in one pass.
  const batches = useMemo(() => {
    const trunks: BatchInstance[] = []
    const broadleaf: BatchInstance[][] = [[], [], []]
    const conifer: BatchInstance[][] = [[], [], []]
    const shrubBatches: BatchInstance[][] = [[], [], []]
    for (const t of trees) {
      // Deterministic per-tree yaw from position so foliage facets vary.
      const rot = (t.x * 0.7 + t.z * 1.3) % (Math.PI * 2)
      const trunkH = t.species === 'conifer' ? t.h * 0.35 : t.h * 0.6
      trunks.push({
        px: t.x,
        py: -0.2 + trunkH / 2,
        pz: t.z,
        rot,
        sx: t.species === 'conifer' ? 0.6 : 1,
        sy: trunkH,
        sz: t.species === 'conifer' ? 0.6 : 1,
      })
      if (t.species === 'broadleaf') {
        broadleaf[t.mat]!.push({
          px: t.x,
          py: -0.2 + trunkH + t.r * 0.55,
          pz: t.z,
          rot,
          sx: t.r,
          sy: t.r * 1.15,
          sz: t.r,
        })
      } else {
        // Conifer: a tall cone sitting on a short trunk.
        const ch = t.h * 0.85
        conifer[t.mat]!.push({
          px: t.x,
          py: -0.2 + trunkH + ch / 2,
          pz: t.z,
          rot,
          sx: t.r * 0.9,
          sy: ch,
          sz: t.r * 0.9,
        })
      }
    }
    for (const s of shrubs) {
      const rot = (s.x * 1.1 + s.z * 0.9) % (Math.PI * 2)
      shrubBatches[s.mat]!.push({
        px: s.x,
        py: -0.2 + s.r * 0.45,
        pz: s.z,
        rot,
        sx: s.r,
        sy: s.r * 0.7,
        sz: s.r,
      })
    }
    return { trunks, broadleaf, conifer, shrubs: shrubBatches }
  }, [trees, shrubs])

  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#7d8a5f" />
      {/* Pond hint: a tinted darker-blue disc just above the ground. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX - 18, -0.18, CZ + 14]} renderOrder={-1}>
        <circleGeometry args={[11, 32]} />
        <meshStandardMaterial color="#4a6b78" roughness={0.4} metalness={0} />
      </mesh>
      {/* Path hint: a warm sandy strip across the common. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX + 6, -0.185, CZ - 4]} renderOrder={-1}>
        <planeGeometry args={[7, 64]} />
        <meshStandardMaterial color="#b7a884" roughness={1} metalness={0} />
      </mesh>

      <InstancedBatch geometry={trunkGeo} material={trunkMat} instances={batches.trunks} />
      {broadleafMats.map((m, i) => (
        <InstancedBatch
          key={`bl${i}`}
          geometry={foliageGeo}
          material={m}
          instances={batches.broadleaf[i]!}
        />
      ))}
      {coniferMats.map((m, i) => (
        <InstancedBatch
          key={`cf${i}`}
          geometry={coniferGeo}
          material={m}
          instances={batches.conifer[i]!}
        />
      ))}
      {shrubMats.map((m, i) => (
        <InstancedBatch
          key={`sh${i}`}
          geometry={foliageGeo}
          material={m}
          instances={batches.shrubs[i]!}
        />
      ))}
    </group>
  )
}
