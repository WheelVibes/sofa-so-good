import { useCallback, useEffect, useRef, useState } from 'react'
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
import { capturePanorama } from '../scene/panorama/capturePanorama'
import { useStore } from '../state/store'
import { Modal } from './Modal'

/**
 * 360° panorama: captures an equirect render from the current viewpoint
 * (via `PanoramaController`) and shows it in a drag-to-look sphere viewer
 * with a PNG download. The viewer is a small self-contained three renderer
 * (own context, fully disposed on close) — the main canvas stays untouched.
 */
export function PanoramaModal() {
  const open = useStore((s) => s.panoramaOpen)
  const setOpen = useStore((s) => s.setPanoramaOpen)
  const [pano, setPano] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const hostRef = useRef<HTMLCanvasElement>(null)

  const capture = useCallback(() => {
    setBusy(true)
    setFailed(false)
    // Let the modal paint its "capturing" state before the blocking renders.
    setTimeout(() => {
      void capturePanorama().then((res) => {
        setPano(res?.canvas ?? null)
        setFailed(!res)
        setBusy(false)
      })
    }, 30)
  }, [])

  useEffect(() => {
    if (open) capture()
    else {
      setPano(null)
      setFailed(false)
    }
  }, [open, capture])

  // Drag-to-look sphere viewer over the captured equirect.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !pano) return
    const renderer = new WebGLRenderer({ canvas: host, antialias: true })
    const w = host.clientWidth || 640
    const h = host.clientHeight || 360
    renderer.setSize(w, h, false)
    const scene = new Scene()
    const camera = new PerspectiveCamera(75, w / h, 0.1, 100)
    const tex = new CanvasTexture(pano)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    const geo = new SphereGeometry(10, 48, 32)
    geo.scale(-1, 1, 1) // view from inside
    const mat = new MeshBasicMaterial({ map: tex })
    const mesh = new Mesh(geo, mat)
    // Align the texture seam so the capture's forward (-Z, equirect u=0.5)
    // is what the viewer faces on open.
    mesh.rotation.y = -Math.PI / 2
    scene.add(mesh)

    let yaw = 0
    let pitch = 0
    let fov = 75
    let dragging = false
    let lastX = 0
    let lastY = 0
    const apply = () => {
      camera.rotation.set(0, 0, 0, 'YXZ')
      camera.rotation.y = yaw
      camera.rotation.x = pitch
      camera.fov = fov
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
      yaw += (e.clientX - lastX) * 0.005
      pitch = Math.min(Math.PI / 2.2, Math.max(-Math.PI / 2.2, pitch + (e.clientY - lastY) * 0.005))
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => {
      dragging = false
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      fov = Math.min(100, Math.max(35, fov + e.deltaY * 0.05))
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

  const download = () => {
    if (!pano) return
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const a = document.createElement('a')
    a.href = pano.toDataURL('image/png')
    a.download = `hdb-panorama-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    useStore.getState().notify.start({ title: 'Panorama saved to your downloads', kind: 'success' })
  }

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="360° Panorama"
      sub="Captured from where you're looking — drag to look around, scroll to zoom"
      width={720}
      panelId="panorama"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn" onClick={capture} disabled={busy}>
            Re-capture
          </button>
          <button type="button" className="btn btn-accent" onClick={download} disabled={!pano}>
            Download PNG
          </button>
        </div>
      }
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={hostRef}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
          aria-label="360 degree panorama viewer"
        />
        {busy || !pano ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {busy ? 'Capturing panorama…' : failed ? 'Could not capture — try again.' : ''}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
