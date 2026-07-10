# Toolbar UX audit — navigability, organization, discoverability (desktop + mobile)

**Date:** 2026-07-10 · **Scope:** the desktop toolbar island (`src/ui/toolbar/Toolbar.tsx` + `menus/*`),
the mobile toolbar/menu sheet (`MobileToolbar.tsx` + `mobile/*`), the plan-editor header
(`floorplan/editor/PlanEditorHeader.tsx` + `PlanToolsSheet.tsx`), and the shared primitives
(`ToolbarMenu`/`MenuItem`/`IconButton`/`Tooltip`/`Popover`/`Select`/`SliderField`).
**Method:** full code inventory of every menu/row/control + live screenshots of all toolbar
states, desktop 1600×1000 and mobile 390×844 (SwiftShader harness), benchmarked against the
`REFERENCES.md` apps (Coohom/Planner 5D/Sweet Home 3D/Arcadium/D5 camera panel).

Findings are ranked **P0 (broken interaction) → P1 (structural) → P2 (consistency) → P3 (polish)**.
Each carries file:line evidence. Open items from this audit are tracked in `TODO.md`
(§"Toolbar UX program"); when one ships, delete its row here per the maintenance rule.

---

## P0 — broken or misleading interactions

1. **Nested `Select` inside a toolbar `Popover` closes the whole menu on option click.**
   `Popover`'s outside-pointerdown containment (`ui/toolbar/Popover.tsx`) only accepts its own
   portaled panel; a nested `controls/Select.tsx` option list portals to a *sibling* body node, so
   picking an option reads as "outside", the parent menu closes on `pointerdown` and the option's
   `click` never lands — the pick is silently dropped. Affects every Select in the Scene menu
   (Render preset, Window view, Environment lighting, Reveal walls) and Arrange's `PickApply`
   pickers. Already logged in `TASKS.md` (IXT back-fill bug); this is the single worst toolbar
   interaction bug. Fix: containment must accept clicks inside any *descendant* portal (portal
   registry or shared data-attr).

2. **Scene-menu "Ceiling fixtures" / "Motion" toggles render as plain status text.** Screenshot
   evidence: the rows show just the section header + the word "Hidden"/"On" with no button
   affordance (border/fill), so users read them as status lines, not tappable controls
   (`menus/SceneMenu.tsx` seg-btn toggle idiom). They need a visible control (the segmented
   `.scene-seg` idiom used by Lights two sections up, or a `Toggle` switch).

3. **Mobile menu sheet's grab pill is decorative.** `.m-sheet-grab` (`MobileToolbar.tsx:186`,
   `responsive.css:217`) renders the universal "draggable sheet" affordance but has **no** drag
   handler — no swipe-to-dismiss exists (only the inspector has real `useInspectorMinimize`).
   Either wire a swipe-down-to-close or remove the pill.

## P1 — structure, discoverability, parity

4. **Whole-flat Arrange is unreachable on mobile.** Desktop deliberately surfaces
   `ArrangeMenu` (Smart Start, Tidy home, layout presets, style themes) in the orbit overview
   (`Toolbar.tsx:207-217`); mobile `railItems` (`MobileToolbar.tsx:106-127`) gates Arrange+Design
   to `roomEditorActive` — on a phone you must enter a single room to restyle the whole home.
   Highest-value parity gap; add an Arrange rail section to the overview mode.

5. **Tools menu is a 20+-row grab-bag mixing analysis with exports.** "Analyse" and
   "Review & tour" (registry rows) are coherent; then "Export & document" appends ~17
   hand-rendered rows (DXF/SVG/GLB/OBJ/STL/USDZ/AR/xlsx/.ics/quiz/transfer/report/callouts…)
   (`menus/ToolsMenu.tsx:151-310`). The panel exceeds its 72vh cap and the 12-row stagger limit
   (the TOOLBAR-MENU-VOID workaround exists *because* of this). Exports duplicate File-menu
   territory ("Shopping list"/CSV exports live in File; DXF/3D exports in Tools). Consolidate:
   all one-shot exports into **File → Export** (or a dedicated Export submenu/modal with groups),
   keep Tools = panels/modes only. Benchmarks (Sweet Home 3D, Planner 5D) keep every export under
   File.

6. **Cost/budget surfaces are scattered under four names.** "Budget" (Tools/Analyse), "Quote
   (BOQ)" + "Quote → Excel" (Tools/Export), "Shopping list" + "Cost breakdown (CSV)" (File).
   A user hunting "how much does this cost" has no single entry point. Group under one "Budget &
   costs" cluster (panel + its exports together).

7. **Toolbar island overflow has no affordance.** The island scrolls horizontally with a wheel
   hijack + drag-to-scroll (`Toolbar.tsx:61-107`) but shows no fade/arrow that content is clipped
   — in Pro orbit mode (9 clusters) narrow desktops silently hide the right cluster
   (Graphics/Appearance). Add edge-fade + scroll affordance (CSS `mask-image` fade + optional
   chevrons).

8. **Two mobile menu paradigms.** Room/overview = icon rail + master-detail bottom sheet;
   plan editor = a *centered modal* titled "Plan tools" opened by a **text** "☰ Menu" button
   (`PlanEditorHeader.tsx:83-91`, `PlanToolsSheet.tsx`) vs the icon hamburger everywhere else.
   Converge on the sheet paradigm (or at least the same trigger affordance).

9. **Walk mode strands scene/lights controls on desktop.** In walk with no room editor the island
   is Brand·View·Scene·Graphics·Appearance — fine — but the Lights *toolbar* button only exists
   in orbit-overview, and inside the room editor there is **no** lights control at all (Scene menu
   hidden there too). Users toggling fixtures while furnishing must exit the editor. Surface
   Lights (or the whole Scene menu) in the room-editor cluster.

## P2 — naming, component choice, keyboard

10. **"Measurements" vs "Measure" — two near-identical names, same icon, different features.**
    Toolbar "Measurements" = dimension labels overlay (`showMeasurements`, key M); Tools
    "Measure" = tape tool (`tapeMode`). Both use `Icon.Measure`. Rename for contrast (e.g.
    "Dimensions" for the overlay vs "Measure distance" for the tape) and give the tape its own
    icon.

11. **Cycle-buttons hide state spaces.** (a) Toolbar **Lights** cycles Auto→On→Off blind
    (`Toolbar.tsx:220-225`) while the *same* control is a proper 3-way segmented in Scene
    (`SceneMenu.tsx:89-101`); (b) **grid size** cycles values via a raw `<button>` with only a
    native `title` (`Toolbar.tsx:171-180`); (c) mobile Lights/Ceiling/Motion are tap-to-cycle
    `Item`s (`mobile/SceneSection.tsx:65-89`). Cycle controls are fine for 2 states; for 3+ use a
    segmented/Select so all states are visible. At minimum the toolbar Lights tooltip should name
    the *next* state ("Lights: Auto — click for On").

12. **Shortcut chips are missing where bindings exist** (discoverability of the keyboard layer):
    View→Orbit/Walk never show `V` (`toggleCameraMode`, `ViewMenu.tsx:62-75`); Tools→Budget never
    shows `B` — the `ToolAction` registry type has no `kbd` field at all
    (`actions/toolActions.tsx:34-56`); Scene→Time of day never surfaces `T` (`cyclePresetTime`).
    Add a `kbd` field to the registry + chips on the camera rows. Also "Exit room" hardcodes
    `shortcut="Esc"` (`Toolbar.tsx:128`) against the never-hardcode-key-labels rule.

13. **Enabled icon-buttons expose nothing on touch.** `IconButton` only sets a native `title` when
    *disabled* (`IconButton.tsx:51`); the custom `Tooltip` is hover/keyboard-only. Icon-only
    buttons (Snap, Lights, Graphics) are unnamed for touch users on desktop-with-touchscreen.
    Mirror `label` onto `title` when enabled too (harmless alongside the custom tooltip).

14. **Three section-header implementations + a private row primitive.** `.menu-label`
    (File/Tools), hand-rolled uppercase divs (`ViewMenu.tsx:59,90,122`), Arrange's own `Header`
    (`ArrangeMenu.tsx:248`); Arrange also rebuilds `MenuItem` as `Action` with hand-rolled
    set/style rows. Consolidate on `.menu-label` + `MenuItem` so spacing/type stay uniform.

15. **Destructive-action inconsistency:** Arrange's user-set/user-style `×` delete is immediate
    (`ArrangeMenu.tsx:123-131,191-199`) while File resets and saved-view deletes correctly gate on
    `confirmAction`. Route those deletes through `confirmAction` (they destroy user-authored data)
    or give them an Undo toast.

16. **Mobile a11y contract gaps:** the rail is `role=tablist/tab` with no arrow-key roving
    (`MobileToolbar.tsx:201-215`), and the sheet has no Tab focus-trap (tracked in TODO — the
    shared `controls/focusTrap.ts` is not wired). Low practical impact (keyboard-on-touch is
    rare) but the tablist role currently over-promises.

17. **Sub-44px primary touch targets:** hamburger + brand dot are 32×32
    (`responsive.css:143-144`) in the same file that enforces 44px for `.tool-btn`
    (`responsive.css:140`). Bump hit areas via `::after` inset padding (pattern already used for
    the sheet close button).

## P3 — polish / consistency

18. **Label+value separators differ per button:** `Snap to grid · 25 cm`, `Lights: Auto`,
    `Graphics — Balanced` (`Toolbar.tsx:167,222,236`) — pick one convention (` · `).
19. **Desktop↔mobile naming/icon drift:** "Walk" vs "Walk through"; Reset view = `Reset` icon on
    desktop vs `Home` on mobile; level rows `TopView` vs `Orbit` icons (`ViewMenu.tsx` vs
    `mobile/ViewSection.tsx`).
20. **Raw `<input type=range>` in GraphicsSettings** (Exposure/fixtures/resolution,
    `GraphicsSettings.tsx:191,279,291`) vs the mandated `SliderField` used in Scene.
21. **Inline empty-state text** in Arrange ("No saved sets yet…", `ArrangeMenu.tsx:101-104`),
    SavedViews and File ("No saved layouts.") instead of the shared `EmptyState`.
22. **Wall-reveal has two names in two panels:** Scene "Wall fade" slider vs Graphics
    "Auto-reveal walls" toggle — one feature, two vocabularies; cross-link or merge.
23. **Two 640px breakpoint sources of truth:** `useIsMobile.ts:6` vs `body.mobile`/CSS media
    queries — extract a shared constant/custom-media token.
24. **Tools→History reuses the Undo icon** (`toolActions.tsx:220`) inviting confusion with the
    Undo button; give History a clock/timeline glyph.

---

## Grounding — how modern canvas apps (Figma UI3 et al.) solve these

Benchmarked against Figma's UI3 redesign (the closest modern reference for a canvas-first tool
with a floating toolbar), plus the command-bar/shortcut literature. Sources:
[Figma — Our approach to designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/),
[Figma — Behind our redesign](https://www.figma.com/blog/behind-our-redesign-ui3/),
[Figma — Making the move to UI3](https://www.figma.com/blog/making-the-move-to-ui3-a-guide-to-figmas-next-chapter/),
[Knock — How to design great keyboard shortcuts](https://knock.app/blog/how-to-design-great-keyboard-shortcuts),
[forum feedback on hidden contextual tools](https://forum.figma.com/suggest-a-feature-11/bring-the-top-bar-back-contextual-tools-should-be-visible-not-hidden-24663).

- **Canvas-first, contextual chrome.** UI3's organizing principle is "center the work, not the
  UI": a minimal floating toolbar holding only *global* tools, with everything selection-specific
  appearing contextually. Our mode-scoped island (view-mode vs room-editor clusters) already
  follows this — validation for keeping it. But Figma's post-launch lesson cuts the other way
  too: hiding *contextual tools* behind extra clicks drew sustained complaints ("contextual tools
  should be visible, not hidden"), and Figma re-docked panels users lived in. Translation for us:
  P1-9 (no Lights/Scene control inside the room editor) and P2-11 (cycle buttons hiding states)
  are exactly the "hidden contextual tool" failure mode; the fix is surfacing state, not more
  nesting.
- **Every action teaches its shortcut.** Figma's tooltips pair the action name with its shortcut
  everywhere, and the quick-actions bar (⌘/) lists shortcuts inline — the tooltip is the primary
  shortcut-teaching surface. Our `IconButton` tooltip already does this; the gaps (P2-12: menu
  rows with bindings but no chip, a registry that *can't* carry one; P2-13: nothing on touch) are
  departures from that standard, not missing infrastructure.
- **One search-everything entry point.** The modern discoverability backstop is the command bar
  (Figma ⌘/, Linear/Slack ⌘K) — we have ⌘K with `COMMAND_FLAGS`, so every toolbar action should
  also be registered there; an action reachable only by hunting menus fails the modern bar.
- **Overflow is explicit, never silent.** Figma/Canva/Miro collapse toolbar overflow into a
  visible "…" affordance; content that scrolls off-edge always shows an edge fade or chevron.
  Our island's invisible horizontal scroll (P1-7) has no modern precedent.
- **Segmented controls for small closed sets.** Figma's panel idiom for 2–4-state properties
  (align, text case, layout direction) is a segmented control showing *all* states; cycle-through
  buttons survive only where the state is visually self-evident on the canvas. Supports P0-2 and
  P2-11.
- **Sheets that look draggable are draggable.** Mobile Figma/FigJam bottom sheets use the grab
  pill *with* the gesture; an inert pill (P0-3) breaks a learned OS-level affordance.
- **Menu IA: File owns output.** Across Figma/Sketch/Sweet Home 3D/Planner 5D, one-shot
  exports live under File/Export with grouped submenus; panels and modes live elsewhere. Supports
  the P1-5/6 consolidation.

## What is already good (don't churn)

- The **mode-scoped island** (view-mode vs room-editor clusters) matches the VIEW-EDIT-SPLIT
  and keeps the default surface minimal — benchmarks (Coohom) are far busier.
- `MenuItem` (icon + label + sub + kbd chip + docs "?" + NEW badge) is a strong, discoverable row
  primitive — the problem is the places that *don't* use it.
- Mobile master-detail sheet with per-mode rail sections is a clean paradigm; safe-area handling
  is comprehensive; `act()` close/keep/defer semantics are consistent.
- Custom `Select`/`SliderField`/`ColorPicker` primitives satisfy the no-native-controls rule with
  full keyboard + ARIA on desktop.

## Suggested sequencing (value ÷ effort)

1. **P0-1 Popover descendant-portal containment** (S — unblocks every nested Select; also fixes
   the same bug for future menus).
2. **P0-2 Scene toggle affordance** (S) + **P2-11a Lights segmented consistency** (S).
3. **P1-4 mobile overview Arrange section** (S–M — reuse `ArrangeSection`, add rail entry).
4. **P2-12 kbd chips** (S — registry `kbd` field + camera rows + Esc from keybindings).
5. **P2-10 Measure naming split** (S). **P3-18/19 label/icon harmonization** (S).
6. **P1-5/6 Tools/File export consolidation** (M — information architecture change, needs a
   scenario re-rung + docs update).
7. **P1-7 island overflow affordance** (S–M). **P0-3 sheet swipe or pill removal** (S).
8. **P2-15 confirm on set/style delete** (S). **P2-13 title on enabled IconButton** (S).
9. **P2-17 touch targets** (S). Rest as opportunistic polish.
