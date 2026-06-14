import type { Object3D } from 'three'

/** Export a scene/object to ASCII STL via three's STLExporter — geometry-only,
 *  for 3D printing / CAD. Dynamic-imported so it stays out of the boot bundle
 *  (P-CHUNK); only a 3D export pays for it. */
export async function exportSceneStl(object: Object3D): Promise<string> {
  const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js')
  return new STLExporter().parse(object)
}
