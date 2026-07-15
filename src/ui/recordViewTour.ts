import { canRecord } from '../scene/RecordController'
import { useStore } from '../state/store'

/** Current per-leg pace used as the modal's default (matches the pre-modal 5s
 *  per view the "Record walkthrough" entry used to hard-code). */
const DEFAULT_LEG_SECONDS = 5
// Per-leg pace bounds enforced by `cameraSlice.setViewTourLegSeconds`; mirrored
// here so the total→per-leg conversion clamps the same way.
const MIN_LEG_SECONDS = 0.5
const MAX_LEG_SECONDS = 12

/**
 * Parse + clamp the total-video-length answer from the duration prompt.
 * `null` (Cancel / blank) stays `null` so the caller can abort. Non-numeric /
 * non-positive input falls back to the sensible default; a valid number is
 * clamped so the resulting per-leg pace lands inside the slice's supported
 * range. Pure so it can be unit-tested without a modal.
 */
export function parseTourDuration(
  raw: string | null,
  legs: number,
  defaultTotal: number,
): number | null {
  if (raw === null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return defaultTotal
  const safeLegs = Math.max(1, legs)
  return Math.min(MAX_LEG_SECONDS * safeLegs, Math.max(MIN_LEG_SECONDS * safeLegs, n))
}

/**
 * One-click keyframed walkthrough video: pace + record + fly the saved-views
 * cinematic tour, which auto-stops and downloads the clip when the tour ends
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

/**
 * Ask the user for the total video length (a themed number prompt — reuses the
 * shared `promptText`/`PromptModal` infra), then start the recorded tour.
 * Cancelling / clearing the field aborts cleanly — no recording starts.
 */
export async function promptAndRecordViewTour(): Promise<void> {
  const s = useStore.getState()
  const views = s.savedViews
  if (views.length < 2) {
    s.notify.start({ title: 'Save at least two views to record a walkthrough', kind: 'info' })
    return
  }
  const legs = views.length - 1
  const defaultTotal = DEFAULT_LEG_SECONDS * legs
  const answer = await s.promptText({
    title: 'Record walkthrough',
    label: `Total video length in seconds (${views.length} views)`,
    defaultValue: String(defaultTotal),
    submitLabel: 'Start recording',
    numeric: true,
  })
  const total = parseTourDuration(answer, legs, defaultTotal)
  if (total === null) return // cancelled — nothing recorded
  recordViewTour(total)
}
