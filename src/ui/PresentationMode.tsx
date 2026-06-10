import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

const AUTO_ADVANCE_MS = 6000

/**
 * Full-screen client presentation: steps through the saved camera views as a
 * slideshow, applying each view (angle + lighting) and showing its name + an
 * optional presenter note as a caption. Arrow keys / on-screen controls navigate;
 * Esc exits; an Auto toggle advances on a timer. The overlay is pointer-through
 * except for its control bar, so the user can still nudge the camera mid-slide.
 *
 * Gated by the `presentation` feature flag at the mount site (App).
 */
export function PresentationMode() {
  const presenting = useStore((s) => s.presenting)
  const setPresenting = useStore((s) => s.setPresenting)
  const views = useStore(useShallow((s) => s.savedViews))
  const applyView = useStore((s) => s.applyView)
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(false)

  const count = views.length
  const go = useCallback(
    (next: number) => {
      if (count === 0) return
      const wrapped = ((next % count) + count) % count
      setIndex(wrapped)
    },
    [count],
  )

  // Apply the active view whenever the slide changes while presenting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyView is a stable store action; re-applying on index/presenting change is the intent.
  useEffect(() => {
    if (!presenting || count === 0) return
    const v = views[Math.min(index, count - 1)]
    if (v) applyView(v.id)
  }, [presenting, index, count, views])

  // Reset to the first slide each time presentation starts.
  useEffect(() => {
    if (presenting) setIndex(0)
    else setAuto(false)
  }, [presenting])

  // Keyboard navigation while presenting.
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
      else if (e.key === 'ArrowRight' || e.key === ' ') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, index, go, setPresenting])

  // Auto-advance timer.
  useEffect(() => {
    if (!presenting || !auto || count === 0) return
    const t = setTimeout(() => go(index + 1), AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [presenting, auto, index, count, go])

  if (!presenting || count === 0) return null
  const view = views[Math.min(index, count - 1)]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 'var(--z-overlay)' as unknown as number,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Top bar: title + exit */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--s-3)',
          pointerEvents: 'auto',
          background: 'linear-gradient(to bottom, var(--scrim, rgba(0,0,0,0.45)), transparent)',
        }}
      >
        <span style={{ color: 'var(--on-scrim, #fff)', fontWeight: 600, fontSize: 'var(--t-sm)' }}>
          Presentation · {index + 1} / {count}
        </span>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => setPresenting(false)}
          title="Exit presentation (Esc)"
        >
          <Icon.Close width={16} height={16} />
          Exit
        </button>
      </div>

      {/* Bottom caption + controls */}
      <div
        style={{
          pointerEvents: 'auto',
          padding: 'var(--s-4)',
          background: 'linear-gradient(to top, var(--scrim, rgba(0,0,0,0.55)), transparent)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
        }}
      >
        <div style={{ color: 'var(--on-scrim, #fff)', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-lg)' }}>{view.name}</div>
          {view.note ? (
            <div style={{ fontSize: 'var(--t-sm)', opacity: 0.9, marginTop: 4, maxWidth: '60ch' }}>
              {view.note}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flex: '0 0 auto' }}>
          <button
            type="button"
            className={`btn btn-soft${auto ? ' on' : ''}`}
            onClick={() => setAuto((a) => !a)}
            title="Auto-advance slides"
          >
            {auto ? 'Auto ⏸' : 'Auto ▶'}
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => go(index - 1)}
            aria-label="Previous view"
          >
            <Icon.ArrowLeft width={16} height={16} />
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => go(index + 1)}
            aria-label="Next view"
          >
            <Icon.ChevronRight width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
