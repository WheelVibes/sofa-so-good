import type { Object3D } from 'three'
import { computeExportStats, shouldUseWorkerExport } from '../export/exportThreshold'
import { runWorkerSceneExport } from '../export/runSceneExport'
import { buildExportRoot } from '../export/sceneGltf'
import { getSceneRoot } from '../scene/sceneExportAccess'
import { useStore } from '../state/store'

/** Whole-scene 3D export formats. GLB is binary glTF (material-complete); OBJ is
 *  geometry-only Wavefront; STL is geometry-only for 3D printing / CAD; USDZ is
 *  Apple AR Quick Look ("view in your room"). */
export type SceneExportFormat = 'glb' | 'obj' | 'stl' | 'usdz'

const FORMAT_META: Record<SceneExportFormat, { ext: string; mime: string }> = {
  glb: { ext: 'glb', mime: 'model/gltf-binary' },
  obj: { ext: 'obj', mime: 'text/plain' },
  stl: { ext: 'stl', mime: 'model/stl' },
  usdz: { ext: 'usdz', mime: 'model/vnd.usdz+zip' },
}

/** Which code path actually produced the export — dev/harness observability. */
type SceneExportPath = 'direct' | 'worker' | 'worker-fallback-direct'

/** Dev-only seams for the scenario harness (`scene-export-worker.json`):
 *  `__forceWorkerExport` routes even a small scene through the Worker path so a
 *  headless run can prove REAL `new Worker(new URL(...))` construction works
 *  under the bundler (the unit tests inject a fake Worker, so broken worker
 *  wiring would otherwise be silently masked by the direct fallback);
 *  `__lastSceneExport` records which path actually ran + the produced byte
 *  length. Both are `import.meta.env.DEV`-gated — inert in prod builds. */
interface SceneExportDebugWindow {
  __forceWorkerExport?: boolean
  __lastSceneExport?: { path: SceneExportPath; bytes: number; format: SceneExportFormat }
}

function debugWindow(): SceneExportDebugWindow | null {
  return import.meta.env.DEV && typeof window !== 'undefined'
    ? (window as unknown as SceneExportDebugWindow)
    : null
}

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

/** The direct, synchronous, main-thread export — exactly the small-scene
 *  path this feature always used. Also the fallback target when the worker
 *  path (below) is unavailable or fails. The exporters are dynamic-imported
 *  so they stay out of the boot bundle; a programmatic download needs no
 *  user-activation window, so the await-first order is safe (same as
 *  `downloadPlanDxf`). */
async function exportDirect(
  exportRoot: Object3D,
  format: SceneExportFormat,
): Promise<ArrayBuffer | string> {
  if (format === 'obj') {
    const { exportSceneObj } = await import('../export/sceneObj')
    return exportSceneObj(exportRoot)
  }
  if (format === 'stl') {
    const { exportSceneStl } = await import('../export/sceneStl')
    return exportSceneStl(exportRoot)
  }
  if (format === 'usdz') {
    const { exportSceneUsdz } = await import('../export/sceneUsdz')
    const bytes = await exportSceneUsdz(exportRoot)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  }
  const { exportGlb } = await import('../furniture/convert/toGlb')
  return exportGlb(exportRoot)
}

/**
 * Export the whole furnished home (floor, walls, ceiling, doors, windows,
 * furniture, lights) to a 3D model file and trigger a download — SweetHome3DJS
 * ObjWriter/glTF parity (Q-3DEXPORT). Editor-only helpers (selection outline,
 * gizmo, grid, overlays, sky, backdrop, comment pins) are stripped by
 * `buildExportRoot` before either path runs, so the worker path can never leak
 * one into an export.
 *
 * A *very large* scene (see `exportThreshold.ts`) runs on a Worker instead of
 * the main thread (`runWorkerSceneExport`) so `GLTFExporter.parse()`'s
 * single, un-yielding synchronous pass never stalls the UI — with a
 * progress toast, since that path is expected to take real time. A small
 * scene keeps the exact prior direct-call behaviour (no progress toast; it's
 * fast enough not to need one). If the worker is unavailable, crashes, times
 * out, or its reply can't be understood, this transparently falls back to
 * the direct path — never a silent hang.
 */
/**
 * Dev-only harness seam: return the scene as GLB **bytes** (base64) instead of
 * downloading it.
 *
 * Exists so a headless probe can hand an offline renderer (Blender/Cycles) the
 * *exact* geometry the app exports, for a matched-pose photorealism reference.
 * Reconstructing the scene renderer-side would risk divergence and confound the
 * very comparison it is for, so this deliberately reuses `buildExportRoot` +
 * `exportDirect` — the app's own path — and can therefore never disagree with what
 * a user gets.
 *
 * Base64 rather than an ArrayBuffer because `page.evaluate` has to marshal the
 * result across the CDP boundary as JSON. Registered on `window` under the
 * `import.meta.env.DEV` guard below; inert in production builds.
 *
 * **Deliberately not exported.** The only consumer is `window.__exportSceneGlbBase64`
 * (read by `scripts/dev-probes/light-distribution.mjs`), so an `export` here is an
 * unused one — and knip treats that as an error, which is how `0.31.7.3` found it.
 */
async function exportSceneGlbBase64(): Promise<string | null> {
  const root = getSceneRoot()
  if (!root) return null
  const data = await exportDirect(buildExportRoot(root), 'glb')
  if (typeof data === 'string') return null
  const bytes = new Uint8Array(data)
  let binary = ''
  // Chunked so a multi-MB export cannot blow the argument limit of
  // `String.fromCharCode(...spread)`, which silently throws on large scenes —
  // exactly the sizes this is for.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __exportSceneGlbBase64?: unknown }).__exportSceneGlbBase64 =
    exportSceneGlbBase64
}

export async function exportScene3d(format: SceneExportFormat = 'glb'): Promise<void> {
  const { notify, floorPlan } = useStore.getState()
  const root = getSceneRoot()
  if (!root) {
    notify.start({ title: 'Could not export — the 3D scene isn’t ready', kind: 'error' })
    return
  }

  let progressId: string | null = null
  try {
    const exportRoot = buildExportRoot(root)
    const safe = (floorPlan.name || 'home').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const meta = FORMAT_META[format]

    const useWorker =
      debugWindow()?.__forceWorkerExport === true ||
      shouldUseWorkerExport(computeExportStats(exportRoot))
    if (useWorker) {
      progressId = notify.start({
        title: 'Exporting a large 3D scene…',
        message: 'This can take a moment — the app stays responsive.',
        kind: 'progress',
      })
    }

    let data: ArrayBuffer | string
    let path: SceneExportPath = 'direct'
    if (useWorker) {
      try {
        data = await runWorkerSceneExport(exportRoot, format)
        path = 'worker'
      } catch {
        if (progressId) notify.update(progressId, { message: 'Finishing on the main thread…' })
        data = await exportDirect(exportRoot, format)
        path = 'worker-fallback-direct'
      }
    } else {
      data = await exportDirect(exportRoot, format)
    }

    const dbg = debugWindow()
    if (dbg) {
      dbg.__lastSceneExport = {
        path,
        bytes: typeof data === 'string' ? data.length : data.byteLength,
        format,
      }
    }

    downloadBlob(new Blob([data], { type: meta.mime }), `${safe}-${stamp}.${meta.ext}`)
    if (progressId) notify.success(progressId, '3D model saved to your downloads')
    else notify.start({ title: '3D model saved to your downloads', kind: 'success' })
  } catch {
    if (progressId) notify.error(progressId, 'Could not export the 3D model')
    else notify.start({ title: 'Could not export the 3D model', kind: 'error' })
  }
}
