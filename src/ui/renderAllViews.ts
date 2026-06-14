import { captureCanvasPng } from '../scene/captureCanvas'
import { useStore } from '../state/store'

/** Slugify a name into a filename-safe token (shared by plan + view names). */
function slug(s: string, fallback: string): string {
  const out = s
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return out || fallback
}

/** Build the per-view PNG filename: `<plan>-<view>-NN.png`, zero-padded index so
 *  files sort in saved-view order in the downloads folder. Pure — unit-tested. */
export function viewFileName(planName: string, viewName: string, index: number): string {
  const plan = slug(planName, 'home')
  const view = slug(viewName, `view-${index + 1}`)
  const n = String(index + 1).padStart(2, '0')
  return `${plan}-${n}-${view}.png`
}

function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Batch-render every saved camera view to a downloaded PNG — SweetHome3DJS
 * "export to PNG for each stored point of view" parity (PARITY-BATCHRENDER).
 *
 * For each saved view it flies the camera there via `applyView` (which also
 * restores that view's captured lighting), waits for the ~0.6 s fly + a lighting
 * settle, then grabs a hi-fi frame with `captureCanvasPng` (a synchronous
 * `gl.render` + readback, so the frame is fresh at the camera's final pose).
 * Downloads are staggered so the browser doesn't drop rapid-fire blobs. Pure
 * client-side, no backend.
 */
export async function renderAllSavedViews(): Promise<void> {
  const start = useStore.getState()
  const views = start.savedViews
  if (views.length === 0) {
    start.notify.start({ title: 'No saved views to render yet', kind: 'info' })
    return
  }
  const planName = start.floorPlan.name || 'home'
  start.notify.start({
    title: `Rendering ${views.length} view${views.length === 1 ? '' : 's'}…`,
    kind: 'info',
  })

  let saved = 0
  for (let i = 0; i < views.length; i++) {
    const v = views[i]
    useStore.getState().applyView(v.id)
    // Fly is ~0.6 s; allow margin plus a beat for the restored lighting to apply.
    await sleep(900)
    const png = captureCanvasPng()
    if (!png) continue
    downloadDataUrl(png, viewFileName(planName, v.name, i))
    saved++
    // Stagger so the browser doesn't coalesce/drop back-to-back downloads.
    await sleep(200)
  }

  useStore.getState().notify.start({
    title:
      saved === views.length
        ? `Saved ${saved} view${saved === 1 ? '' : 's'} to your downloads`
        : `Saved ${saved} of ${views.length} views — try again if some are missing`,
    kind: saved > 0 ? 'success' : 'error',
  })
}
