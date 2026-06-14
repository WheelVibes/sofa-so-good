import type { Object3D } from 'three'

/** Export a scene/object to Wavefront OBJ text via three's OBJExporter. The
 *  exporter is dynamic-imported so it stays out of the boot bundle (P-CHUNK) —
 *  only a 3D export pays for it. Note: OBJExporter emits geometry only (no MTL),
 *  so GLB is the material-complete format; OBJ is offered for geometry hand-off
 *  to tools that prefer it. */
export async function exportSceneObj(object: Object3D): Promise<string> {
  const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js')
  return new OBJExporter().parse(object)
}
