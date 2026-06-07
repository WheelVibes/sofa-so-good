import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { TOUR_STEPS } from './tourSteps'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8 // spotlight padding around the target
const CARD_W = 320
const GAP = 14 // gap between spotlight and card

/**
 * Guided product tour: a dimmed spotlight overlay that highlights one UI element
 * at a time with an explanatory card, walking a new user through the design
 * workflow (layout → furniture → customise → finishes → walk → time of day).
 * Steps whose target is missing (e.g. hidden behind the mobile hamburger) fall
 * back to a centred card so the tour still reads everywhere. Pure DOM overlay;
 * blocks interaction so the Back/Next/Skip controls drive it.
 */
export function ProductTour() {
  const open = useStore((s) => s.tourOpen)
  const step = useStore((s) => s.tourStep)
  const next = useStore((s) => s.tourNext)
  const prev = useStore((s) => s.tourPrev)
  const end = useStore((s) => s.endTour)

  const [rect, setRect] = useState<Rect | null>(null)
  const current = TOUR_STEPS[step]

  // Measure the target element for the current step (re-measured on step change,
  // resize, and a tick later so freshly-shown elements settle).
  useLayoutEffect(() => {
    if (!open || !current) return
    let raf = 0
    const measure = () => {
      const el = current.target ? document.querySelector<HTMLElement>(current.target) : null
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
      } else {
        setRect(null)
      }
    }
    measure()
    raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, current])

  // Keyboard: Esc skips, arrows / Enter navigate.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next(TOUR_STEPS.length)
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, prev, end])

  if (!open || !current) return null

  const isLast = step === TOUR_STEPS.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Card placement: below the spotlight if there's room, else above; clamped to
  // the viewport. No target → centre.
  let cardStyle: React.CSSProperties
  if (rect) {
    const below = rect.top + rect.height + GAP
    const placeBelow = below + 220 < vh
    const top = placeBelow ? below : Math.max(GAP, rect.top - GAP - 220)
    let left = rect.left + rect.width / 2 - CARD_W / 2
    left = Math.min(Math.max(GAP, left), vw - CARD_W - GAP)
    cardStyle = { top, left, width: CARD_W }
  } else {
    cardStyle = {
      top: '50%',
      left: '50%',
      width: `min(${CARD_W}px, calc(100vw - 32px))`,
      transform: 'translate(-50%, -50%)',
    }
  }

  return createPortal(
    <div
      className="tour-root"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal, 9000)' as never }}
    >
      {/* Dimmer: a spotlight hole (box-shadow) over the target, else a flat scrim. */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(20,16,12,0.55)',
            outline: '2px solid var(--accent)',
            outlineOffset: 2,
            pointerEvents: 'none',
            transition: 'top .2s, left .2s, width .2s, height .2s',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.55)' }} />
      )}

      {/* Click-catcher so the app underneath isn't interacted with by accident. */}
      <button
        type="button"
        aria-label="Skip tour"
        onClick={end}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'default',
        }}
      />

      {/* Step card. */}
      <div
        className="panel"
        style={{
          position: 'fixed',
          padding: 16,
          borderRadius: 'var(--r-3, 12px)',
          boxShadow: 'var(--shadow-panel)',
          ...cardStyle,
        }}
        // Stop the click-catcher from closing when interacting with the card.
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 'var(--t-2xs)',
              fontWeight: 700,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button type="button" className="icon-btn" aria-label="Skip tour" onClick={end}>
            <Icon.Close width={15} height={15} />
          </button>
        </div>
        <div
          style={{
            fontSize: 'var(--t-md)',
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 6,
          }}
        >
          {current.title}
        </div>
        <p
          style={{
            fontSize: 'var(--t-sm)',
            lineHeight: 1.5,
            color: 'var(--text-2)',
            margin: '0 0 14px',
          }}
        >
          {current.body}
        </p>
        {/* Progress dots. */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              style={{
                width: i === step ? 18 : 6,
                height: 6,
                borderRadius: 999,
                background: i === step ? 'var(--accent)' : 'var(--border-2)',
                transition: 'width .2s, background .2s',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={end}
            style={{ marginRight: 'auto' }}
          >
            Skip
          </button>
          {step > 0 ? (
            <button type="button" className="btn btn-soft" onClick={prev}>
              Back
            </button>
          ) : null}
          <button type="button" className="btn btn-accent" onClick={() => next(TOUR_STEPS.length)}>
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
