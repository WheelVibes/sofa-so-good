import { useMemo } from 'react'
import { MeshLambertMaterial, MeshStandardMaterial } from 'three'
import { getCeilingPlasterMaps } from '../../materials/procedural/ceilingPlaster'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { useStore } from '../../state/store'

/**
 * CEILING-PLASTER — the un-finished default-flat ceiling tile's skim-coat
 * surface (`Ceiling.tsx`'s flat white planes only; a room the user has
 * FINISHED renders through `RoomCeilingTile`, untouched).
 *
 * World-space UV plane (matches every other finish render site) so the
 * texture's physical tile size — baked into the maps' own `repeat`, see
 * `ceilingPlaster.ts` — stays constant across rooms of different size and
 * never shows a seam at a room boundary.
 *
 * Material choice tracks `Ceiling.tsx`'s own LAMBERT comment: three's
 * `MeshLambertMaterial` DOES support `map`/`normalMap` (confirmed against the
 * installed three's `meshlambert.glsl.js` — both chunks are in its fragment
 * shader), so every tier keeps the cheap per-light dot-product shading and
 * gets the albedo variation + fine bump. What Lambert has NO concept of at
 * all is roughness, so the roughness MAP (the 0.9-1.0 matte-variation channel)
 * can only be carried by a `MeshStandardMaterial` — reserved for `realistic`
 * tier only, the same per-light GGX-BRDF cost `Ceiling.tsx` warns about,
 * multiplied by the fixture-light count.
 *
 * `color` stays at three's default WHITE, deliberately. three MULTIPLIES
 * `color` by `map`, and the map already carries `CEILING_PLASTER_COLOR` as its
 * own mean — setting the colour here as well SQUARES it (0.98 x 0.98 = 0.96).
 * Measured: with the colour set the ceiling crop read 1.4 counts DARK against
 * the flag-OFF control, silently breaking the mean-preserving property the
 * generator goes to such lengths to guarantee. With white it re-measures flat.
 */
interface Props {
  cx: number
  cz: number
  y: number
  w: number
  d: number
}

let lambertMat: MeshLambertMaterial | null = null
let standardMat: MeshStandardMaterial | null = null

function ceilingPlasterMaterial(realistic: boolean): MeshLambertMaterial | MeshStandardMaterial {
  const maps = getCeilingPlasterMaps()
  if (realistic) {
    if (!standardMat) {
      standardMat = new MeshStandardMaterial({
        map: maps.albedo,
        normalMap: maps.normal,
        roughnessMap: maps.roughness,
        roughness: 1,
      })
      standardMat.normalScale.set(0.5, 0.5)
    }
    return standardMat
  }
  if (!lambertMat) {
    lambertMat = new MeshLambertMaterial({
      map: maps.albedo,
      normalMap: maps.normal,
    })
    lambertMat.normalScale.set(0.5, 0.5)
  }
  return lambertMat
}

export function CeilingPlasterTile({ cx, cz, y, w, d }: Props) {
  const tier = useStore((s) => s.qualityTier)
  const realistic = tier === 'realistic'
  const geometry = useMemo(() => worldUvPlaneGeometry(w, d), [w, d])
  useDisposeGeometry(geometry)
  const material = useMemo(() => ceilingPlasterMaterial(realistic), [realistic])
  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[Math.PI / 2, 0, 0]}
      material={material}
      geometry={geometry}
    />
  )
}
