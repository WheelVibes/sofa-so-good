# Product & UX gap analysis (review brief R7-C)

Date 2026-09-25 · branch `feat/photoreal-round7` · HEAD `2f621182` (post-merge of PR #120,
`feat/photoreal-adaptive-fallback`) · **read-only pass** — no `src/` changes, no browser/Chrome
harness used (budget reserved for two other concurrent agents). Method: full `src/` feature
inventory from source + the five prior audit docs listed below (to avoid re-reporting closed
items) + external research (WebSearch/WebFetch, cited inline) into real-estate/property virtual
tours, interior configurators, and current WCAG 2.2 / PWA guidance.

## 1. Feature inventory — what a user can actually do today

**Onboarding.** Cold start shows a 3-step carousel (`src/ui/Onboarding.tsx`): welcome hero → a
4-item "quick tour" preview list → 5 start choices (guided tour, Smart Start style wizard, browse
catalog, move-in demo, start unfurnished). Persisted in `localStorage` (`hdb_onboarded`), replayable
from the Appearance popover, ⌘K, or (per the onboarding copy) "Help (?)". The guided tour itself
(`src/ui/tour/{ProductTour.tsx,tourSteps.ts}`) is a 9-step **interactive spotlight tour** — most
steps require the user to click the real, live control (`action: true`, no "Next" button), with a
parallel mobile spotlight path that opens the hamburger sheet's accordion sections first. A
**getting-started checklist** (`src/ui/OnboardingChecklist.tsx`, `onboardChecklist` flag) tracks 5
core-loop actions (furnish / finish / light / walk / share) by watching real store transitions
(not scripted steps) and shows live progress with a goal-gradient bar; dismissible, never shown
over walk HUD or the plan editor. **Smart Start** (`src/ui/wizard/SmartStartWizard.tsx`) is a
one-click "pick a style → we furnish + finish every room" wizard with 10 curated style presets, a
free-text brief parser ("calm japandi for a young couple, budget $15k"), and 4 BTO/resale intake
states (bare, OCS, as-is, stripped).

**Core loop (Simple tier — the default).** Furnish (catalog drawer: search, category tabs, filters,
compare tray, favourites, recents, room-aware/"fits" filtering), Finish (wall/floor/ceiling material
picker, eyedropper, recolour, master palette across the whole home), Light (time-of-day slider,
weather conditions, lighting-mood presets), Walk (first-person; touch joystick + drag-look on
mobile, WASD + orbit-drag on desktop; in-walk measure tool; minimap with tap-to-teleport and a
live compass/heading arrow), View (orbit / walk / top-down plan / dollhouse-style framing /
section cut / two-point-perspective toggle), Share (self-contained plan link, compact "3D link",
PDF design report, social share card in 3 aspect ratios with native `navigator.share`, PNG/GLB/USDZ
export, "View in your room" AR via USDZ Quick Look on iOS / GLB download elsewhere), Budget HUD,
accounts + cloud sync (admin-created logins only — no public signup).

**Pro tier (opt-in, `uiMode: 'pro'`).** A very large surface of professional/analytical tools:
measure & dimension chains, drawing set (elevations, sections, RCP, electrical/plumbing plans, tile
layout sheets, carpentry sheets, DXF/CAD export), design score, daylight analysis, wheelchair/
universal-design accessibility check (`AccessibilityPanel.tsx` — physical-building accessibility,
door widths + turning circles, distinct from *UI* accessibility), aircon BTU sizing/system/trunking,
floor loading & build-up, delivery access/route measurement, handover checklist, versions (save/
diff/restore with thumbnails), pinned design comments (resolve/edit/delete with confirm+undo), AI
design chat, AI photoreal render export, style quiz/style transfer, moodboard export, render/time-
of-day/scheme comparison modals, quote templates, trade packs, BOQ/CSV/shopping-list exports,
renovation budget + rules pack, a linked 360° panorama tour with hotspot navigation (cached per
design in IndexedDB) plus a slideshow "Presentation" mode that can splice in tour stops, a full GLB
furniture/model designer (parametric parts, combine, materials, save-as-template), parametric
furniture/stairs/roof, a 2D floor-plan editor (SH3D/SH3F import, scale-from-photo trace,
multi-storey).

**Governance.** ~250 entries in `src/features/flags/registry.ts`, each tagged `tier: 'simple' |
'pro'` and gated through `useFeature`/`isFeatureEnabled`; Simple mode forces every `pro` flag off
so a casual user's surface stays to the 5-item core loop above. There is **no monetisation layer**
anywhere in the codebase (no Stripe/billing/paywall references found) — Simple/Pro is a free UI-
density toggle, not a paid tier; every feature above ships to every user at no cost.

## 2. Already reported — not re-litigated here

Per the brief, these were read but are **out of scope for this pass** (rendering fidelity / perf /
already-closed UI bugs, not net-new product/UX gaps):
- `docs/audit/review-log.md` — the standing review cycle log (areas 1–5: walk photoreal, orbit/
  dollhouse, interaction sweep, mobile UI/UX, performance).
- `docs/audit/mobile-ux-2026-09-19.md` — **M1–M5 all shipped fixed in v0.35.12.0** (toast-over-
  joystick, landscape never getting mobile layout, missing 44px targets on switches/pet chips,
  onboarding-dot affordance, a clipped sub-label). **M6 remains open** (a live toast can still cover
  the landscape mobile-menu rail's lower icons) — flagged there for a maintainer product call
  already; not re-counted as a new finding here.
- `docs/audit/walk-photoreal-2026-09-19.md`, `docs/audit/orbit-dollhouse-2026-09-19.md`,
  `docs/audit/interaction-sweep-2026-09-18.md` — lighting/lightmap/mitre-seam/perf defects (W*, O*,
  S*, R* series). These are render-fidelity bugs, not product-surface gaps, and are explicitly the
  domain of the parallel graphics-arc work (`docs/open-graphics-decisions.md`).

## 3. External research (product layer, cited)

- **Matterport Showcase** — free navigation between first-person, **dollhouse** (pull-back 3D
  model, rotate/tilt/zoom) and **floor-plan** view by simply pitching the camera up/down; **guided
  Highlight Reels** ("by clicking on a Highlight, a viewer is guided directly to that part of the
  model... curated tour of the property") built from **Mattertags** (in-space pins with photo +
  description); a **MiniMap** to "track their current location". [Matterport viewing modes](https://support.matterport.com/s/article/Matterport-Viewing-Modes-3D-Dollhouse-360-and-Video) ·
  [navigation](https://support.matterport.com/s/article/Seamless-Navigation-in-Showcase) ·
  [WGAN forum, Highlight Reels + MiniMap](https://www.wegetaroundnetwork.com/topic/17477/video-new-matterport-features--mattertags--story-tours/), 2026.
- **Zillow 3D Home** — 2026 update added **click-anywhere navigation** alongside directional
  arrows specifically to "reduce the effort required to advance through a walkthrough", plus
  AI-driven image/HDR enhancement and floor-plan⇄3D-tour linking. [Zillow 3D Home guide](https://www.zillow.com/3d-home/guide/) · [HomeOptix, 2026 update](https://www.homeoptix.com/post/zillow-3d-home-tour-updates-agent-review-checklist).
- **Giraffe360** — an all-in-one capture → photos + tour + measured floor plan + dedicated property
  website from one shoot, with **lead-gating**, **restricted-area hiding**, and **analytics** on the
  tour bundled into the subscription. [Giraffe360 guided viewings](https://www.giraffe360.com/us/the-product/guided-viewings/) · [pricing](https://www.giraffe360.com/us/build-your-plan/), 2026.
- **IKEA Kreativ** — the AR room-scan onboarding is deliberately low-friction: no LiDAR required
  (falls back gracefully), ~2 minutes to scan + ~5 to process, explicit design goal that "users did
  not need expert knowledge to begin". [IXD@Pratt critique](https://www.ixd.prattsi.org/2024/02/design-critique-ikea-kreativ-ios-app/) · [Engadget](https://www.engadget.com/ikea-ar-app-lets-you-preview-its-furniture-in-your-own-house-130004284.html), 2026 reviews.
- **Roomstyler** — free, no-install web planner whose sharing model is a public **community feed**
  (follow designers, browse others' rooms) plus a simple share-by-link/image, distinct from a
  private/locked share. [Roomstyler](https://roomstyler.com/) · [intro](https://roomstyler.com/intro), 2026.
- **Paid-tier shapes in the category** (all 2026 pricing pages/analyses): **Planner 5D** — Free
  (watermarked, ~half the catalog) → Premium $59.99/yr → Professional $399.99/yr → Enterprise
  ([firstchair.app breakdown](https://www.firstchair.app/blog/planner-5d-pricing)); **Spacely AI** —
  Free (40 one-time credits) → Personal $25/mo → Studio $50/mo (1,500 credits/mo) → Agency $100/mo
  (3,500 credits/mo), unused credits roll over while subscribed
  ([spacely.ai 2026 pricing post](https://www.spacely.ai/blog/spacely-ai-subscription-plans-2026-new-pricing-explained)); **Coohom** — free entry, paid $30–69/mo bands, custom Enterprise
  ([aitoolsbakery comparison](https://aitoolsbakery.com/blog/coohom-vs-planner-5d/)). The consistent
  shape: **compute/credit-metered AI + export-resolution/watermark gates**, not feature-locking the
  whole app.
- **WCAG 2.2 §2.5.8 Target Size (Minimum, AA)** — pointer targets must be **≥24×24 CSS px** (not
  44×44; that's the AAA/"best practice" number this app already builds to under `body.mobile`).
  [W3C, via TestParty guide](https://testparty.ai/blog/wcag-target-size-guide) · [WCAG.com](https://www.wcag.com/developers/2-5-8-target-size-minimum-level-aa/), 2026.
- **WCAG 2.2 §2.3.3 Animation from Interactions (AAA)** — interaction-triggered non-essential
  animation must be disposable by the user; the two accepted techniques are **(a)** honouring OS
  `prefers-reduced-motion` or **(b)** an **in-page toggle**, because not every user who needs this
  knows how (or is permitted, e.g. shared/managed machines) to change an OS-level setting.
  [W3C Understanding doc](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), 2026.
- **PWA install UX** (web.dev, 2026) — the canonical pattern is to capture `beforeinstallprompt`,
  **defer it past a value moment** (2nd visit / completed task), and show a **custom in-app CTA**
  with the manifest's `description`/`screenshots` for context; **Safari has no
  `beforeinstallprompt`** at all and needs an explicit "Share → Add to Home Screen" coachmark
  instead. [web.dev, Installation prompt](https://web.dev/learn/pwa/installation-prompt) · [web.dev, custom install](https://web.dev/articles/customize-install), 2026.
- **VR/first-person locomotion comfort** (Meta Horizon design guidelines; VRC.org.au, 2026) —
  ship **teleport / snap-turn** as the default, leave smooth continuous movement opt-in; keep
  comfort aids (vignette, gentle acceleration) **on by default**, loosen only by explicit user
  choice. [Meta Horizon locomotion guidelines](https://developers.meta.com/horizon/design/locomotion-comfort-usability/) · [VRC.org.au 2026 mitigation review](https://vrc.org.au/blog/2026-03-29-vr-motion-sickness-mitigation/).
- **SaaS onboarding modals, 2026** — 3–5 steps is the completion-rate sweet spot; CTA wording like
  "Let's go" measurably outperforms "Next". [Kompassify, 2026 modal examples](https://kompassify.com/blog/product-tour-modal-examples).

## 4. Gap analysis

### Missing features

| ID | Sev | Today | Good looks like | Files | Size |
|---|---|---|---|---|---|
| **U1** | High | The 3D/plan share links (`copy3dLink`/`copyPlanLink`, `src/ui/ShareModal.tsx`) always hand the recipient a **fully editable copy** of the design — `encodeDesignShareCode`/`encodeDesignToCode` (`src/features/designShare.ts`, `src/features/planShare.ts`) carry no read-only/view flag, and the toast literally says "opens an **editable copy**". A spouse/family member/contractor asked to "just look" can accidentally drag furniture or repaint a wall before they've even orientated themselves. | Real-estate tour products are read-only by construction (Matterport/Zillow/Giraffe360 — a viewer looks, clicks Mattertags/hotspots, never edits the model). Add a `?mode=view` (or a distinct "showroom link") that hydrates the same store but starts in orbit/walk with editing tools hidden/disabled, with a visible "Open editable copy" escape hatch for anyone who does want to remix it. | `src/features/planShare.ts`, `src/features/designShare.ts`, `src/ui/ShareModal.tsx`, a new boot-mode check near `App`/router entry | M — new URL param + a read-only UI mode gate, no new persistence |
| **U2** | Medium | No PWA install affordance exists anywhere in `src/` — `grep -r beforeinstallprompt src/` is empty despite a real `public/manifest.webmanifest` (`display: standalone`). Chrome/Edge users get whatever the browser's own address-bar icon does (easy to miss); Safari users (no `beforeinstallprompt` at all) get **nothing** — no coachmark, no mention that "Add to Home Screen" exists. | web.dev's documented pattern: capture the event, defer past a value moment (e.g. after the getting-started checklist completes, or on a 2nd session), show a custom CTA using the manifest's own copy; ship a static Safari coachmark ("Tap Share → Add to Home Screen") gated on iOS Safari UA. | New `src/pwa/installPrompt.ts` (mirrors `swUpdate.ts`'s pattern), a toast/banner component, `OnboardingChecklist.tsx` or `AppearancePopover.tsx` as the trigger point | M |
| **U3** | Medium | The app never tells a first-time user that **nothing they do requires an account or the internet** — `accounts`/cloud-sync exists but is opt-in, and every core-loop feature (furnish/finish/walk/share via self-contained URL) works with zero backend. This is a genuine differentiator against every proprietary competitor researched (Coohom/Planner 5D/Spacely all assume an account + server round-trip) but it is never surfaced as a selling point in onboarding copy. | State it plainly in the onboarding hero or the Smart Start intro ("No sign-up — your design lives in this browser/link; sign in only if you want cloud sync across devices"). | `src/ui/Onboarding.tsx` (FEATURES copy), maybe `src/ui/wizard/SmartStartWizard.tsx` intro line | S — copy-only |
| **U4** | Medium | There is no in-app UI-accessibility settings surface at all: `AccessibilityPanel.tsx` is exclusively a **physical building** check (door widths, wheelchair turning circles) — there is no toggle for reduced motion, larger text, or high-contrast even though the app already ships 5 themes and honours `prefers-reduced-motion` everywhere in CSS/JS (`src/styles/app.css:400`, `useAmbientFx.ts`, `TierChangeVeil.tsx`, etc.). A user on a locked-down/shared machine who cannot change the OS-level media query has no way to ask the app itself to calm down. | WCAG 2.2 §2.3.3 names an **in-page toggle** as one of the two accepted techniques precisely for this reason. Ship a "Reduce motion" switch in the same Appearance popover that already hosts theme/light-dark/quality — it can just force the same code path the media query already drives. | `src/ui/toolbar/AppearancePopover.tsx`, a new store flag threaded into the existing `prefers-reduced-motion` check sites (`useAmbientFx.ts`, `useCollapseTransition.ts`, `TierChangeVeil.tsx`, `ModeSwitchCrossfade.tsx`, `useAnimatedNumber.ts`, `useFlip.ts`) | M — one flag, ~6 call sites already isolated behind small hooks |
| **U5** | Low | Walk mode has zero comfort controls — no adjustable move speed, no FOV, no "reduce head-bob/shake" toggle in `WalkHud.tsx` (only a measure toggle). The minimap's tap-to-teleport (`requestWalkTeleport`) is a good mitigation for long treks, but a user who finds the default first-person pace or camera bob uncomfortable on a phone has no in-app remedy. | VR/first-person UX guidance: keep comfort aids available and user-controllable even outside headsets — a simple "Walk speed" slider and a "reduce camera motion" switch cost little and directly serve the *"feel inside the flat"* showroom goal for sensitive users. | `src/ui/WalkHud.tsx`, `src/scene/cameras/walkCameraSettings.ts` | S–M |
| **U6** | Low | No wayfinding label equivalent to Matterport's Mattertags/Highlight Reel exists for **orbit mode** — `RoomEditorCaption.tsx` only shows a floor-area pill while *inside* the room editor; the top-down/orbit **overview** has no persistent "you're looking at: Living Room" readout, unlike the walk-mode minimap which does name the current room live. | Mirror the walk-mode minimap's live room-name readout in the orbit overview (hover/last-clicked room), closing the asymmetry between the two modes' wayfinding. | `src/ui/Minimap.tsx` (existing live-room logic to reuse), a small new overlay near `src/ui/NavCluster.tsx` | S |

### Bugs / rough edges

| ID | Sev | Today | Good looks like | Files | Size |
|---|---|---|---|---|---|
| **U7** | Medium | The onboarding carousel's step-3 choices (`Onboarding.tsx:154-203`) list **5** options with no visual hierarchy — "Take the guided tour", "Smart Start", "Browse the catalog", "Move-in demo", "Start unfurnished" are all styled as identical rows. A brand-new user has no signal about which one a first-timer should pick, and 2026 SaaS-onboarding research puts the completion-rate sweet spot at fewer, more clearly differentiated choices with a recommended path. | Mark one option (the guided tour, or Smart Start) as the recommended default with a small "Recommended" badge/visual weight bump, the way most onboarding-modal examples do. | `src/ui/Onboarding.tsx` (`.onb-choice` list), `src/styles/flows.css` | S |
| **U8** | Low | Onboarding CTA copy is generic ("Skip" / "Next" / "Get started" / "Enter sandbox") rather than benefit-oriented; 2026 modal-copy research specifically calls out CTA wording as outperforming design changes (e.g. "Let's go" beating "Next"). Very low cost, very easy to bike-shed — flagging as a one-line copy nit, not a structural gap. | Reword `Next`/`Get started` to something benefit-specific ("See how it works" / "Let's furnish it"). | `src/ui/Onboarding.tsx` | S (copy-only; genuinely optional) |
| **U9** | Low | The "Replay this tour anytime from Help (?)" line in the tour's last step (`tourSteps.ts:92`) promises a `Help (?)` entry point, but no grep hit finds a control literally labelled/aria-labelled `Help` with a `?` glyph — the actual replay paths are the Appearance popover and ⌘K (confirmed working), so the copy over-promises a specific UI location that may not exist verbatim. Low-confidence — could not verify via a live click (no browser session available this pass); worth a 30-second check before dismissing. | If there truly is no `?`-badged Help affordance, either add one or fix the copy to name the real location ("Appearance menu" / "⌘K"). | `src/ui/tour/tourSteps.ts:92`, `src/ui/toolbar/AppearancePopover.tsx` | S (verify, then copy or UI fix) |

## 5. Top 5 — ranked, with an actionable brief each

Ranked by "moves the needle on *feels like a professional app people would pay for*" ÷ effort,
per the owner's bar (`sofa-photoreal-goal.md`: HD virtual showroom, prefer visible shipped change).

### 1. U1 — Read-only "showroom" share links

**Why #1.** This is the single highest-leverage change against the user's own stated goal — an
"HD virtual showroom where the user feels inside the flat" implies *showing* it to someone, and
every real-estate-tour competitor researched is read-only-by-default for exactly that reason. Today
every share surface hands out an editable copy — the opposite of a showroom.
**Brief.** Add a `viewOnly?: boolean` flag to the encoded share payload in `src/features/
designShare.ts`/`planShare.ts` (bump the schema version, default `false` for backward compat with
existing links). In `ShareModal.tsx`, add a "Showroom link (view only)" option alongside the
existing "3D link"/"Plan link" buttons, using the same encode path with the flag set. On load,
gate the app shell (wherever the design-share code is currently decoded and hydrated into the
store — trace `buildPlanShareUrl`/`decodeDesignShareCode`'s consumer) so `viewOnly` disables the
catalog drawer, finish picker, inspector edits, and floor-plan editor entry points, while leaving
orbit/walk/Share-again and an "Open an editable copy" button (which just re-shares the same payload
with `viewOnly: false`) fully live. Ship behind a new `viewOnlyShare` flag, `tier: 'simple'`
(default true — every user benefits).

### 2. U4 — In-app "Reduce motion" toggle

**Why #2.** Cheap, mechanical, and closes a real WCAG 2.2 gap on an app that has clearly already
invested heavily in respecting `prefers-reduced-motion` everywhere — the missing piece is just
exposing it as a first-class in-app control instead of an invisible OS dependency, which also
happens to be the kind of polish a paying/professional user notices.
**Brief.** Add a `reduceMotion: 'system' | 'on' | 'off'` field to the appearance slice (defaulting
to `'system'`). Every existing `window.matchMedia('(prefers-reduced-motion: reduce)').matches` call
site (`src/ui/useAmbientFx.ts:19`, `useCollapseTransition.ts:6`, `loading/useCyclingPhrase.ts:16`,
`loading/TierChangeVeil.tsx:8`, `loading/ModeSwitchCrossfade.tsx:9`, `loading/
startBootPhraseRotator.ts:38`, `controls/useAnimatedNumber.ts:26`, `controls/useFlip.ts:31`) should
route through one small helper (`shouldReduceMotion()` in a new `src/ui/motionPreference.ts`) that
ORs the OS query with the store override. Surface the 3-way switch in
`src/ui/toolbar/AppearancePopover.tsx` next to the existing theme/light-dark controls. Unit-test
the helper directly rather than re-testing every call site.

### 3. U2 — Custom PWA install CTA (+ Safari coachmark)

**Why #3.** The manifest and service-worker update machinery already exist (`public/
manifest.webmanifest`, `src/pwa/swUpdate.ts`) — this is "finish what's already 90% built," and an
installed, full-screen PWA is a meaningful step toward "feels like a professional app," especially
for a returning user who wants the flat plan one tap away.
**Brief.** New `src/pwa/installPrompt.ts` mirroring `swUpdate.ts`'s state-machine style: listen for
`beforeinstallprompt` on boot, `preventDefault()` + stash the event, expose `getInstallState()`/
`promptInstall()`. Trigger the custom CTA (a dismissible banner, reusing the existing toast/banner
CSS vocabulary) once a value moment fires — reuse `OnboardingChecklist`'s "all done" signal
(`checklistDone.length === total`) as the trigger, per web.dev's "after a completed task" guidance.
Persist a "don't ask again" dismissal in `localStorage` (mirror `hdb_onboarded`'s pattern). Add an
iOS-Safari branch (UA-sniff, same `isIos()` helper already in `src/ui/viewInAr.ts`) that shows a
static "Tap Share → Add to Home Screen" coachmark instead, since Safari never fires
`beforeinstallprompt`. Gate the whole thing behind a new `pwaInstallPrompt` flag, `tier: 'simple'`.

### 4. U6 — Live room-name readout in orbit mode

**Why #4.** Small, cheap, and closes an asymmetry the app itself already solved once (walk mode's
minimap already computes "which room is the camera in, live" — `Minimap.tsx`'s room-highlight
logic). Reusing that logic in the orbit overview is mostly plumbing, and it's exactly the kind of
"you always know where you are" affordance that made Matterport/Zillow's minimap and floor-plan
linkage stand out in the research above.
**Brief.** Extract the "which room contains point P" lookup `Minimap.tsx` already has (it
highlights/names the room the walk camera is standing in) into a small shared helper if it isn't
already pure (check `pointInRoom` usage in `src/floorplan/types.ts` — likely already reusable
as-is). In orbit mode, drive the same lookup off the last-clicked/hovered room (the room editor
already knows which room is active) and render a small persistent label near `NavCluster.tsx` or
as a lightweight addition to the existing `RoomEditorCaption.tsx` (which currently only fires
inside the room editor, not the overview). Keep it a pure DOM overlay like the existing caption —
no new store field required if the room editor's own `roomId` state already carries this.

### 5. U3 — Surface the "no account, no server" story in onboarding

**Why #5.** Zero engineering risk, one paragraph of copy, and it directly counters the one
structural disadvantage the paid-tier research surfaced: every competitor with a subscription
(Planner 5D, Spacely, Coohom) requires an account and a server round-trip; this app's local-first,
link-shareable design is a genuine and currently-invisible differentiator.
**Brief.** Add one line to the onboarding hero (`Onboarding.tsx`'s `FEATURES`/lede copy) and/or the
Smart Start wizard's intro paragraph, stating plainly that the design lives in the browser/share
link and no sign-up is required, with sign-in framed as strictly optional (cloud sync across
devices). Cross-check the exact current account-gating copy in `AiPhotorealSection.tsx`/
`LoginScreen.tsx` before wording this so the two messages don't contradict (e.g. if AI photoreal
genuinely needs a backend call, say so precisely rather than overclaiming "everything is local").

## 6. Not investigated this pass (flagging, not deciding)

- **U9** (Help `?` affordance existence) could not be confirmed live — no browser session was used
  per the brief's constraint. A quick Chrome-audit check by whichever agent next has browser budget
  would settle it in under a minute.
- Whether `pointInRoom`/room-lookup in `Minimap.tsx` is already framework-agnostic enough to reuse
  for U6 without refactor was not fully traced line-by-line; the implementing agent should confirm
  before committing to the "no new store field" claim in that brief.
- No monetisation/pricing-tier design is proposed here even though §4's research turned up a
  consistent competitor shape (credit-metered AI + export-resolution gates) — that is a business
  decision, not a UX gap, and is called out only as context for why "worth paying for" currently has
  no literal answer in this codebase.
