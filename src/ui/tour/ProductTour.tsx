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
 *
 * On mobile the toolbar controls live behind the hamburger sheet, so before
 * spotlighting a step the tour opens the sheet and expands the right accordion
 * section (`step.mobile`) to bring the real control on screen — the spotlight
 * then highlights it just like on desktop and the user taps it to advance. The
 * tour overlay (z-modal) sits above the sheet (z-overlay), so the four blocker
 * panes dim the rest of the sheet while the hole keeps the control tappable.
 * Steps with no mobile-reachable control (and any no-target step) centre as a
 * plain card with the sheet closed.
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

  // The live resolved target element for the current step (real target or the
  // mobile hamburger fallback). Used by the click-to-advance listener.
  const targetRef = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Measure the target element for the current step (re-measured on step change,
  // resize, and a tick later so freshly-shown elements settle).
  useLayoutEffect(() => {
    if (!open || !current) return
    let raf = 0
    // On mobile, bring the step's control on screen before measuring: open the
    // hamburger sheet and expand the accordion section that holds it. Each call
    // is idempotent (only clicks when the sheet/section isn't already open) so
    // the re-measure poll below can keep it open without toggling it shut. When
    // a step has no mobile target, close the sheet so the centred card is clean.
    const sheetEl = () => document.querySelector<HTMLElement>('.m-sheet')
    const menuBtn = () => document.querySelector<HTMLElement>('[aria-label="Menu"]')
    // Closing uses the sheet's dedicated Close button (only ever closes), not the
    // hamburger toggle — safe to call from a repeating poll without re-opening.
    const closeSheet = () =>
      document.querySelector<HTMLElement>('.m-sheet [aria-label="Close"]')?.click()
    const revealMobile = () => {
      const m = current.mobile
      if (!m) {
        if (sheetEl()) closeSheet() // centred steps want no sheet
        return
      }
      if (!sheetEl()) {
        menuBtn()?.click() // open the sheet; next poll tick selects the section
        return
      }
      if (m.section) {
        // Select the section in the master rail so its row target shows in the
        // detail pane (idempotent — only clicks when it isn't already current).
        const tab = document.querySelector<HTMLElement>(`[data-tour-section="${m.section}"]`)
        if (tab && tab.getAttribute('aria-current') !== 'true') tab.click()
      }
    }
    // Resolve the step's target. On mobile we use the mobile selector (resolved
    // once the sheet/section is revealed); on desktop the toolbar target, falling
    // back to the hamburger if it's tucked away. No-target steps stay centred.
    const findTarget = (): HTMLElement | null => {
      if (isMobile) {
        return current.mobile ? document.querySelector<HTMLElement>(current.mobile.target) : null
      }
      if (!current.target) return null
      return (
        document.querySelector<HTMLElement>(current.target) ??
        document.querySelector<HTMLElement>('[aria-label="Menu"]')
      )
    }
    // Scroll the target into view the first time it's found this step — guarded
    // so the scroll it triggers (which fires the scroll→measure listener) can't
    // loop. On desktop the toolbar scrolls horizontally; on mobile the revealed
    // row may sit below the sheet fold.
    let scrolled = false
    const measure = () => {
      if (isMobile) revealMobile()
      const el = findTarget()
      targetRef.current = el
      if (el) {
        if (!scrolled) {
          scrolled = true
          el.scrollIntoView({ block: 'nearest', inline: 'center' })
        }
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
  }, [open, current, isMobile])

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

  // Tidy up on unmount. The tour is only mounted while `tourOpen` (App gates it),
  // so it unmounts the moment the tour ends (Done/Skip/Esc) — close any mobile
  // hamburger sheet the tour opened so it doesn't linger behind the location
  // prompt. The Close button only exists when a sheet is open, so this is a no-op
  // on desktop or when nothing is open.
  useEffect(
    () => () => document.querySelector<HTMLElement>('.m-sheet [aria-label="Close"]')?.click(),
    [],
  )

  if (!open || !current) return null

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
  // tour, while leaving the hole itself click-through to the real control. They
  // opt back into pointer events because the root is pointer-events:none (so the
  // hole — which has no blocker — passes taps straight to the spotlighted control
  // instead of being swallowed by the full-screen root container).
  const blocker: React.CSSProperties = {
    position: 'fixed',
    background: 'transparent',
    pointerEvents: 'auto',
  }
  const holeTop = rect ? rect.top - PAD : 0
  const holeLeft = rect ? rect.left - PAD : 0
  const holeW = rect ? rect.width + PAD * 2 : 0
  const holeH = rect ? rect.height + PAD * 2 : 0

  return createPortal(
    <div
      className="tour-root"
      // pointer-events:none so the spotlight hole (which has no blocker pane over
      // it) lets taps reach the real control underneath; the blockers and card
      // re-enable pointer events for their own regions.
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as never,
        pointerEvents: 'none',
      }}
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
            boxShadow: '0 0 0 9999px var(--scrim)',
            outline: '2px solid var(--accent)',
            outlineOffset: 2,
            pointerEvents: 'none',
            transition:
              'top var(--dur-2) var(--ease-out), left var(--dur-2) var(--ease-out), width var(--dur-2) var(--ease-out), height var(--dur-2) var(--ease-out)',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--scrim)' }} />
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
          pointerEvents: 'auto',
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
            className="btn btn-sm"
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
