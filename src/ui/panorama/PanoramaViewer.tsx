import { useEffect, useRef } from 'react'
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { dragLook, INITIAL_LOOK, type LookState, SPHERE_YAW, zoomLook } from './viewerLook'

/**
 * Drag-to-look sphere viewer over a captured equirect panorama — a small
 * self-contained three renderer (own WebGL context, fully disposed on
 * unmount) so the main canvas stays untouched. Fills its parent; drag to
 * look around, wheel to zoom. Shared by `PanoramaModal`, the 360° slides
 * in `PresentationMode` and the linked 360° tour — keep it
 * presentation-free (no chrome, no store; overlays such as the tour's
 * hotspot markers project themselves via the generic `onLook` callback).
 */
export function PanoramaViewer({
  pano,
  ariaLabel = '360 degree panorama viewer',
  initialLook,
  onLook,
}: {
  /** The equirectangular image to view (width = 2 × height). */
  pano: HTMLCanvasElement
  ariaLabel?: string
  /** Starting orientation (read whenever `pano` changes); defaults to
   *  `INITIAL_LOOK`. The tour uses it to keep facing the travel direction
   *  after a hotspot jump. */
  initialLook?: LookState
  /** Notified with the look state + canvas CSS size on every change (drag /
   *  zoom / resize) — lets a parent project overlays into the view. */
  onLook?: (look: LookState, size: { width: number; height: number }) => void
}) {
  const hostRef = useRef<HTMLCanvasElement>(null)
  // Refs so the render effect (keyed on `pano` only) reads the latest values
  // without tearing down the renderer when the callbacks change identity.
  const onLookRef = useRef(onLook)
  onLookRef.current = onLook
  const initialLookRef = useRef(initialLook)
  initialLookRef.current = initialLook

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const renderer = new WebGLRenderer({ canvas: host, antialias: true })
    const scene = new Scene()
    const camera = new PerspectiveCamera(INITIAL_LOOK.fov, 16 / 9, 0.1, 100)
    const resize = () => {
      const w = host.clientWidth || 640
      const h = host.clientHeight || 360
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    // Track host size (the presentation slide is full-screen and can resize).
    // A resize also re-notifies `onLook` (the overlay projection needs the
    // fresh aspect) — flagged via `notified` and picked up by the rAF loop.
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            resize()
            notified = null
          })
        : null
    ro?.observe(host)

    const tex = new CanvasTexture(pano)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    const geo = new SphereGeometry(10, 48, 32)
    geo.scale(-1, 1, 1) // view from inside
    const mat = new MeshBasicMaterial({ map: tex })
    const mesh = new Mesh(geo, mat)
    // Align the texture seam so the capture's forward (-Z, equirect u=0.5)
    // is what the viewer faces on open.
    mesh.rotation.y = SPHERE_YAW
    scene.add(mesh)

    let look = initialLookRef.current ?? INITIAL_LOOK
    let notified: LookState | null = null
    const notify = () => {
      notified = look
      onLookRef.current?.(look, {
        width: host.clientWidth || 640,
        height: host.clientHeight || 360,
      })
    }
    let dragging = false
    let lastX = 0
    let lastY = 0
    const apply = () => {
      camera.rotation.set(0, 0, 0, 'YXZ')
      camera.rotation.y = look.yaw
      camera.rotation.x = look.pitch
      camera.fov = look.fov
      camera.updateProjectionMatrix()
    }
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      try {
        host.setPointerCapture(e.pointerId)
      } catch {
        // Synthetic/inactive pointers can't be captured — dragging still works
        // for events that keep hitting the canvas.
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      look = dragLook(look, e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => {
      dragging = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      look = zoomLook(look, e.deltaY)
    }
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointercancel', onUp)
    host.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const loop = () => {
      try {
        apply()
        // Push look/size changes to the overlay projection (tour hotspots).
        if (look !== notified) notify()
        renderer.render(scene, camera)
      } catch {
        // A transient context loss must not kill the loop — keep ticking so
        // the viewer recovers when the context is restored.
      }
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('wheel', onWheel)
      geo.dispose()
      mat.dispose()
      tex.dispose()
      renderer.dispose()
    }
  }, [pano])

  return (
    <canvas
      ref={hostRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      aria-label={ariaLabel}
    />
  )
}
