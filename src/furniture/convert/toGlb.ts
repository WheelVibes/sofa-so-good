import type * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/** Export a scene/object to a binary GLB ArrayBuffer via three's GLTFExporter. */
export function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
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
