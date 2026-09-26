# PWA install CTA + iOS coachmark (R7-M / U2)

Brief **R7-M / U2** — from the product audit `docs/audit/product-ux-2026-09-25.md` §5
brief 3: `public/manifest.webmanifest` and `src/pwa/swUpdate.ts` already ship, but
`grep -r beforeinstallprompt src/` was empty — nothing ever offered installation on
Chrome/Edge/Android, and Safari (which never fires that event) got no mention that
Add to Home Screen exists at all.

Ships behind the `pwaInstallPrompt` flag (`tier: 'simple'`, `default: true`).

---

## 1. Research (2026, cited)

Model knowledge is unreliable for platform-specific PWA behaviour (root `CLAUDE.md`'s
own rule), so this was checked live rather than assumed:

- **`beforeinstallprompt` is real but not Baseline.** It "does not work in some of the
  most widely-used browsers" (Firefox, desktop/iOS Safari never fire it). The documented
  pattern is: listen for it, `preventDefault()`, stash the event, and call `.prompt()`
  later from a genuine user gesture — the event is **single-use**.
  [MDN, `Window: beforeinstallprompt event`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event),
  [MDN, `Navigator: getInstalledRelatedApps()`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getInstalledRelatedApps),
  [MDN, `Trigger installation from your PWA`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt), 2026.
- **`getInstalledRelatedApps()`** can report the PWA itself (or a listed native
  companion) already installed, suppressing a redundant offer — but it is "limited
  availability… experimental" and needs a self-referencing `related_applications`
  manifest entry to detect the PWA itself, which this app's manifest does not yet
  declare. Used here as a **best-effort, feature-detected, failure-tolerant** second
  signal only — see §3.
  [MDN, `getInstalledRelatedApps()`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getInstalledRelatedApps), 2026.
- **When to show a custom CTA.** web.dev's install-promotion guidance: only promote
  *after* `beforeinstallprompt` has fired; keep the CTA "out of the way of the user's
  journey"; let the user dismiss it and **remember the preference**, re-prompting only
  on "a change in the user's relationship with your content" (e.g. a completed task) —
  not a timer, not first paint.
  [web.dev, `Patterns for promoting PWA installation`](https://web.dev/promote-install/index.html),
  [web.dev, `Installation prompt`](https://web.dev/learn/pwa/installation-prompt), 2026.
- **iOS Safari has never implemented `beforeinstallprompt`, and nothing changed in
  2026.** "Apple has given no sign of changing that." The only install path is manual:
  Share → Add to Home Screen. A web app cannot invoke or automate it — the only
  available mitigation is a one-time in-app tip naming the menu location.
  [PWA-on-iOS 2026 guides via web search, multiple independent sources converging on
  the same conclusion](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), 2026.
- **Since iOS 16.4, Chrome/Edge/Firefox on iPhone can ALSO add to the home screen from
  their own Share menus** (they still render via WebKit under Apple's iOS engine
  restrictions), so gating the coachmark on "iOS" (not "iOS *Safari* specifically") is
  the more correct, more broadly useful check — see §4 for why this repo already had a
  reusable `isIos()` sniff that does exactly that. The EU's iOS 17.4+/18.2
  alternative-browser-engine allowance is a separate, unrelated carve-out with near-zero
  adoption as of 2026 and does not change this.
- **Standalone/installed detection is a two-signal OR.** Combine the `(display-mode:
  standalone)` media query (Chromium/Firefox/Android, and iOS once installed) with the
  legacy `navigator.standalone` boolean Safari still exposes — neither alone covers
  every browser.
  [web.dev, `Detection`](https://web.dev/learn/pwa/detection), 2026.

## 2. State machine (mirrors `swUpdate.ts`/`updateFlowState.ts`)

`src/pwa/installPromptState.ts` is a plain module-level signal (`useSyncExternalStore`),
exactly the shape `updateFlowState.ts` already established for the update-check flow —
a value that changes far more often than the Zustand store needs to react to, with a
DEV-only `window.__installPrompt` seam so a Chrome-audit/`shot.mjs` scenario can drive
the real capture → defer → prompt code path (dispatching a plain `beforeinstallprompt`
`Event` with stub `prompt()`/`userChoice`, since a script can never dispatch a
*trusted* one and our own listener doesn't check `isTrusted`).

States: `unavailable → available → prompting → accepted | dismissed`, plus a terminal
`installed` reached either via `appinstalled` or via the already-installed/standalone
checks at boot.

`src/pwa/installPrompt.ts` is the sole writer (`swUpdate.ts` is the equivalent for the
update flow) — `wireInstallPrompt()` is called once from `main.tsx`, guarded the same
way `registerAppServiceWorker`'s `swWired` guards its own wiring.

## 3. Already-installed / standalone — never offer twice

`wireInstallPrompt()` checks, in order, BEFORE wiring any listener:

1. **`isStandaloneDisplayMode()`** (`src/utils/platform.ts`) — if the session is
   already running as the installed app, it cannot possibly receive
   `beforeinstallprompt` (that event only fires in an ordinary browser tab), so nothing
   is wired at all and the state resolves straight to `installed`.
2. **`getInstalledRelatedApps()`**, feature-detected and wrapped in try/catch/`.catch()`
   — if it resolves with any entries, the app is (or has a companion) already
   installed. This is best-effort and non-blocking: the `beforeinstallprompt` listener
   is still wired underneath it (§1 notes this API needs manifest work this app hasn't
   done yet to detect the PWA itself), so its absence or rejection changes nothing.

`appinstalled` (fired by the browser once an install genuinely completes, including one
started from the browser's OWN UI rather than this app's CTA) also resolves to
`installed` and clears the deferred event.

## 4. iOS coachmark — no event, so a static tip

`shouldOfferIosCoachmark()` = `isIos() && !isStandaloneDisplayMode()`. `isIos()` moved
from a private helper inside `ui/viewInAr.ts` (which needed the exact same iPhone/iPad/
touch-Mac sniff for AR Quick Look) to `src/utils/platform.ts`, so both features share one
UA sniff instead of two independently-drifting copies. There is no feature-detect for
"this is iOS" — the event's own absence isn't iOS-specific (desktop Firefox/Safari lack
it too) — so this is a deliberate, narrow, single-sourced exception to "no UA sniffing".

The coachmark reads "Tap **Share**, then 'Add to Home Screen'" rather than naming Safari
specifically, since (per §1) any iOS browser's own Share sheet offers the same item since
iOS 16.4.

## 5. When the CTA fires, and why

The audit's brief suggested reusing `OnboardingChecklist`'s "all done" signal
(`checklistDone.length === total`) as the trigger, per web.dev's "after a completed
task" guidance (§1). `ui/pwa/PwaInstallCard.tsx` uses that signal but **also waits for
`checklistDismissed`**:

The literal "all done" instant is while the checklist card's own "Done — happy
designing!" button is still on screen, in the **exact same bottom-left slot** this card
renders in — `.onb-check` and `.showroom-badge` are already documented in
`features.css` as sharing that slot specifically *because* they never co-exist. Firing
on the raw completion signal would collide with that still-visible card. Waiting for the
dismissal means the card only ever appears once the slot is genuinely free, at a moment
the user has unambiguously said "I'm done getting started" — a **stronger**, not weaker,
value signal than the brief's literal wording, and it costs nothing extra to check (the
field already exists on the same slice).

A "2nd session" fallback trigger (also mentioned in the audit's PWA research) was
considered and deliberately **not** added: it would need a new persisted session-count
field this codebase doesn't otherwise track, for a benefit (catching users who dismiss
the checklist before finishing) that is speculative without usage data. The
checklist-complete signal is real, already-instrumented, behavioural (not a timer), and
matches the audit's own citation — adding a second heuristic now would be scope creep
against a size-`M` brief. Noted here so it isn't silently reproposed as an oversight.

## 6. Showroom decision — explicit, not inherited

A `#/showroom/<code>` visitor is **never** offered installation. This was a deliberate
product call, not "visitors get less by default":

- **The manifest's `start_url` is `"."`** — the app root, not the current URL fragment.
  Installing a showroom session would install the generic app pointed at the visitor's
  own empty default flat; reopening the home-screen icon would **not** show them the
  home they were just shown. Offering it would be a false promise, not a convenience —
  the opposite of what installation is supposed to buy a returning visitor.
- Enforced **twice**, deliberately: `pwaInstallPrompt` is in `flags/viewOnly.ts`'s
  `VIEW_ONLY_BLOCKED_FLAGS` denylist (under "first-run coaching for an owner, noise for
  a visitor", next to `onboardChecklist`), AND `PwaInstallCard.tsx` checks
  `state.viewOnly` directly — the same belt-and-braces shape `canEditScene` uses
  elsewhere (`src/state/CLAUDE.md`). A unit test asserts the card stays hidden even if
  the flag were somehow still on, proving the component's own check is real and not
  merely inherited.
- This does **not** repeat the V5 mistake this round already fixed (a modal ambushing a
  showroom visitor on first paint — `docs/developer/showroom-links.md` §4b): the card is
  never a modal and never fires before a real interaction regardless of showroom status,
  and a showroom session by construction never completes the checklist anyway
  (`onboardChecklist` is ALSO denylisted, so `OnboardingChecklist` never mounts to mark
  steps there) — the trigger condition is doubly unreachable, making the "never" an
  invariant rather than a coincidence of two unrelated gates.

## 7. Dismissal — "don't ask again" sticks

Two independent localStorage flags, mirroring `hdb_onboarded`'s plain-string pattern:

- `hdb_install_dismissed` — set on an explicit "Not now" close of the Chromium/Edge CTA,
  **and** automatically when the browser's own native dialog is declined
  (`userChoice.outcome === 'dismissed'`) — per web.dev's "remember the preference"
  guidance, a decline through either surface counts.
- `hdb_ios_addtohome_dismissed` — set on "Got it" for the iOS coachmark. Fully
  independent: there is no `beforeinstallprompt`-driven state to key it off.

Both are read by the UI component, not by `installPromptState.ts` — the state machine
only reports what the BROWSER offers; whether to actually render given that offer (and
whether the user has opted out) is presentation policy, kept in one place
(`PwaInstallCard.tsx`) rather than smeared across the state machine.

## 8. Verified

**Verified live** (`scripts/scenarios/pwa-install-card.json`, both 1400×900 and
390×844, pinned clock, real interactions/clicks — not scripted-only): four control arms
(card absent before the checklist starts; card absent the instant it completes but
before its own card is dismissed — the exact collision the §5 refinement exists to
avoid; card absent with the checklist done+dismissed but no captured event, proving the
event genuinely gates the CTA rather than the checklist alone; and the showroom
suppression — card visible beforehand, hidden the moment `viewOnly` is set, back the
moment it's cleared, proving live reactivity, not a boot-time snapshot). Also: a real
click through the native-prompt CTA to an "Installed" toast; a real "Not now" click
followed by a **genuine full-document reload** (not a component remount) proving the
dismissal survives past a fresh boot, not just React state; the iOS coachmark rendering
on a simulated iOS UA and disappearing after "Got it".

**Verified by test** (`pwa/installPromptState.test.ts`, `pwa/installPrompt.test.ts`,
`utils/platform.test.ts`, `ui/pwa/PwaInstallCard.test.tsx`): the state machine's
transitions; `wireInstallPrompt`'s already-standalone / `getInstalledRelatedApps` /
idempotent-wiring / `appinstalled` paths (each with a FRESH module instance per test,
since the wiring guard and boot-time checks only ever run once per module load —
`vi.resetModules()` + dynamic re-import, mirroring the existing pattern in
`state/slices/badgesSlice.test.ts`); `promptInstall`'s accept/decline/reject/single-use
outcomes; both dismissal helpers' localStorage round-trip; `isIos`/
`isStandaloneDisplayMode` across UA/platform/media-query/legacy-flag combinations; and
the component's flag gating in both Simple and Pro, its screen-free gating (never over
walk/plan-editor/presentation), and the showroom double-gate.

Both the already-installed and standalone-suppression paths are covered at BOTH levels
deliberately: the state-machine transition itself (reading `matchMedia`/
`getInstalledRelatedApps`) is unit-tested for determinism (a real browser's actual
install status can't be forced from a headless harness), while "given the resulting
state, does the UI correctly show nothing" is what the live scenario's control arms
confirm on real rendered DOM.
