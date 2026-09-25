import { useState } from 'react'
import { useFeature } from '../../features/useFeature'
import {
  dismissInstallCta,
  dismissIosCoachmark,
  isInstallCtaDismissed,
  isIosCoachmarkDismissed,
  promptInstall,
  shouldOfferIosCoachmark,
} from '../../pwa/installPrompt'
import { useInstallPromptState } from '../../pwa/installPromptState'
import { CHECKLIST_STEPS } from '../../state/slices/checklistSlice'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * PWA install CTA + iOS "Add to Home Screen" coachmark (R7-M / U2). Full
 * research + design writeup: `docs/developer/pwa-install.md`.
 *
 * **When it fires, and why.** The audit (`docs/audit/product-ux-2026-09-25.md`
 * §5 brief 3) suggested triggering off the getting-started checklist's
 * "all done" signal (`checklistDone.length === total`), per web.dev's
 * documented anti-pattern warning against prompting on first paint. This
 * component uses that signal but ALSO waits for `checklistDismissed`: the
 * literal "all done" instant is while the checklist card's own "Done — happy
 * designing!" button is still on screen, in the EXACT same bottom-left slot
 * this card renders in (`.onb-check`/`.showroom-badge` are explicitly
 * documented as sharing that slot because they never co-exist — see
 * `features.css`). Firing on the raw completion signal would collide with
 * that still-visible card; waiting for the dismissal means this card only
 * ever appears once that slot is actually free, at a moment the user has
 * unambiguously said "I'm done getting started" — if anything a STRONGER
 * value signal than the brief's literal suggestion.
 *
 * **Showroom decision (explicit, not inherited).** A `#/showroom/<code>`
 * visitor is never offered installation: `pwaInstallPrompt` is in
 * `flags/viewOnly.ts`'s denylist, and this component ALSO checks `viewOnly`
 * directly as a defence-in-depth belt-and-braces (matching how `canEditScene`
 * is both a flag AND a store check elsewhere). The reason is concrete, not
 * merely "visitors get less": the manifest's `start_url` is the app root
 * (`"."`), not the current URL fragment, so "installing" a showroom session
 * would install the generic app pointed at the visitor's OWN empty default
 * flat — reopening the icon would not show them the home they were just
 * shown. Offering it would be a false promise, and it would also repeat the
 * V5 mistake this round already fixed (a modal ambushing a showroom visitor
 * on first paint, `docs/developer/showroom-links.md` §4b): even though this
 * card is never a modal and never fires before a real interaction, a
 * viewOnly session by construction never completes the checklist (that flag
 * is ALSO denylisted, so `OnboardingChecklist` never mounts to mark steps in
 * a showroom) — so the trigger condition is doubly unreachable there, and
 * the explicit checks make that "never" a deliberate invariant rather than a
 * coincidence of two unrelated gates.
 */
export function PwaInstallCard() {
  const enabled = useFeature('pwaInstallPrompt')
  const viewOnly = useStore((s) => s.viewOnly)
  const cameraMode = useStore((s) => s.cameraMode)
  const floorPlanEditing = useStore((s) => s.floorPlanEditing)
  const presenting = useStore((s) => s.presenting)
  const checklistDoneCount = useStore((s) => s.checklistDone.length)
  const checklistDismissed = useStore((s) => s.checklistDismissed)
  const installState = useInstallPromptState()

  // Re-render on a dismiss click without needing a store field for it — both
  // dismissals are plain localStorage writes (mirrors `hdb_onboarded`), not
  // design/session state, so a local bump is enough to hide the card.
  const [, forceUpdate] = useState(0)

  const valueMomentReached = checklistDoneCount >= CHECKLIST_STEPS.length && checklistDismissed
  const screenFree = cameraMode === 'orbit' && !floorPlanEditing && !presenting

  if (!enabled || viewOnly || !screenFree || !valueMomentReached) return null

  const showInstallCta = installState.type === 'available' && !isInstallCtaDismissed()
  const showIosCoachmark =
    installState.type !== 'installed' && shouldOfferIosCoachmark() && !isIosCoachmarkDismissed()

  // Never both — `shouldOfferIosCoachmark` is iOS-only and iOS never fires
  // `beforeinstallprompt`, so `installState.type` can't be `'available'`
  // there, but keep the precedence explicit rather than relying on that.
  if (showInstallCta) {
    return (
      <aside className="pwa-install-card" aria-label="Install this app">
        <div className="pwa-install-card-head">
          <Icon.Download width={15} height={15} className="icn" />
          <b>Install Sofa So Good</b>
          <button
            type="button"
            className="icon-btn"
            aria-label="Not now"
            title="Not now — you won't be asked again"
            onClick={() => {
              dismissInstallCta()
              forceUpdate((n) => n + 1)
            }}
          >
            <Icon.Close width={14} height={14} />
          </button>
        </div>
        <p className="pwa-install-card-sub">
          Add it to your home screen or dock for one-tap access — it works offline once installed.
        </p>
        <button
          type="button"
          className="btn btn-accent btn-block"
          onClick={async () => {
            const outcome = await promptInstall()
            if (outcome === 'accepted') {
              useStore.getState().notify.start({ title: 'Installed', kind: 'success' })
            }
            forceUpdate((n) => n + 1)
          }}
        >
          <Icon.Download width={14} height={14} />
          Install
        </button>
      </aside>
    )
  }

  if (showIosCoachmark) {
    return (
      <aside className="pwa-install-card" aria-label="Add to Home Screen">
        <div className="pwa-install-card-head">
          <Icon.Share width={15} height={15} className="icn" />
          <b>Add to Home Screen</b>
          <button
            type="button"
            className="icon-btn"
            aria-label="Got it, dismiss"
            title="Got it — you won't be shown this again"
            onClick={() => {
              dismissIosCoachmark()
              forceUpdate((n) => n + 1)
            }}
          >
            <Icon.Close width={14} height={14} />
          </button>
        </div>
        <p className="pwa-install-card-sub">
          Tap <b>Share</b>, then “Add to Home Screen”, for one-tap access — it works offline once
          installed.
        </p>
      </aside>
    )
  }

  return null
}
