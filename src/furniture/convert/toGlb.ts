import type * as THREE from 'three'

/** Export a scene/object to a binary GLB ArrayBuffer via three's GLTFExporter.
 *  The exporter is dynamic-imported so it stays out of the boot bundle — only
 *  model conversion / GLB-designer saves pay for it (P-CHUNK). */
export async function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    )
  })
}
