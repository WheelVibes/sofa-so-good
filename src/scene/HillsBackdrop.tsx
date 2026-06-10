import { useMemo } from 'react'
import { IcosahedronGeometry, MeshStandardMaterial, SphereGeometry } from 'three'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../apartment/constants'
import { mulberry32 } from '../materials/procedural/noise'
import { useBackdropOffset } from './backdropOffset'
import { Ground } from './Ground'
import { useDisposeOnUnmount } from './geometryUtil'
import { type BatchInstance, InstancedBatch } from './instancedBatch'

const CX = APARTMENT_EXT_W / 2
const CZ = APARTMENT_EXT_D / 2

/** Three depth bands of hills: near (saturated/dark), mid, far (lighter, hazed
 *  toward the sky) for aerial perspective. Each band = one shared material. */
const BANDS: {
  count: number
  rMin: number
  rSpan: number
  sizeMin: number
  sizeSpan: number
  hMin: number
  hSpan: number
  color: string
}[] = [
  {
    count: 12,
    rMin: 70,
    rSpan: 30,
    sizeMin: 26,
    sizeSpan: 26,
    hMin: 9,
    hSpan: 12,
    color: '#5f8050',
  },
  {
    count: 14,
    rMin: 105,
    rSpan: 40,
    sizeMin: 30,
    sizeSpan: 32,
    hMin: 11,
    hSpan: 16,
    color: '#7e9a63',
  },
  {
    count: 16,
    rMin: 150,
    rSpan: 55,
    sizeMin: 36,
    sizeSpan: 40,
    hMin: 13,
    hSpan: 20,
    color: '#9fb38b',
  },
]

interface Hill {
  x: number
  z: number
  r: number
  h: number
  band: number
}

interface Cluster {
  x: number
  z: number
  r: number
  band: number
}

/** Lay out the hill bands plus a few distant tree clusters at the near band. */
function makeHills(): { hills: Hill[]; clusters: Cluster[] } {
  const rnd = mulberry32(0x4111)
  const hills: Hill[] = []
  BANDS.forEach((b, band) => {
    for (let i = 0; i < b.count; i++) {
      const ang = (i / b.count) * Math.PI * 2 + (rnd() - 0.5) * 0.3
      const radius = b.rMin + rnd() * b.rSpan
      hills.push({
        x: CX + Math.cos(ang) * radius,
        z: CZ + Math.sin(ang) * radius,
        r: b.sizeMin + rnd() * b.sizeSpan,
        h: b.hMin + rnd() * b.hSpan,
        band,
      })
    }
  })
  // Distant tree clusters dotted at the foot of the nearest band for life.
  const clusters: Cluster[] = []
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + (rnd() - 0.5) * 0.5
    const radius = 56 + rnd() * 18
    clusters.push({
      x: CX + Math.cos(ang) * radius,
      z: CZ + Math.sin(ang) * radius,
      r: 3 + rnd() * 3,
      band: 0,
    })
  }
  return { hills, clusters }
}

/** Distant rolling green hills in layered depth bands — a calm, hazy horizon. */
export function HillsBackdrop() {
  const offset = useBackdropOffset()
  const domeGeo = useMemo(() => new SphereGeometry(1, 16, 8), [])
  const clusterGeo = useMemo(() => new IcosahedronGeometry(1, 0), [])

  // One material per depth band; farther bands are lighter + desaturated toward
  // the sky for aerial perspective.
  const bandMats = useMemo(
    () =>
      BANDS.map(
        (b) => new MeshStandardMaterial({ color: b.color, roughness: 1, flatShading: true }),
      ),
    [],
  )
  const clusterMat = useMemo(
    () => new MeshStandardMaterial({ color: '#4e7d42', roughness: 1, flatShading: true }),
    [],
  )
  useDisposeOnUnmount([domeGeo, clusterGeo, ...bandMats, clusterMat])

  const { hills, clusters } = useMemo(makeHills, [])

  const batches = useMemo(() => {
    const byBand: BatchInstance[][] = BANDS.map(() => [])
    for (const h of hills) {
      byBand[h.band]!.push({
        px: h.x,
        py: -h.r + h.h - 0.2,
        pz: h.z,
        rot: (h.x * 0.5 + h.z) % (Math.PI * 2),
        sx: h.r,
        sy: h.r,
        sz: h.r,
      })
    }
    const clusterInst: BatchInstance[] = clusters.map((c) => ({
      px: c.x,
      py: -0.2 + c.r * 0.6,
      pz: c.z,
      rot: (c.x + c.z * 0.7) % (Math.PI * 2),
      sx: c.r,
      sy: c.r * 1.2,
      sz: c.r,
    }))
    return { byBand, clusterInst }
  }, [hills, clusters])

  return (
    <group renderOrder={-1} position={offset}>
      <Ground color="#869266" />
      {bandMats.map((m, i) => (
        <InstancedBatch
          key={`band${i}`}
          geometry={domeGeo}
          material={m}
          instances={batches.byBand[i]!}
        />
      ))}
      <InstancedBatch geometry={clusterGeo} material={clusterMat} instances={batches.clusterInst} />
    </group>
  )
}
