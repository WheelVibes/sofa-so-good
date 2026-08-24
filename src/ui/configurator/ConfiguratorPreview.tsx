import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { Group } from 'three'
import { PCFShadowMap } from 'three'
import {
  buildConfiguredPreview,
  disposeConfiguredObject,
} from '../../furniture/configurator/buildObject'
import type { ConfigurableProduct, ConfiguredSpec } from '../../furniture/configurator/model'

/** The assembled product, built by the same procedural + GLB pipeline the save
 *  path exports (so the preview can't drift from the baked GLB). The procedural
 *  body shows immediately; any GLB sub-asset option (SLOT-203) pops in as it
 *  loads — a slow/failed GLB never blanks the body. Rebuilt + disposed when the
 *  product or selection changes (disposal deferred until in-flight loads settle
 *  so a late-arriving GLB piece is freed too). */
function ConfiguredPiece({
  product,
  spec,
}: {
  product: ConfigurableProduct
  spec: ConfiguredSpec
}) {
  const [object, setObject] = useState<Group | null>(null)
  useEffect(() => {
    let alive = true
    const { object: built, ready } = buildConfiguredPreview(product, spec)
    setObject(built)
    return () => {
      alive = false
      setObject(null)
      // Dispose only once every in-flight GLB load has attached-or-skipped, so a
      // piece that arrives after unmount is disposed too (no leak).
      void ready.finally(() => {
        if (!alive) disposeConfiguredObject(built)
      })
    }
  }, [product, spec])
  return object ? <primitive object={object} /> : null
}

/** Live 3D preview canvas for the configurator dialog (SLOT-105). Mirrors the
 *  parametric preview: flat studio light + ground grid, `Bounds` keeps any size
 *  product framed. */
export function ConfiguratorPreview({
  product,
  spec,
}: {
  product: ConfigurableProduct
  spec: ConfiguredSpec
}) {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} camera={{ position: [2.2, 1.7, 2.6], fov: 40 }}>
      <ambientLight intensity={0.7} />
      <hemisphereLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} castShadow />
      <gridHelper args={[8, 16, '#999', '#ccc']} />
      <Bounds fit clip observe margin={1.15}>
        <ConfiguredPiece product={product} spec={spec} />
      </Bounds>
      <OrbitControls makeDefault />
    </Canvas>
  )
}
