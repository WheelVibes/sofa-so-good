/** Coalesce a high-frequency progress stream to at most one `sink` call per
 *  animation frame. A tight loop (thousands of files) can call `push` far faster
 *  than the screen refreshes; without this, each call is a React setState that
 *  thrashes reconciliation and starves paint, so the counter freezes then jumps.
 *  `push` stores the latest value and schedules a single frame; `flush` delivers
 *  the last value synchronously so a terminal value is never dropped.
 *
 *  Uses `requestAnimationFrame` when available, falling back to a ~16ms timer so
 *  it also works in non-DOM/test environments. */
export function coalesceProgress<T>(sink: (value: T) => void): {
  push: (value: T) => void
  flush: () => void
} {
  const hasRaf = typeof requestAnimationFrame === 'function'
  const schedule = hasRaf
    ? (cb: () => void) => requestAnimationFrame(cb)
    : (cb: () => void) => setTimeout(cb, 16) as unknown as number
  const cancel = hasRaf
    ? (id: number) => cancelAnimationFrame(id)
    : (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>)

  let handle: number | null = null
  let latest: T
  let has = false

  const deliver = () => {
    handle = null
    if (!has) return
    has = false
    sink(latest)
  }

  return {
    push(value: T) {
      latest = value
      has = true
      if (handle === null) handle = schedule(deliver)
    },
    flush() {
      if (handle !== null) {
        cancel(handle)
        handle = null
      }
      if (!has) return
      has = false
      sink(latest)
    },
  }
}
