import { canRecord } from '../scene/RecordController'
import { useStore } from '../state/store'

/**
 * One-click keyframed walkthrough video: pace + record + fly the saved-views
 * cinematic tour, which auto-stops and downloads the .webm when the tour ends
 * (RecordController teardown). Reuses the whole existing tour + MediaRecorder
 * path — this just coordinates pace, recording and the tour start.
 *
 * `totalSeconds` (optional) spreads evenly across the legs (one fewer than the
 * number of views); omit to keep the current per-leg pace.
 */
export function recordViewTour(totalSeconds?: number): void {
  const s = useStore.getState()
  const views = s.savedViews
  if (views.length < 2) {
    s.notify.start({ title: 'Save at least two views to record a walkthrough', kind: 'info' })
    return
  }
  if (typeof totalSeconds === 'number' && totalSeconds > 0) {
    s.setViewTourLegSeconds(totalSeconds / (views.length - 1))
  }
  s.setCameraMode('orbit')
  // Record only where supported (MediaRecorder + canvas captureStream); the tour
  // still plays without recording on unsupported browsers.
  if (canRecord()) {
    s.setRecording(true)
    s.notify.start({
      title: 'Recording walkthrough — the video downloads when it ends',
      kind: 'info',
    })
  }
  s.setTouring('views')
}
