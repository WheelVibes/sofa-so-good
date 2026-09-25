import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/**
 * Leave showroom mode and keep the design as an ordinary editable session.
 *
 * Nothing is re-decoded: the design is already in the store, so "taking a copy"
 * is only dropping the session's view-only capability (which re-resolves the
 * withheld feature flags) and clearing the `#/showroom/…` fragment so a reload
 * doesn't put the visitor straight back into the tour.
 *
 * Exported so the Share modal can offer the same action from its own copy.
 */
export function takeEditableCopy(): void {
  useStore.getState().setViewOnly(false)
  try {
    const url = new URL(globalThis.location.href)
    url.hash = ''
    globalThis.history?.replaceState(null, '', url.toString())
  } catch {
    /* no history/URL (non-browser) */
  }
  useStore.getState().notify.start({
    title: 'This design is yours now',
    kind: 'success',
    message: 'Every tool is unlocked. The original showroom link is unchanged.',
  })
}

/**
 * Showroom-mode indicator (`viewOnlyShare` flag) — the one visible sign that
 * this session came from a view-only `#/showroom/<code>` link.
 *
 * Deliberately framed as a *place*, not a restriction: "Showroom" with a short
 * line about what you can still do, and one button to take your own editable
 * copy. No lock icons, no warning colour, no "read-only" scold — the tour is
 * meant to be the good experience, and every real-estate virtual tour a visitor
 * has seen is view-only by construction, so it needs no apology.
 *
 * Placed bottom-left, where the getting-started checklist normally sits (that
 * card is withheld in showroom mode, so the two can never collide). Hidden
 * during the full-screen presentation slideshow, which owns the whole viewport.
 */
export function ShowroomBadge() {
  const enabled = useFeature('viewOnlyShare')
  const viewOnly = useStore((s) => s.viewOnly)
  const presenting = useStore((s) => s.presenting)

  if (!enabled || !viewOnly || presenting) return null

  return (
    <aside className="hud-card-bl showroom-badge" aria-label="Showroom mode">
      <div className="showroom-badge-head">
        <Icon.Eye width={15} height={15} className="icn" />
        <b>Showroom</b>
      </div>
      <p className="showroom-badge-sub">
        Someone shared this home with you. Look around, walk through it, change the light — the
        design stays as they left it.
      </p>
      {/* V8: this is the only conversion action in the entire view-only experience,
          so it carries the accent weight the Share modal's own showroom button has.
          Still no lock icon and no scolding — the card offers a door, it doesn't
          apologise for a wall. */}
      <button type="button" className="btn btn-accent btn-block" onClick={takeEditableCopy}>
        <Icon.Edit width={14} height={14} />
        Make it mine
      </button>
    </aside>
  )
}
