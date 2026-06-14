import { buildExportRoot } from '../export/sceneGltf'
import { getSceneRoot } from '../scene/sceneExportAccess'
import { useStore } from '../state/store'

/** iOS (iPhone/iPad) — the platform whose Safari launches AR Quick Look directly
 *  from an `<a rel="ar">` pointing at a USDZ (even a blob URL). iPadOS reports as
 *  desktop Safari, so also catch the touch-Mac case. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}

/**
 * "View in your room": launch AR from the live scene with no backend.
 * - iOS → export USDZ and open Apple AR Quick Look via an `<a rel="ar">` (needs a
 *   child `<img>` + a real user gesture, which the click handler provides).
 * - Elsewhere (Android Scene Viewer needs an https-hosted model, which we don't
 *   have without a backend) → download the GLB so the user can open it in their
 *   own AR viewer, with a toast explaining.
 *
 * Exporters are dynamic-imported (kept out of the boot bundle).
 */
export async function viewInAr(): Promise<void> {
  const { notify, floorPlan } = useStore.getState()
  const root = getSceneRoot()
  if (!root) {
    notify.start({ title: 'Could not start AR — the 3D scene isn’t ready', kind: 'error' })
    return
  }
  const safe = (floorPlan.name || 'home').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
  try {
    const exportRoot = buildExportRoot(root)
    if (isIos()) {
      const { exportSceneUsdz } = await import('../export/sceneUsdz')
      const bytes = await exportSceneUsdz(exportRoot)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/vnd.usdz+zip' }))
      // AR Quick Look: the anchor must carry rel="ar" and contain an <img>.
      const a = document.createElement('a')
      a.rel = 'ar'
      a.href = url
      a.appendChild(document.createElement('img'))
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      notify.start({ title: 'Opening AR Quick Look…', kind: 'success' })
    } else {
      const { exportGlb } = await import('../furniture/convert/toGlb')
      const buffer = await exportGlb(exportRoot)
      const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${safe}-ar.glb`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      notify.start({
        title: 'AR model downloaded — open it on an AR-capable phone to place it in your room',
        kind: 'info',
        autoDismissMs: 5000,
      })
    }
  } catch {
    notify.start({ title: 'Could not start AR', kind: 'error' })
  }
}
