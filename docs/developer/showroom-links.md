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

The app has ~274 feature flags and a large Pro surface. Rather than touch hundreds of components,
`viewOnly` is applied where the app *already* decides what a session may do.

| # | Chokepoint | Covers |
|---|---|---|
| 1 | `src/state/editing.ts` → `canEditScene` | Every 3D selection, drag, rotate/resize/tilt gizmo, marquee, hover highlight, context menu, placement ghost, floor/wall click-to-select (→ the Finish picker and Wall-accent picker), most editor hotkeys, `⌘A`, the nudge keys. ~25 call sites, all inherited. `src/state/CLAUDE.md` already names it "the single gate for all scene editing". |
| 2 | `uiSlice.enterRoomEditor` | The room editor **is** the editing mode, so refusing entry closes the Catalog drawer, the Inspector, the multi-select panel and the whole desktop/mobile edit toolbar cluster at once (they all mount on `roomEditorActive`). |
| 3 | `floorPlanSlice.setFloorPlanEditing` | The 2D plan editor — a second editing app with its own toolbar, `P` hotkey, context menu and plan inspector — refused at the store rather than at its six entry points. Leaving is always allowed, so no state can trap a session inside it. |
| 4 | `resolveFlags(..., viewOnly)` + `flags/viewOnly.ts` | 114 authoring feature flags (of 275) forced off, so their menu rows, ⌘K commands, panels and hotkeys disappear through the gates that already exist. Orthogonal to Simple/Pro and, like the Simple branch, it wins over any dev/admin override. |

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

`VIEW_ONLY_BLOCKED_FLAGS` (114 entries) enumerates the authoring surfaces. The inverse was considered and
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

## 5. What the visitor sees

- `ui/ShowroomBadge.tsx` — a bottom-left card (where the getting-started checklist normally sits;
  that card is withheld in showroom mode, so they never collide) reading **"Showroom"** with one
  line about what is still live, and a **Make it mine** button. Deliberately the neutral surface,
  not `.warn`/`.danger`: a red "read-only" banner reads as a broken app, and the whole brief is
  that this should feel like the paid path.
- `ShareModal.tsx` — **Copy showroom link** is the new primary action, above the existing
  **Copy 3D link** (now the soft/secondary button) and **Copy plan link**. In showroom mode the
  modal also grows a **"You're in a showroom"** section with the same *Make it mine* action, so a
  visitor who opened Share looking for a way in finds one.
- `takeEditableCopy()` drops the capability and clears the fragment. Nothing is re-decoded — the
  design is already in the store — and the sender's link is unaffected.

## 6. Verified / not verified

No browser was used (another agent held the machine's browser budget for this round), so every
claim below is from tests plus reading the code.

**Verified by test** (`features/designShare.test.ts`, `features/flags/viewOnly.test.ts`,
`state/viewOnlyMode.test.ts`): envelope round-trip; editable links byte-identical to before;
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
