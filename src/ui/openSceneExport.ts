import { buildExportRoot } from '../export/sceneGltf'
import { getSceneRoot } from '../scene/sceneExportAccess'
import { useStore } from '../state/store'

/** Whole-scene 3D export formats. GLB is binary glTF (material-complete); OBJ is
 *  geometry-only Wavefront; STL is geometry-only for 3D printing / CAD; USDZ is
 *  Apple AR Quick Look ("view in your room"). */
export type SceneExportFormat = 'glb' | 'obj' | 'stl' | 'usdz'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Revoke on the next tick so the click has consumed the blob URL — in a
    // `finally` so an anchor click/DOM exception can't leave the blob's bytes
    // (a multi-MB GLB/USDZ) retained for the page lifetime (IO-003).
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * Export the whole furnished home (floor, walls, ceiling, doors, windows,
 * furniture, lights) to a 3D model file and trigger a download — SweetHome3DJS
 * ObjWriter/glTF parity (Q-3DEXPORT). Editor-only helpers (selection outline,
 * gizmo, grid, overlays, sky, backdrop, comment pins) are stripped by
 * `buildExportRoot`. The exporters are dynamic-imported so they stay out of the
 * boot bundle; a programmatic download needs no user-activation window, so the
 * await-first order is safe (same as `downloadPlanDxf`).
 */
export async function exportScene3d(format: SceneExportFormat = 'glb'): Promise<void> {
  const { notify, floorPlan } = useStore.getState()
  const root = getSceneRoot()
  if (!root) {
    notify.start({ title: 'Could not export — the 3D scene isn’t ready', kind: 'error' })
    return
  }
  try {
    const exportRoot = buildExportRoot(root)
    const safe = (floorPlan.name || 'home').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    if (format === 'obj') {
      const { exportSceneObj } = await import('../export/sceneObj')
      const text = await exportSceneObj(exportRoot)
      downloadBlob(new Blob([text], { type: 'text/plain' }), `${safe}-${stamp}.obj`)
    } else if (format === 'stl') {
      const { exportSceneStl } = await import('../export/sceneStl')
      const text = await exportSceneStl(exportRoot)
      downloadBlob(new Blob([text], { type: 'model/stl' }), `${safe}-${stamp}.stl`)
    } else if (format === 'usdz') {
      const { exportSceneUsdz } = await import('../export/sceneUsdz')
      const bytes = await exportSceneUsdz(exportRoot)
      downloadBlob(
        new Blob([bytes as BlobPart], { type: 'model/vnd.usdz+zip' }),
        `${safe}-${stamp}.usdz`,
      )
    } else {
      const { exportGlb } = await import('../furniture/convert/toGlb')
      const buffer = await exportGlb(exportRoot)
      downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), `${safe}-${stamp}.glb`)
    }
    notify.start({ title: '3D model saved to your downloads', kind: 'success' })
  } catch {
    notify.start({ title: 'Could not export the 3D model', kind: 'error' })
  }
}
