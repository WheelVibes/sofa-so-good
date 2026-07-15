import { useEffect, useMemo } from 'react'
import { MathUtils, type Mesh } from 'three'
import { partGeometry, partMaterials } from '../../furniture/glbEdit/buildObject'
import type { AssetEditSpec, ShapePart } from '../../furniture/glbEdit/editSpec'
import { useStore } from '../../state/store'

/** One primitive part, built from the SAME `partGeometry` + `partMaterials` the
 *  export uses (so the preview can never drift from the saved GLB). Geometry
 *  and material(s) are memoised on the part and disposed when they change/unmount
 *  (`partMaterials` always returns owned instances — cached finish materials are
 *  cloned with shared textures — so disposing is safe). */
function PartMesh({ part, meshRef }: { part: ShapePart; meshRef?: (m: Mesh | null) => void }) {
  // A picked `mat:<id>` texture builds into the cache asynchronously — the
  // epoch bump re-resolves the material once it's ready (GE3c).
  const epoch = useStore((s) => s.materialEpoch)
  // `part` is recreated immutably by updatePart on every edit, so depending on
  // it rebuilds the geometry exactly when kind/size change.
  const geom = useMemo(() => partGeometry(part), [part])
  useEffect(() => () => geom.dispose(), [geom])
  // For a combined mesh part with per-source materials, partMaterials returns an
  // array; for all other parts it returns a single material (GE3c tail).
  const mat = useMemo(() => {
    void epoch // a finish may have just been built into the material cache
    return partMaterials(part)
  }, [part, epoch])
  useEffect(
    () => () => {
      if (Array.isArray(mat))
        mat.forEach((m) => {
          m.dispose()
        })
      else mat.dispose()
    },
    [mat],
  )
  const rot = part.rotation
  return (
    <mesh
      ref={meshRef}
      position={part.position}
      rotation={
        rot
          ? [MathUtils.degToRad(rot[0]), MathUtils.degToRad(rot[1]), MathUtils.degToRad(rot[2])]
          : undefined
      }
      castShadow
      receiveShadow
      geometry={geom}
      material={mat}
    />
  )
}

/** The composed primitive parts, rendered declaratively (export uses buildEditedObject). */
export function PartsPreview({
  spec,
  meshRefFor,
}: {
  spec: AssetEditSpec
  meshRefFor: (id: string) => (m: Mesh | null) => void
}) {
  return (
    <>
      {spec.parts.map((p) => (
        <PartMesh key={p.id} part={p} meshRef={meshRefFor(p.id)} />
      ))}
    </>
  )
}
