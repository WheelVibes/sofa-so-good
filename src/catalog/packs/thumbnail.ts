import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SIZE = 256

const FALLBACK_BLOB = (): Blob => new Blob([new Uint8Array([0])], { type: 'image/png' })

/**
 * Renders GLB bytes to small JPEG thumbnails using a single reusable
 * offscreen WebGLRenderer. dispose() must be called when an install
 * batch finishes so the GPU context is released.
 */
export class ThumbnailRenderer {
  private renderer: WebGLRenderer | null = null
  private loader = new GLTFLoader()

  private ensure(): WebGLRenderer | null {
    if (this.renderer) return this.renderer
    try {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      this.renderer = new WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      })
      this.renderer.setSize(SIZE, SIZE)
      this.renderer.setPixelRatio(1)
      return this.renderer
    } catch {
      return null
    }
  }

  async render(glbBytes: Uint8Array): Promise<Blob> {
    const renderer = this.ensure()
    if (!renderer) return FALLBACK_BLOB()

    try {
      const ab = glbBytes.buffer.slice(
        glbBytes.byteOffset,
        glbBytes.byteOffset + glbBytes.byteLength,
      )
      const gltf = await this.loader.parseAsync(ab as ArrayBuffer, '')

      const scene = new Scene()
      scene.add(gltf.scene)
      scene.add(new HemisphereLight(0xffffff, 0x444444, 1.2))
      const dir = new DirectionalLight(0xffffff, 0.8)
      dir.position.set(3, 5, 4)
      scene.add(dir)

      const bbox = new Box3().setFromObject(gltf.scene)
      const size = new Vector3()
      bbox.getSize(size)
      const center = new Vector3()
      bbox.getCenter(center)
      const radius = Math.max(size.x, size.y, size.z) * 0.7 || 1

      const camera = new PerspectiveCamera(35, 1, 0.01, 100)
      const distance = radius / Math.tan((camera.fov * Math.PI) / 360)
      camera.position.set(
        center.x + distance * 0.8,
        center.y + distance * 0.6,
        center.z + distance * 0.9,
      )
      camera.lookAt(center)

      renderer.render(scene, camera)
      const blob = await new Promise<Blob | null>((resolve) =>
        renderer.domElement.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
      )

      gltf.scene.traverse((obj) => {
        const o = obj as { geometry?: { dispose?: () => void }; material?: unknown }
        o.geometry?.dispose?.()
        const mat = o.material
        if (Array.isArray(mat)) {
          for (const m of mat as Array<{ dispose?: () => void }>) m.dispose?.()
        } else if (mat && typeof (mat as { dispose?: unknown }).dispose === 'function') {
          ;(mat as { dispose: () => void }).dispose()
        }
      })
      return blob ?? FALLBACK_BLOB()
    } catch {
      return FALLBACK_BLOB()
    }
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose()
      this.renderer = null
    }
  }
}
