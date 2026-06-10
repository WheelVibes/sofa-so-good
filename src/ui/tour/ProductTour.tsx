import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'
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
 * workflow. It's *interactive*: the spotlight is a real hole — the highlighted
 * control stays clickable, and clicking it advances the tour (so the user
 * performs the actual action). Everything else is blocked so a stray click can't
 * disturb the app, and **only the explicit Skip button (or Esc) ends the tour**.
 * Steps whose target is missing (e.g. behind the mobile hamburger) fall back to
 * spotlighting the hamburger; no-target steps centre with a flat scrim.
 */
export function ProductTour() {
  const open = useStore((s) => s.tourOpen)
  const step = useStore((s) => s.tourStep)
  const next = useStore((s) => s.tourNext)
  const prev = useStore((s) => s.tourPrev)
  const end = useStore((s) => s.endTour)

  const isMobile = useIsMobile()
  const [rect, setRect] = useState<Rect | null>(null)
  const current = TOUR_STEPS[step]

  // The spotlight tour targets desktop toolbar controls and its overlay sits
  // above the mobile hamburger sheet — so it can't work on mobile and would
  // block the hamburger. End it if it somehow opens on a mobile viewport
  // (App shows the centred onboarding carousel there instead).
  useEffect(() => {
    if (open && isMobile) end()
  }, [open, isMobile, end])
  // The live resolved target element for the current step (real target or the
  // mobile hamburger fallback). Used by the click-to-advance listener.
  const targetRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Measure the target element for the current step (re-measured on step change,
  // resize, and a tick later so freshly-shown elements settle).
  useLayoutEffect(() => {
    if (!open || !current) return
    let raf = 0
    // Resolve the step's target; on mobile the desktop toolbar targets live in
    // the hamburger sheet, so fall back to spotlighting the hamburger (where the
    // menus are). No-target steps stay centred (findTarget returns null).
    const findTarget = (): HTMLElement | null => {
      if (!current.target) return null
      return (
        document.querySelector<HTMLElement>(current.target) ??
        document.querySelector<HTMLElement>('[aria-label="Menu"]')
      )
    }
    const measure = () => {
      const el = findTarget()
      targetRef.current = el
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
      } else {
        setRect(null)
      }
    }
    // Bring the target into view once per step (the toolbar scrolls horizontally
    // on narrow desktops, so a target like Scene/View could be off-screen). Done
    // here, NOT in `measure`, so the scroll it triggers can't loop the listener.
    findTarget()?.scrollIntoView({ block: 'nearest', inline: 'center' })
    measure()
    raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // Keep re-measuring briefly so the spotlight tracks a control that appears or
    // moves right after a step change (e.g. entering the room editor).
    const poll = window.setInterval(measure, 250)
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 2500)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.clearInterval(poll)
      window.clearTimeout(stopPoll)
    }
  }, [open, current])

  // Click-to-advance: when the user clicks the spotlighted control itself, the
  // tour moves on (after a short beat so the control's own click handler runs and
  // its UI settles). Capture phase so we see the click regardless of where it's
  // handled; we explicitly ignore clicks on the tour card.
  useEffect(() => {
    if (!open || !current) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (cardRef.current?.contains(t)) return
      const el = targetRef.current
      if (el?.contains(t)) {
        window.setTimeout(() => next(TOUR_STEPS.length), 380)
      }
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [open, current, next])

  // Keyboard: Esc skips the tour, arrows navigate (a keyboard escape hatch — the
  // explicit Skip button is the on-screen equivalent).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end()
      else if (e.key === 'ArrowRight') next(TOUR_STEPS.length)
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, prev, end])

  if (!open || !current || isMobile) return null

  const isLast = step === TOUR_STEPS.length - 1
  // An action step forces interaction (no Next) — but only when we actually have
  // a target to click; if it's missing, fall back to a Next button so the user
  // is never trapped.
  const forceClick = !!current.action && !!rect
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

  // Transparent click-blockers around the spotlight hole. They absorb clicks on
  // the dimmed area (so the app underneath isn't disturbed) WITHOUT ending the
  // tour, while leaving the hole itself click-through to the real control.
  const blocker: React.CSSProperties = { position: 'fixed', background: 'transparent' }
  const holeTop = rect ? rect.top - PAD : 0
  const holeLeft = rect ? rect.left - PAD : 0
  const holeW = rect ? rect.width + PAD * 2 : 0
  const holeH = rect ? rect.height + PAD * 2 : 0

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
            top: holeTop,
            left: holeLeft,
            width: holeW,
            height: holeH,
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

      {/* Click-blockers: full-screen when centred (no hole); four panes around the
          hole otherwise, so the spotlighted control stays interactive. None of
          these end the tour — that's the Skip button's job alone. */}
      {rect ? (
        <>
          <div style={{ ...blocker, top: 0, left: 0, right: 0, height: Math.max(0, holeTop) }} />
          <div style={{ ...blocker, top: holeTop + holeH, left: 0, right: 0, bottom: 0 }} />
          <div
            style={{
              ...blocker,
              top: holeTop,
              left: 0,
              width: Math.max(0, holeLeft),
              height: holeH,
            }}
          />
          <div
            style={{ ...blocker, top: holeTop, left: holeLeft + holeW, right: 0, height: holeH }}
          />
        </>
      ) : (
        <div style={{ ...blocker, inset: 0 }} />
      )}

      {/* Step card. */}
      <div
        ref={cardRef}
        className="panel"
        style={{
          position: 'fixed',
          padding: 16,
          borderRadius: 'var(--r-3, 12px)',
          boxShadow: 'var(--shadow-panel)',
          ...cardStyle,
        }}
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
        {forceClick ? (
          <div
            style={{
              fontSize: 'var(--t-2xs)',
              fontWeight: 600,
              color: 'var(--accent-text, var(--accent))',
              margin: '-6px 0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon.Pin width={12} height={12} />
            Click the highlighted control to continue
          </div>
        ) : null}
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
            Skip tour
          </button>
          {step > 0 ? (
            <button type="button" className="btn btn-soft" onClick={prev}>
              Back
            </button>
          ) : null}
          {!forceClick ? (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => next(TOUR_STEPS.length)}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
