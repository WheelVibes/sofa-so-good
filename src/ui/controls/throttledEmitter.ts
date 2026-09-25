/**
 * A tiny leading-edge throttle with a trailing flush, used to coalesce the
 * continuous `onChange` stream from the ColorPicker's SV-pad / hue-bar POINTER
 * drags (dozens of events per second) into at most one apply every
 * `intervalMs`. Without this, a single drag over a FINISH-RECOLOR surface bakes
 * a fresh ≤1024² recolored albedo texture per tick and saturates the main
 * thread + GPU before the material-cache LRU can dispose the stale ones.
 *
 * Semantics:
 * - the FIRST `emit` fires `fn` immediately (leading edge) and opens a window;
 * - further `emit`s inside the window only remember the latest value;
 * - when the window closes, the latest pending value fires once (trailing edge)
 *   and a fresh window opens (so a sustained drag emits at a steady cadence);
 * - `flush()` fires the latest pending value now (the guaranteed final apply on
 *   pointerup / drag-end) and closes the window — nothing fires afterwards until
 *   a new `emit`;
 * - `cancel()` drops any pending value without firing.
 *
 * Pure + framework-agnostic so it is unit-testable with fake timers.
 */
export interface ThrottledEmitter<T> {
  emit: (value: T) => void
  flush: () => void
  cancel: () => void
}

export function createThrottledEmitter<T>(
  fn: (value: T) => void,
  intervalMs = 150,
): ThrottledEmitter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let lastValue: T

  const onWindowEnd = () => {
    timer = null
    if (!pending) return
    pending = false
    const value = lastValue
    // Re-open the window so a continuous stream emits at a steady cadence
    // rather than firing every event once the first window elapses.
    timer = setTimeout(onWindowEnd, intervalMs)
    fn(value)
  }

  return {
    emit(value: T) {
      lastValue = value
      if (timer === null) {
        // Leading edge: apply straight away, then start coalescing.
        timer = setTimeout(onWindowEnd, intervalMs)
        fn(value)
      } else {
        pending = true
      }
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (pending) {
        pending = false
        fn(lastValue)
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = false
    },
  }
}

/**
 * A LEADING-EDGE DEBOUNCE over the same `emit`/`flush`/`cancel` contract — one apply at the start
 * of a stream and one more once the stream has been QUIET for `quietMs`, with nothing in between.
 *
 * {@link createThrottledEmitter} re-opens its window while a stream continues, so a sustained drag
 * applies at a steady cadence. That is right for the ColorPicker, where each apply is a texture
 * bake the user is watching for. It is wrong where one apply costs a tenth of a second of GPU work
 * whose result nobody can see mid-gesture — the per-room specular probes (ROOM-PROBES): a capture
 * is 130-180 ms, and dragging the time-of-day slider through N whole-hour sun buckets paid it N
 * times, for a picture of a room that is about to change again.
 *
 * Semantics, and the leading edge is the load-bearing half:
 * - the FIRST `emit` after a quiet period fires `fn` IMMEDIATELY, so a DELIBERATE single change
 *   (a time preset, a keyboard nudge, a flag toggle, a plan swap) is not delayed at all — a
 *   trailing-only debounce would have made every one of those feel laggy for the sake of the drag;
 * - every further `emit` restarts the quiet window and only remembers the latest value;
 * - `quietMs` after the LAST `emit`, the latest pending value fires once and the window closes, so
 *   the next `emit` is a leading edge again;
 * - `flush()` fires any pending value now; `cancel()` drops it.
 *
 * **The window is armed from the END of `fn`, and it is never shorter than `fn` itself took.**
 * Both halves of that were measured, and neither is tidiness.
 *
 * `fn` here is SYNCHRONOUS WORK that can be longer than the window — a room-probe capture is
 * 130-180 ms on a GPU and was measured at **1.1-3.6 s** on the software rasteriser. Arming BEFORE
 * the call leaves the window already expired the moment it returns, so every input event that
 * queued up behind the blocked main thread arrives to find the emitter idle and takes the leading
 * edge again: a 12-step slider drag became **12 serialized captures over 60 s**.
 *
 * Arming from the end is still not enough on a slow machine, because the caller's own follow-on
 * work lands between the two — for the room probes, re-attaching ~400 materials costs a shader
 * recompile the R7-L notes measured at 216 ms on a real GPU and seconds on the rasteriser — so the
 * next queued event's effect can commit AFTER a fixed 300 ms window has already closed. A REAL
 * pointer drag across the time-of-day slider measured **7 captures / 43.8 s** that way. The window
 * therefore scales with the work: `max(quietMs, however long the last call took)`. That is the
 * rule "never re-trigger sooner than the last run took", it is self-tuning (a 150 ms capture keeps
 * the 300 ms floor, a 6 s one gets a 6 s window), and it is what stops the work pacing its own
 * trigger.
 *
 * Pure + framework-agnostic so it is unit-testable with fake timers.
 */
export function createSettleEmitter<T>(fn: (value: T) => void, quietMs = 300): ThrottledEmitter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let lastValue: T
  // The current quiet window. Held, not recomputed, so a coalesced emit RESTARTS the adaptive
  // window rather than shrinking it back to the floor — the first cut did the latter, and a real
  // slider drag still measured one capture per few pointer moves because of it.
  let windowMs = quietMs

  const settle = () => {
    timer = null
    if (!pending) return
    pending = false
    fire(lastValue)
  }

  const fire = (value: T) => {
    const t0 = Date.now()
    try {
      fn(value)
    } finally {
      // From the END of the work, and never shorter than the work — see the docblock. `finally`,
      // so a throwing `fn` cannot leave the emitter permanently idle with a pending value.
      windowMs = Math.max(quietMs, Date.now() - t0)
      timer = setTimeout(settle, windowMs)
    }
  }

  return {
    emit(value: T) {
      lastValue = value
      if (timer === null) {
        fire(value)
        return
      }
      pending = true
      clearTimeout(timer)
      timer = setTimeout(settle, windowMs)
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (pending) {
        pending = false
        fn(lastValue)
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pending = false
    },
  }
}
