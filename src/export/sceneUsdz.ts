import type { Object3D } from 'three'

/** Export a scene/object to USDZ (Apple AR Quick Look / "view in your room")
 *  via three's USDZExporter. Dynamic-imported so it stays out of the boot bundle
 *  (P-CHUNK); only a 3D export pays for it. Returns the .usdz bytes. */
export async function exportSceneUsdz(object: Object3D): Promise<Uint8Array> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
  const exporter = new USDZExporter()
  // Newer three exposes parseAsync (Promise<Uint8Array>); fall back to parse.
  const exp = exporter as unknown as {
    parseAsync?: (o: Object3D) => Promise<Uint8Array>
    parse?: (o: Object3D) => Promise<Uint8Array> | Uint8Array
  }
  if (exp.parseAsync) return exp.parseAsync(object)
  return Promise.resolve(exp.parse!(object))
}
