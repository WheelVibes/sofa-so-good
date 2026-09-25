# Showroom (view-only) share links

Brief **R7-D / U1** — from the product audit `docs/audit/product-ux-2026-09-25.md` §5.1, which
ranked this the highest-leverage product gap: every share surface handed out a fully **editable**
copy of the design, "the opposite of a showroom", while every real-estate virtual tour the audit
researched is read-only by construction.

Ships behind the `viewOnlyShare` flag (`tier: 'simple'`, `default: true`).

---

## 1. The honest framing, first

**A showroom link is a UX capability, not a security boundary.** The whole design travels in the
URL fragment with no server in the loop, so the visitor's browser necessarily holds everything
needed to edit it. Nothing here is tamper-proof and nothing pretends to be:

- OWASP's position is unambiguous — client-side validation/authorisation "should be treated as a
  usability feature, not a security control", and ASVS 4.1.1 requires access-control rules on a
  *trusted service layer* "especially if client-side access control is present and could be
  bypassed". This app has no such layer by design (local-first, no account required), so a
  client-side flag is the ceiling of what is achievable, and the UI says as much rather than
  implying a lock. ([OWASP Cornucopia — Frontend](https://cornucopia.owasp.org/edition/companion/FRE2/1.0/en),
  [The Client-Side Security Trap](https://www.secureideas.com/blog/warning-for-developers))
- What the flag genuinely buys is the **default experience** and the **sender's stated intent** —
  which is exactly the product shape competitors ship. Figma's "can view" permission still lets a
  viewer *Duplicate to your drafts* by default; restricting that is a paid-plan setting, not a
  property of the link.
  ([Figma community discussion](https://forum.figma.com/t/launched-allow-file-owner-to-restrict-viewers-from-downloading-or-copying-files/53702/6))
- We go further than Figma's default and make taking a copy an **explicit, offered** action
  ("Make it mine"), because hiding it would be dishonest about what the visitor already has.

### Prior art the design follows

- **URL fragment as the carrier.** Excalidraw's share links keep the payload after the `#`, which
  browsers never send to the server — the same property this app's `#/plans/` and `#/design/`
  routes already relied on. Excalidraw also **keeps the share hash in the URL for the lifetime of
  the page so every reload re-recognises the shared snapshot and re-enforces read-only**; the
  showroom loader copies that behaviour (see §4).
  ([Excalidraw — End-to-end encryption in the browser](https://plus.excalidraw.com/blog/end-to-end-encryption),
  [read-only share discussion](https://github.com/excalidraw/excalidraw/issues/2832))
- **Read-only means "the tour still works", not "the app is greyed out".** Matterport / Zillow 3D
  Home tours are view-only by construction yet keep full navigation, and Zillow's are explicitly
  built to be shared, embedded and passed on. So the showroom keeps orbit, walk, the camera,
  quality tiers, lights, time of day, weather — and re-sharing.
  ([Zillow 3D Home vs Matterport](https://www.lens-collective.com/blog/2024/12/8/zillow-vs-matterport-3d-virtual-tours))

---

## 2. Schema change — an envelope key, versioned compatibly

`src/features/designShare.ts`:

```ts
export type DesignSharePayload = SerializedState & { viewOnly?: true }
```

`viewOnly` is an **envelope** key that deliberately sits *outside* `SerializedStateZ`. A capability
is a property of the *link*, not of the design.

Three consequences, all of them the point:

1. **It can never reach a save.** Zod objects strip unknown keys, so the design returned by
   `decodeDesignShareCode` is byte-for-byte what it always was — the flag cannot leak into the
   autosave, a save slot or a `.sofa.json` export. `designFromRaw` was split out of
   `planShare.ts:decodeCodeToDesign` so the envelope can be read off the raw payload *before*
   validation, without inflating the code twice.
2. **No schema version bump was needed.** The key is omitted entirely when false, so an editable
   link's bytes are identical to the ones this app has always produced — asserted in the tests,
   modulo `serialize()`'s millisecond `savedAt` stamp, which is normalised before the compare
   (two payloads built a tick apart legitimately differ there, and that predates this change).
3. **Old links keep working.** A pre-showroom code simply has no key; `readViewOnly` returns
   `false`. Only a literal `true` counts — `1` / `"yes"` / `{}` are not the contract.

### Forward compatibility: the second route

The awkward direction is a **new** link opened by an **old** build. An old build knows nothing
about the envelope key and zod strips it, so a `#/design/` code carrying `viewOnly: true` would
open as a fully editable copy — silently the opposite of what the sender chose.

So a showroom link ships on its own route, `#/showroom/<code>`, which matches neither route an
older build knows. The failure mode becomes "the link doesn't open" (visible, recoverable) rather
than "the link opens editable" (invisible capability escalation). The cost is stated plainly: a
build older than this one cannot open a showroom link at all.

The two signals are **ORed**, so neither can be dropped by accident:

| Route | Payload flag | Result |
|---|---|---|
| `#/design/` | absent | editable (today's behaviour, unchanged) |
| `#/design/` | `true` | **view-only** — a hand-edited route can't downgrade the link |
| `#/showroom/` | `true` | view-only (what the app emits) |
| `#/showroom/` | absent | **view-only** — the route alone is enough |

---

## 3. Where it is gated — four chokepoints, not four hundred

The app has ~278 feature flags and a large Pro surface. Rather than touch hundreds of components,
`viewOnly` is applied where the app *already* decides what a session may do.

| # | Chokepoint | Covers |
|---|---|---|
| 1 | `src/state/editing.ts` → `canEditScene` | Every 3D selection, drag, rotate/resize/tilt gizmo, marquee, hover highlight, context menu, placement ghost, floor/wall click-to-select (→ the Finish picker and Wall-accent picker), most editor hotkeys, `⌘A`, the nudge keys. ~25 call sites, all inherited. `src/state/CLAUDE.md` already names it "the single gate for all scene editing". |
| 2 | `uiSlice.enterRoomEditor` | The room editor **is** the editing mode, so refusing entry closes the Catalog drawer, the Inspector, the multi-select panel and the whole desktop/mobile edit toolbar cluster at once (they all mount on `roomEditorActive`). |
| 3 | `floorPlanSlice.setFloorPlanEditing` | The 2D plan editor — a second editing app with its own toolbar, `P` hotkey, context menu and plan inspector — refused at the store rather than at its six entry points. Leaving is always allowed, so no state can trap a session inside it. |
| 4 | `resolveFlags(..., viewOnly)` + `flags/viewOnly.ts` | 115 authoring feature flags (of 278) forced off, so their menu rows, ⌘K commands, panels and hotkeys disappear through the gates that already exist. Orthogonal to Simple/Pro and, like the Simple branch, it wins over any dev/admin override. |

Plus four small, explicit UI trims that sit outside all four:

- `Toolbar.tsx` / `MobileToolbar.tsx` — drop the **Edit** and **Arrange** menus (desktop) and the
  `edit-home` / `arrange` rail entries + sections (mobile). **Tools stays** (measure, checks,
  daylight are analysis a visitor may run), and so do View, Scene, Lights, Graphics, Appearance
  and File.
- `FileMenu.tsx` / `mobile/FileSection.tsx` — drop the whole **Load & reset** group (imports, new
  / reset apartment, restore demo furniture, clear furniture, the saved-layout list). **Save…**
  stays: saving the showroom into your own slot is a way of *keeping* it, not of editing it.
- `CommandPalette.tsx` — the `Selection` and `Add furniture` groups wholesale, plus the four
  mutating commands with no flag of their own (`catalog`, `edit-room`, `tidy`, `clear-furniture`).
- `useAppHotkeys.ts` — undo/redo, the one editing pair deliberately living *outside* `canEditScene`
  (they span all three editing surfaces), so they need their own check.

### Why a denylist and not an allowlist

`VIEW_ONLY_BLOCKED_FLAGS` (115 entries — grown by one since this doc was written, as PWA-INSTALL added `pwaInstallPrompt`) enumerates the authoring surfaces. The inverse was considered and
rejected: roughly half the registry gates *rendering fidelity* (baked GI, daylight curve, weather,
window blow-out, wall reveal, PBR surfaces…), so the safe failure mode is **"a flag nobody
classified stays ON"**. An allowlist would silently degrade the render the first time someone adds
a lighting flag and forgets this file; a denylist leaves one editing button visible instead, which
is cosmetic and caught in review.

**The cost, stated plainly: the list is enumerated, not derived.** A new authoring feature must be
added to it. `flags/viewOnly.test.ts` pins sentinels on both sides (18 authoring flags that must be
blocked, 36 render/camera/sharing flags that must not be) so the classification can't rot unnoticed
in the directions that matter.

---

## 4. Load-time behaviour

`storage/bootstrap.ts:loadSharedDesignFromUrl` handles both routes:

- decodes once, ORs the route and payload signals, calls `setViewOnly(...)` (which re-resolves the
  flag map, exactly like the Simple↔Pro switch does);
- toasts **"Showroom — take a look around"** instead of "it's yours to edit";
- **keeps the fragment.** An editable link is a one-shot handover, so its hash is still cleared (a
  reload must not clobber the copy you've since edited). A showroom link is a *place*: keeping the
  fragment means reload, Back and bookmark all return to the tour rather than dropping the visitor
  into an empty default flat. Same reasoning as Excalidraw's persisted share hash.

`viewOnly` lives on `uiSlice`, session-only — not in `serialize()`, not in the autosave watch-list,
not in the history snapshot.

### The route is LIVE, not read-once (SHARE-ROUTE-REACTIVE, audit finding V12)

Both share routes used to be read exactly once, at boot. A *same-document* hash change to
`#/showroom/<code>` — a showroom link followed from inside the app, or pasted into the address bar
of an already-open tab — therefore left `viewOnly: false` and handed the visitor the sender's
design with every authoring surface intact: precisely the "invisible capability escalation" §2's
two-route design exists to prevent, arriving through the front door instead of through an old
build.

`bootstrap.ts:installShareRouteListener` (installed as the boot step right after the two share
loaders) listens for `hashchange` and re-reads the route:

| New hash | Action |
|---|---|
| a `#/design/` or `#/showroom/` route | re-run `loadSharedDesignFromUrl` — the same OR of route + payload signals as at boot, so an in-session hop into a showroom gates the session and a hop to an ordinary 3D link un-gates it, identically to opening that URL in a fresh tab |
| a `#/plans/` route | re-run `loadSharedPlanFromUrl`, same reasoning |
| no route, while `viewOnly` | **force a real document load.** This is the one direction that can only ADD capability, and no in-app action produces it — `takeEditableCopy` clears the fragment with `replaceState`, which fires no `hashchange` — so it can only be a hand-edited URL or a Back navigation. Rather than half-restore state mid-session, let boot decide from scratch. |
| no route, already editable | nothing |

Covered by `features/designShare.test.ts` → *in-session share-route changes* (four cases,
including that the listener really is what gates the session — the test only sets
`window.location.hash` and awaits a tick).

## 4b. What the visitor is NOT asked (GEO-PROMPT-ONDEMAND, audit finding V5)

The "Where are you?" geolocation primer used to fire on the first paint of **every** showroom
link, on both viewports — on a 390x844 phone it covered ~62% of the screen before the visitor had
seen anything. Asking someone for their location in order to position the sun in a design they do
not own and cannot edit is the textbook anti-pattern: Lighthouse ships a dedicated audit for
[requesting geolocation on page load](https://developer.chrome.com/docs/lighthouse/best-practices/geolocation-on-start),
and web.dev's [permissions guidance](https://web.dev/articles/permissions-best-practices) is to ask
"after a user interaction, when users have the context to understand why you're asking".

So `LocationPrompt` no longer auto-opens while `viewOnly` is set. Nothing is lost: **no share
link ever carries a location** — `designShare.ts:buildDesignSharePayload` hard-codes
`location: null` into every payload it builds, editable or view-only alike (`location` IS part of
`serialize()`, but this override runs after it) — so `useSunPosition` always falls back to
`FALLBACK_LOCATION` (Singapore, 1.35N 103.82E) for a share-link visitor, the same as it always has.
(An earlier draft of this section said the sender's own location travels in the payload; it does
not — corrected 2026-09-25 per `docs/audit/code-review-r7-2026-09-25.md` finding C6. Whether a
share link *should* carry the sender's location, so a visitor's sun defaults to the sender's real
city rather than Singapore, is undecided and is a product call, not a bug.)

The visitor keeps a way in, and it is the same one every other user now has: the Scene menu's
**Sun position · &lt;location&gt;** row (`ui/scene/TimeOfDaySlider.tsx`, mounted by both the desktop
Scene menu and the mobile Scene sheet, and not withheld in a showroom) calls
`locationSlice.openLocationPrompt()`. That sets a session-only `locationPromptRequested` bit which
wins over `viewOnly`, over a previous dismissal **and** over an already-set location — so the one
row doubles as "change it", and the dialog's escape hatch reads *Cancel — keep the current
location* rather than *Skip* when there is something to keep. It also gives `resetLocationPrompt`
(renamed to `openLocationPrompt`) the caller its docstring had always claimed and never had.

**Not changed, noted:** the prompt is still modal on a first run for an ordinary new user. That is
already the recommended *permission-priming* shape — an in-app primer with an explicit "Use my
location" button, never a bare `navigator.geolocation` call on load — so it is a timing question
(defer it behind the first interaction?) rather than a correctness one, and it is a product call.

## 5. What the visitor sees

- `ui/ShowroomBadge.tsx` — a bottom-left card (where the getting-started checklist normally sits;
  that card is withheld in showroom mode, so they never collide) reading **"Showroom"** with one
  line about what is still live, and a **Make it mine** button. Deliberately the neutral surface,
  not `.warn`/`.danger`: a red "read-only" banner reads as a broken app, and the whole brief is
  that this should feel like the paid path.
  **The CTA carries accent weight (audit finding V8).** It shipped as a `btn-soft`, which made the
  single conversion action in the entire view-only experience the quietest control on its own card
  — quieter than the `btn-accent` the Share modal uses for the same idea. It is now `btn-accent`,
  and the reassurance line moved from `--t-2xs`/`--text-3` (~3.1:1, under the WCAG AA 4.5:1 floor
  for small text) to `--t-xs`/`--text-2`, with one clause trimmed so it stops on a full line. The
  card's deliberate tone is unchanged: still no lock icon, still no scolding — it offers a door, it
  does not apologise for a wall.
- `ui/WalkHud.tsx` — the walk-mode hint reads *"Move around to see **this** home at eye level.
  Leave walk mode to go back to the overview."* in a showroom (audit finding V6). The editable
  session keeps *"…to see **your** home… Leave walk mode to keep editing."* There is no editing to
  return to inside a showroom, and it is not the visitor's home.
- `ShareModal.tsx` — **Copy showroom link** is the new primary action, above the existing
  **Copy 3D link** (now the soft/secondary button) and **Copy plan link**. In showroom mode the
  modal also grows a **"You're in a showroom"** section with the same *Make it mine* action, so a
  visitor who opened Share looking for a way in finds one.
- `takeEditableCopy()` drops the capability and clears the fragment. Nothing is re-decoded — the
  design is already in the store — and the sender's link is unaffected.

## 6. Verified / not verified

No browser was used (another agent held the machine's browser budget for this round), so every
claim below is from tests plus reading the code.

**Verified in a real browser** (added 2026-09-25, superseding the "no browser was used" line
below for the four findings it covers): `scripts/scenarios/showroom-first-impression.json` drives a
visitor's whole first minute — a control arm proving an ordinary first run still raises the location
primer, a **real document load** into `#/showroom/<code>` (the new `navigate` step; a `goto` that
differs only in the fragment is same-document and never re-boots), then the V5/V6/V8/V12
assertions plus the on-demand Sun-position path. Run it at both viewports:
`SHOT_VIEWPORT=1400,900` and `SHOT_VIEWPORT=390,844 SHOT_TOUCH=1`, with
`SHOT_GPU=1 SHOT_ANGLE=metal`.

**Verified by test** (`features/designShare.test.ts`, `features/flags/viewOnly.test.ts`,
`state/viewOnlyMode.test.ts`, `ui/LocationPrompt.test.tsx`, `state/slices/locationSlice.test.ts`): envelope round-trip; editable links byte-identical to before;
legacy codes decode as editable; non-literal-`true` values rejected; both routes parse; route-only
and payload-only links both gate; showroom hash preserved and editable hash cleared; `canEditScene`
false in showroom; `enterRoomEditor` and `setFloorPlanEditing` refused and restored on exit; the
flag dimension in **both** Simple and Pro mode, including that it beats an override and that
nothing outside the denylist moves.

**Verified by reading the code** (each mounts on `canEditScene`, `roomEditorActive` or
`floorPlanEditing`, all three of which are now false): Catalog drawer, Inspector / MultiSelect
panel, Finish picker, Wall-accent picker, context menu, placement controller + ghost + confirm bar,
drag controller, rotate / resize / tilt gizmos, marquee selector, mobile long-press, the desktop
edit toolbar cluster and the mobile Edit/Design sheet sections, the 2D plan editor and its own
inspector/context menu.

**Deliberately left ungated:**

- **Graphics settings, tone mapping, exposure, colour grade, backdrops, HDRI** — view state, and
  the point of a showroom.
- **Time of day, weather, lights, lighting moods, sun direction** — the brief requires these live.
- **Cameras and views** — orbit, walk, top-down, dollhouse, section cut, saved views, presentation
  slideshow, panoramas, minimap teleport, AR/USDZ.
- **Walk-mode interactions** — curtains, blinds, screens, lights, cabinet doors. These *do* write
  `item.props`, so a visitor can open a curtain. That is judged part of the tour (it is how the
  walk HUD teaches the flat), it is not persisted anywhere the sender can see, and hiding it would
  gut walk mode. Noted here so the choice is deliberate rather than an oversight.
- **Exports** — PNG, PDF report, drawing set, CSVs, GLB/USDZ, hero card, summary, and **Save…** to
  the visitor's own slot. Read-side; taking a copy is offered outright anyway.
- **Budget, measure, Tools analysis** (design score, daylight, accessibility, clearance checks) —
  read-only analysis a prospective buyer legitimately wants.
- **Simple↔Pro toggle, themes, appearance** — the visitor's own preferences, not the design's.
- **Project notes textarea** in the Share modal (`designNote`) — it is not gated. It is
  session-local, not persisted back to the sender, and it is the natural place for a visitor to
  jot a reaction before re-sharing. Flagged as a conscious call, not an omission.
