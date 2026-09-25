# Visual verification — round 7's four new UI features (brief R7-G)

Date 2026-09-25 · HEAD `10c6b4ec` (v0.35.12.7, branch `feat/photoreal-round7`) ·
**review only, no `src/` changes** · artefacts under `/tmp/r7g/` (screenshots
`/tmp/r7g/shots/*.png`, probe JSON `/tmp/r7g/results{2,3,4}.json`, console logs
`/tmp/r7g/console*.log`, one-off drivers `/tmp/r7g/verify{,2,3,4}.mjs` — not committed, per
the convention in `docs/audit/mobile-ux-2026-09-19.md`).

## Method

One Puppeteer browser instance per pass, four sequential passes, ANGLE `metal` on the real GPU
(`--use-angle=metal --enable-gpu`), timezone `Asia/Singapore`, dev server on **:5241** (a
non-default port; :5200 and :5211 were both already held by other agents). The machine-wide
`sofa-shot-harness.lock` that `scripts/shot.mjs` takes was honoured by every pass, and the
top-level Chrome process count was polled down to ≤ 1 before each launch.

Hygiene, per the brief and `docs/visual-verification-playbook.md`:

- **Clock pinned** for every 3D frame: `setManualHour(13)` (or an explicitly stated `20` for the
  night comparison), `setWeather('clear')` unless stated.
- **Device class pinned and the setter stubbed** (`setDeviceClass('capable')` then
  `setState({ setDeviceClass: () => {} })`) plus `interactiveDegrade` off — the adaptive ladder
  demotes headless runs within seconds otherwise.
- **Every camera view has an explicit pose.** Orbit comparisons drive the app's own
  `focusOn([x, z])` onto a computed room centroid, or `requestHomeView()` for the hero frames.
  (The first orbit attempt used a non-existent `setOrbitTarget`; the pill probe below is from the
  corrected pass. `focusOn` dollies to ≤ 4.5 m at y = 0.6, which can land the camera *inside* a
  wall — the featureless frames `51`/`54`/`55` are that artefact, not a render bug.)
- **No stale reference images**: every comparison below is an in-session control captured in the
  same pass (e.g. "veil under Reduce" vs "veil under Full" are two states of one page).
- Hash routes are always entered via a **real document load** (`about:blank` → target), because
  puppeteer's `goto` to a URL that differs only in its hash is a same-document navigation and the
  route is only read at boot — see V12.

Viewports: **desktop 1400 × 900** (`isMobile: false`) and **phone 390 × 844** with
`isMobile + hasTouch` (so `body.mobile` and `pointer: coarse` both apply).

No `pageerror` fired in any pass.

---

## Verdict table

| # | Item | Desktop 1400×900 | Phone 390×844 | Findings |
|---|---|---|---|---|
| 1 | Showroom links (v0.35.12.5) | **PASS** | **PASS** | V5, V6, V8 |
| 2 | Reduce-motion toggle (v0.35.12.4) | **PASS** | **PASS** | V11 |
| 3 | Orbit room-name pill (v0.35.12.6) | **PASS** (functional) | **n/a — absent by design** | V1, V2, V3, **V4** |
| 4 | Onboarding local-first line (v0.35.12.7) | **PASS** | **PASS** | V7 |
| 5 | U9 — does "Help (?)" exist? | **NO — the tour copy is wrong** | **NO** | V13 |

Cross-cutting: V9 (phone boot pose), V10 (no interaction-test ladders), V12 (in-session hash
navigation does not enter showroom mode).

---

## 1 · Showroom links (v0.35.12.5) — PASS

Generated through the real UI: Share modal → **Copy showroom link** (clipboard intercepted via
`evaluateOnNewDocument`, the button itself was clicked). Produced
`http://localhost:5241/#/showroom/<code>`, 5413 chars. The 3D link from the same modal is
`#/design/<code>`, 5393 chars — a 20-char delta, consistent with the envelope key.

**Editing affordances are genuinely gone** (`/tmp/r7g/results2.json` → `showroom`):

| Probe | Showroom session | Normal `#/design/` session |
|---|---|---|
| `viewOnly` | `true` | `false` |
| Feature flags on / off | **88 / 187** | **145 / 130** |
| Desktop toolbar menus | `View · Scene · File` | `View · Scene · Edit · Arrange · File` |
| Mobile rail sections | 4 (View, Scene, File, Appearance) | 6 (adds Edit, Arrange) |
| `enterRoomEditor('living')` | refused → `{active:false, roomId:null}` | opens → `{active:true, roomId:'living'}` |
| `setFloorPlanEditing(true)` | refused → `false` | n/a |
| `.showroom-badge` present | yes | no |
| Getting-started checklist | withheld | present |
| Catalog / inspector / gizmo in DOM | none | — |
| `floorPlanEditor` flag | `false` | `true` |

Screenshots: `33-showroom-desktop.png`, `35-showroom-after-reload.png`,
`51-showroom-desktop-clean.png`, `60-showroom-hero-home-day.png`,
`37-normal-design-link.png` (regression control), `57-phone-showroom-menu.png` (trimmed rail),
`58-phone-normal-menu.png`.

**Everything a visitor should keep, works** (`results2.json → showroom.ctrl`, shots
`53`, `54`, `61`, `62`): orbit ✓, walk (`cameraMode: 'firstPerson'`, minimap present, WASD hint
bar rendered) ✓, camera framing (`requestHomeView`) ✓, time-of-day (hour 13 → 20, visibly night
in `61`) ✓, weather (`rain`) ✓, room/ceiling lights (the in-walk `E Turn off ceiling light`
prompt is live in `53`) ✓, quality tiers (`performance → realistic` applied and visibly
different — softer shadows, richer glazing in `62`) ✓.

**Render is full quality**: canvas `1400 × 900` backing store at `devicePixelRatio 1`, no
resolution downgrade, `deviceClass: capable`, `realistic` tier accepted. Nothing in the
view-only path touches the renderer.

**Hash survives a reload** ✓ — after `page.reload()` the hash is still `#/showroom/7VzbbuNG…`,
`viewOnly` is still `true`, the badge is still mounted and the toolbar is still trimmed.

**"Showroom" card + "Make it mine"** ✓ — bottom-left `aside.showroom-badge`, 236 × 144 at
(12, 736) desktop and (12, 680) phone, eye icon + **Showroom** + the reassurance line + the
button. Clicking it (shot `55`, `36`): `viewOnly → false`, hash cleared to `""`, flags back to
145 on, `Edit`/`Arrange` return to the toolbar, `enterRoomEditor` now opens, the getting-started
checklist reappears, and the success toast "This design is yours now — Every tool is unlocked.
The original showroom link is unchanged." renders. Exactly as documented.

**Regression — a normal share link is still fully editable** ✓ (shot `37`): 145 flags on, no
badge, all five menus, `enterRoomEditor` opens, `setSelectedId` sticks. Byte-identical behaviour
to a pre-round-7 link.

## 2 · Reduce-motion toggle (v0.35.12.4) — PASS

Present in the Appearance popover under a **MOTION** label, styled as the same `.seg accent`
segmented control as APPEARANCE and INTERFACE (shot `03-appearance-popover-reducemotion-desktop.png`).
Three buttons — `System` / `Reduce` / `Full`, 80 × 27 desktop, **95 × 44 phone** (meets the 44 px
tap target rule), with the live caption underneath ("Follows your device's reduce-motion
setting." / "Animations and transitions are minimised everywhere in the app." / "Animations play
in full, even if your device asks to reduce motion."). Present and correct on the phone
Appearance sheet too (shot `41-phone-appearance-reducemotion.png`).

**Persists across reload** ✓ — clicking `Reduce` writes
`hdb_appearance = {"theme":"clay","modePref":"light","reduceMotion":"on"}` and the store still
reads `'on'` after a full reload.

**Suppression, measured in-session** (`/tmp/r7g/results4.json`):

| Animation | `reduceMotion: 'on'` | `reduceMotion: 'off'` (Full) |
|---|---|---|
| Tier-change veil (`.tier-veil-bar-fill`) | **absent** | **present** |
| Mode-switch crossfade (`modeTransition.active`) | **`false`** | **`true`** |
| Boot-phrase rotation | 1 phrase observed | 1 phrase observed — **inconclusive** |
| `useAnimatedNumber` / `useFlip` | not exercised | not exercised |

The veil and the crossfade are hard evidence. The boot-phrase rotator could not be separated: the
dev-server boot completes before the rotator advances, so both arms showed the single phrase
"Almost ready…". The number/flip animations were not reachable without an editing surface. Both
route through the same `shouldReduceMotion()` helper as the two that were proved (verified by
reading `src/ui/motionPreference.ts` and the nine call sites the commit lists), and both have
unit coverage — so **code-path confirmed, not eye-confirmed**.

**"Full" overrides an OS reduce preference** ✓ — with CDP `emulateMediaFeatures`
`prefers-reduced-motion: reduce` (page-side `matchMedia(...).matches === true`) and the in-app
control on `Full`, a tier change still renders the veil. The inverse also holds: with the OS at
`no-preference` and the control on `Reduce`, the veil is suppressed. The override is symmetric,
as the commit message claims.

## 3 · Orbit room-name pill (v0.35.12.6) — PASS on desktop; absent on phone

Driven by `focusOn([cx, cz])` onto each room's computed centroid, 2.2 s settle per move
(shots `30-pill-*.png`):

| Focus target | Pill text | Correct? |
|---|---|---|
| Main Bedroom (1.8, 2.0) | `Main Bedroom` | ✓ |
| Bedroom 2 (4.8, 2.0) | `Bedroom 2` | ✓ |
| Bath/WC 1 (2.7, 5.8) | `Bath/WC 1` | ✓ |
| Kitchen (8.0, 8.0) | `Kitchen` | ✓ |
| Service Yard (5.4, 8.0) | `Service Yard` | ✓ |
| Living / Dining (10.8, 4.1) | `Living / Dining` | ✓ |
| (−40, −40), outside the plan | `""`, `opacity: 0`, `.visible` removed | ✓ |

It updates live as the target moves, names the right room every time, fades rather than pops, and
**disappears outside orbit**: switching to `firstPerson` removes `.orbit-room-readout` from the
DOM entirely and the minimap takes its slot (shot `32-walk-mode-no-pill.png`). Geometry: 31 px
tall, right-aligned to the zoom rail at (1250–1287, 858), i.e. flush under the nav cluster —
no collision with the compass/zoom rail or the bottom-left cards.

**On the phone it does not render** — confirmed: `.orbit-room-readout` is in the DOM but
`.navcluster` has `display: none` under `body.mobile`, so its measured width is 0 (shot
`42-phone-orbit.png`). That matches the commit's stated reasoning. **Judgement: this is a gap,
not a product call — see V4.**

## 4 · Onboarding local-first line (v0.35.12.7) — PASS

Renders on step 0, below the three-up feature grid, above the Skip / Get-started footer
(shots `01-onboarding-step0-desktop.png`, `40-onboarding-phone.png`):

> No account needed to start — your design lives in this browser and a link shares the whole
> thing. Sign in only if you want it to sync across devices.

| | Desktop 1400×900 | Phone 390×844 |
|---|---|---|
| `.onb-note` rect | 264 × 45 (3 lines) | 264 × 45 at (63, 530), 3 lines |
| `font-size` | 10 px (`--t-2xs`) | 10 px — vs 14 px for `.onb-lede` |
| `color` | `oklch(0.62 0.018 58)` (`--text-3`) | same |
| `scrollHeight > clientHeight`? | no | **no — not clipped** |
| Overflows the viewport? | no | **no** (bottom 575 of 844) |
| Card scrollable / layout broken? | no (`scrollH 452` = `clientH 452`) | no |

No clipping, no overflow, no layout break, wording matches the commit. Legibility is the one
complaint — see V7.

## 5 · Open question U9 — "Help (?)" does **not** exist

`tourSteps.ts:92` tells the user *"Replay this tour anytime from Help (?)."* Verified live in the
running app, both viewports:

- A DOM sweep over every `button`, `a`, `[role=button]`, `[role=menuitem]` and `[aria-label]`
  for `/\bhelp\b/i` in the text, `aria-label` or `title`, or a literal `?` as the whole label —
  run on the idle app **and again after programmatically opening every top-level toolbar menu** —
  returned **zero hits** (`/tmp/r7g/u9-help-hunt.json`, `results2.json → u9`).
- What actually exists (shot `03`): a **section heading** `HELP` *inside* the Appearance
  popover — a `div.pop-label`, not a control — above `User guide ↗`, `Replay guided tour` and
  `Asset credits`. The popover's trigger is an unlabelled palette/paint icon at the right end of
  the toolbar. There is no `?` glyph anywhere in that path.
- On the phone the Appearance sheet does **not** carry that HELP block at all (shot `41` ends at
  `Asset credits`); tour replay lives in the mobile rail's separate "Appearance & help" section.
- The only `?` in the codebase is `hint: '?'` on the ⌘K **"Keyboard shortcuts"** command
  (`CommandPalette.tsx:681`) — a keyboard hint, not a button — and that command is gated on
  `shortcutsHelp`, a **`pro`-tier flag, forced off in the default Simple mode**. So in the app as
  a new user first sees it, there is neither a `?` button nor a working `?` key.

**Answer: no such affordance exists.** The audit's low-confidence U9 is upgraded to confirmed.
Filed as V13.

---

## New findings

### V1 · The orbit pill is near-illegible over mid-to-dark 3D content — *medium*

`.orbit-room-readout` (`src/styles/parts.css:674`) is `color: var(--text-2)` on
`background: color-mix(in oklab, var(--surface) 55%, transparent)`. Every other chrome element in
that corner — the zoom rail, the compass, the minimap, the showroom card — uses a solid or
near-solid `--surface`. At 55 % over the kitchen's dark floor the label all but vanishes (crop
`/tmp/r7g/shots/crop-30-pill-kitchen.png`, compare `crop-30-pill-living-dining.png` over a light
wall). At 11 px / weight 700 there is no size budget to absorb that. Raising the mix to match the
adjacent zoom rail, or adding a text shadow, would fix it without changing the design language.

### V2 · The pill is `aria-hidden="true"` with no live region — *medium*

`OrbitRoomReadout.tsx:63` sets `aria-hidden="true"` on the wrapper. The one piece of live spatial
orientation orbit mode has is therefore invisible to assistive tech. That is a striking
inconsistency inside a round whose other headline feature (U4) shipped *specifically* for WCAG
2.2 SC 2.3.3. An `aria-live="polite"` region (the room only changes on a real transition, so it
would not chatter) would cost nothing.

### V3 · The pill over-claims at wide framing — *low*

At the default whole-flat overview the target lands in the corridor and the pill reads
`Corridor` while the frame shows the entire flat plus two neighbouring blocks (shots
`60-showroom-hero-home-day.png`, `02-app-desktop-baseline.png`). Naming one 1.2 m-wide room while
the user is looking at the whole estate is worse than saying nothing. A camera-to-target distance
threshold (hide above ~15 m, say) would keep it honest.

### V4 · The pill's phone absence is a gap, not a product call — *medium* (the brief's judgement call)

The commit is right that hiding follows automatically from `.navcluster { display: none }` under
`body.mobile` — but that is *inheritance*, not a decision, and it lands the wrong way round:

- The phone is precisely where orientation is hardest. Less screen, no hover, no minimap in
  orbit, a camera the user is flinging around with a thumb.
- Walk mode on the phone **keeps** its minimap — so the phone already accepts a live
  "where am I" readout in the other camera mode. Orbit gets nothing.
- The reasons the nav cluster is hidden on phones (compass, zoom buttons, save-view — all
  redundant next to pinch/drag gestures) do not apply to a 31 px non-interactive label. The pill
  is `pointer-events: none`; it cannot steal a gesture.
- It matters more now than it did last week: **showroom links are the round's flagship feature,
  and a shared tour link is overwhelmingly going to be opened on a phone.** The one label that
  tells a visitor which room they are looking at is the one thing the phone build drops.

Recommendation: mount it independently of `.navcluster` on mobile — top-centre under the header,
or bottom-centre above the safe-area inset — rather than letting it inherit the cluster's
absence. Worth a product call rather than a silent inheritance either way.

### V5 · The "Where are you?" location prompt fires on first paint of a showroom link — *high*

Confirmed twice, both viewports (shots `50-showroom-desktop-first-paint.png`,
`43-phone-showroom.png`; probe `results3.json → promptInShowroom = {locationPrompt: true,
viewOnly: true}`). A visitor who clicks someone else's tour link is met, before seeing anything,
by a full-screen modal asking for their geolocation in order to position the sun in a design they
do not own and cannot edit. On the phone it covers 75 % of the viewport. Every real-estate
virtual tour the U1 research cites opens straight into the scene. The sender's own latitude
already travelled in the link; the prompt should be suppressed (or at least deferred behind the
first interaction) while `viewOnly` is set.

### V6 · Walk-mode hint copy leaks editing language into the showroom — *low*

Entering walk mode in a showroom session raises: *"Walking through — Move around to see your home
at eye level. **Leave walk mode to keep editing.**"* (shot `53-showroom-walk-desktop.png`). There
is no editing to return to, and it is not "your" home. Two of the round's four chokepoints were
about not implying editability; this string undoes a little of that.

### V7 · The onboarding local-first caption fails contrast — *medium*

10 px at `--text-3` = `oklch(0.62 0.018 58)` on a white card is roughly **3.1 : 1**, below the
WCAG AA 4.5 : 1 floor for small text, and it is the smallest type in the dialog (the lede above it
is 14 px). It renders and wraps correctly on both viewports — the problem is purely that the one
line carrying the product's strongest differentiator is the least readable thing on the screen.
`--text-2` at 11 px would still read as a quiet footnote.

### V8 · The showroom card's copy is faint and its CTA is the quietest element in it — *medium*

Same `--text-3` at 11 px for the three-line reassurance (shot `60`, bottom-left), and
**"Make it mine" is a `btn-soft`** while the Share modal's own showroom button is `btn-accent`.
The single conversion action in the whole view-only experience — the thing that turns a visitor
into a user — is styled as the least important control on its own card. The card also ends on a
two-word orphan line ("left it."). Worth a second look at emphasis and at trimming the copy by
one clause.

### V9 · The phone's default boot camera shows a black void — *medium, pre-existing, now a first impression*

At 390 × 844 the default orbit pose frames the block from below, and the flat's interior renders
as an almost entirely black mass with only the grass strip and trees lit (shots
`42-phone-orbit.png` and `56-phone-showroom-clean.png`, both at pinned hour 13). A single
`requestHomeView()` fixes it completely (shot `63-phone-showroom-hero.png` — the same session,
same clock, a clean dollhouse view). Desktop's default pose is already the good one (shot `02`).
This predates round 7, but showroom links make it the **first frame a shared-tour visitor sees on
a phone**, which is the worst possible place for it. Reported, not fixed, per the brief.

### V10 · None of the four features shipped an interaction-test ladder — *medium, process*

`CLAUDE.md` is explicit: *"No new feature ships without its own ladder … Build the scenarios
alongside the feature and run them as part of visual verification."* `git show --name-only` on all
four commits touches zero files under `scripts/scenarios/`, and there is no
`*showroom*`, `*reduce-motion*`, `*orbit-readout*` or `*onboarding-local-first*` scenario in the
565-file directory. Every check in this document had to be written from scratch as a throwaway
driver. At minimum the simple rungs (`showroom-simple.json` covering the four chokepoints,
`reduce-motion-simple.json` covering the tri-state + persistence) should land before the PR.

### V11 · "Motion" is not searchable, and Help lives in two different places per platform — *low*

The desktop popover heading is **MOTION**, so the words a user actually looks for — "reduce
motion" — appear nowhere as a label (only inside the caption prose). And the desktop popover's
HELP block (User guide / Replay guided tour / Asset credits) is split on mobile: the sheet keeps
only `Asset credits`, while the tour replay sits in the rail's "Appearance & help" section. Same
two functions, two different homes.

### V12 · An in-session hash change does not enter showroom mode — *low*

Navigating an already-booted tab to `#/showroom/<code>` (a same-document hash change) leaves
`viewOnly: false`, all 145 flags on and the design fully editable; only a real document load
applies the capability. This is how I first mis-measured item 1, and it is a genuine, if narrow,
edge: a showroom link followed from inside the app, or pasted into the address bar of an open
tab, silently opens editable. The route is read at boot only. Given U1's own reasoning about
"invisible capability escalation" being the failure mode worth designing against, a
`hashchange` listener that re-reads the route (or forces a reload) is worth considering.

### V13 · The tour promises a "Help (?)" that does not exist — *low, but it is a lie in shipped copy*

Detail in §5 above. Either add a `?`-badged Help control (the Appearance popover's HELP section
is already the right content, it just has no discoverable entry point), or change
`tourSteps.ts:92` to name the real location — "from the Appearance menu, or ⌘K". Note that "⌘K"
alone is not a safe substitute in the copy: the palette's `?`-hinted Keyboard-shortcuts entry is
`pro`-tier and invisible in the default Simple mode.

---

## Ranked — what still looks unpolished

1. **V5** — geolocation modal ambushing every showroom visitor before the first frame.
2. **V9** — the phone's first frame is a black void until something calls `requestHomeView`.
3. **V4** — orbit's room readout dropped on the exact platform where shared tours get opened.
4. **V1** — the pill's 55 %-transparent surface loses the label over dark floors.
5. **V8** — the showroom card's faint copy and under-emphasised "Make it mine".
6. **V7** — the local-first caption, the round's best sentence, set below AA contrast at 10 px.
7. **V2** — `aria-hidden` on the only live orientation cue, in the accessibility round.
8. **V10** — four features, zero scenario ladders.
9. **V3** — the pill naming one room while the frame holds the whole estate.
10. **V13** / **V6** / **V11** — copy that names a non-existent control, offers editing inside a
    showroom, and hides "reduce motion" under a heading that does not say it.
11. **V12** — in-session hash navigation opening a showroom link editable.
