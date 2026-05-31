# Toolbar redesign — icon island (1+3 hybrid)

## Problem

The toolbar (`src/ui/Toolbar.tsx`, ~1100 lines) is a cluttered wrapping row of
~25 text-labelled buttons. It's visually noisy, doesn't scale, and mixes
frequent actions with rare ones at the same prominence.

## Goal

A streamlined, horizontally-scrollable **icon island**: frequent actions are
direct icon buttons; busy clusters collapse into labelled dropdown menus.
Every control has a custom styled tooltip (name + keyboard-shortcut chip).
Reference mockup: `/tmp/mock/5-hybrid.png` (the 1+3 hybrid).

## Layout (orbit mode)

A single rounded island, centred top, `overflow-x-auto` on narrow screens.
Left→right, divider-separated clusters:

1. **Camera**: Orbit/Walk (icon + chevron → small popover with Orbit / Walk).
2. **View** (menu): Top view, Reset view, Turntable.
3. **Scene** (menu): Time (the existing time dropdown contents), Sun direction
   (opens the existing compass modal / orientation).
4. **Edit**: Tool Rotate/Select (icon + chevron), Undo, Redo, Snap (icon +
   chevron → grid-size sub-options), Measurements.
5. **Design**: Catalog (icon), Arrange (menu: Sets, Presets, Style, Floor
   plan), Tidy home (icon).
6. **Tools** (menu): Budget, Checks (with count badge), Sun study, Walkthrough,
   Report.
7. **Render**: Graphics (icon → opens GraphicsSettings), Lights.
8. **File** (menu): Save, Load, Export, Record.
9. Credits (icon).

Walk mode keeps today's gating: only Camera + essential controls show; the
editing clusters (Edit/Design/Tools/File) are hidden. (Preserve the existing
`cameraMode === 'orbit'` conditional.)

Badges: the Tools menu button shows the active-tool count dot (budget /
clearance / touring / recording), and Checks inside it shows the blocked-door
count — both already computed today.

## Module structure (`src/ui/toolbar/`)

Break the monolith into focused files:

- `Toolbar.tsx` — the island shell + cluster composition + walk-mode gating.
- `IconButton.tsx` — icon button (active state, optional chevron, optional
  badge), wires a tooltip.
- `ToolbarMenu.tsx` — a labelled dropdown trigger + portaled menu panel;
  `MenuItem` (icon + label + optional sub-description).
- `Popover.tsx` — shared portal + fixed-position primitive (see below); used by
  both tooltips and menus.
- `Tooltip.tsx` — hover tooltip (name + shortcut chip) built on `Popover`.
- `icons.tsx` — the inline SVG icon set (one component per icon).
- Per-menu files where the body is non-trivial, reusing existing logic:
  `ViewMenu.tsx`, `SceneMenu.tsx` (wraps the existing TimeDropdown +
  CompassModal), `ArrangeMenu.tsx`, `ToolsMenu.tsx`, `FileMenu.tsx`.

Existing per-action logic (Save/Load slot handling, Sets drop, Tidy arrange,
Report build, Sun study RAF, etc.) is **moved, not rewritten** — lifted out of
the old `Toolbar.tsx` into the relevant new file with behaviour unchanged.
`Toolbar.tsx`'s public import (`import { Toolbar }`) stays stable via a
re-export so `App.tsx` needs no change (or update the one import site).

## Popovers: portal + fixed positioning

Both tooltips and menus render through `Popover`, which:
- Renders into a `createPortal(…, document.body)` so the island's
  `overflow-x-auto` never clips them.
- Positions via the trigger's `getBoundingClientRect()` (fixed coords),
  anchored below the trigger, horizontally clamped to the viewport (flips/
  shifts near edges).
- Closes on outside-click, Escape, and scroll/resize (recompute or close).

This matches the existing portal pattern in `CompassModal` / `GraphicsSettings`.
Only one menu open at a time (clicking another trigger swaps).

## Tooltips

Custom styled tooltip (dark pill, name + a `<kbd>`-style shortcut chip), shown
on hover after a ~400 ms delay, hidden on leave / click / menu-open. Shortcut
label is sourced from `keybindings.ts` via a small
`shortcutLabel(id: KeybindingId)` helper that maps `KEYBINDINGS` codes to
display strings (e.g. `KeyM` → "M", `KeyC` → "C"; Ctrl/Cmd-modified ones render
"⌘C / Ctrl C"). Buttons without a binding show name only.

Accessibility: each icon button keeps an `aria-label` (the name) and
`title` is NOT set (custom tooltip replaces it to avoid double tooltips).
Menu triggers get `aria-haspopup="menu"` + `aria-expanded`.

## New keyboard shortcuts

Add a few natural bindings to `keybindings.ts` and dispatch them in the
existing `App.tsx` `onKey` callback (orbit-mode-gated where editing-related,
all guarded by `isEditableTarget` already). Chosen to avoid collisions with the
existing map (M,V,T,W,A,S,D,E,R,F,C,G,Y,Z,arrows,Delete,Escape):

- **Top view** → `KeyO` (Overview/top).  *(free)*
- **Reset view** → `KeyH` (Home).  *(free)*
- **Tidy home** → `KeyL` (cLeanup; T and C taken).  *(free)*

Collision check: O, H, L are unused in `KEYBINDINGS`. Tooltips for these three
then show the new chip; all other tooltips show existing bindings only. No
other actions get new shortcuts in this change.

These three are simple `if (!mod && code === KEYBINDINGS.x)` branches calling
the existing store actions (`requestTopView`, `requestHomeView`, the tidy
arrange routine — extracted into a store-independent helper or called via the
same merged-catalog arrange already in `TidyHomeButton`).

## Testing

Unit (Vitest, happy-dom):
- `shortcutLabel`: maps representative `KEYBINDINGS` ids to expected display
  strings (plain key, mod key); unknown/absent → empty.
- `keybindings`: the three new codes (`KeyO`,`KeyH`,`KeyL`) are present and do
  not duplicate any existing binding value (guard test over the map).
- `Popover`/`ToolbarMenu`: render a trigger, click it → menu content appears in
  a portal; Escape / outside-click closes; only one open at a time.
- `Tooltip`: appears on hover (after timer, faked), shows name + shortcut chip
  for a button with a binding, name-only without.
- A `Toolbar` smoke test: renders in orbit mode (all clusters present) and in
  walk mode (editing clusters absent).

Behaviour-preservation: existing toolbar-driven store tests keep passing
(Save/Load, Sets drop, Tidy, Checks count). No store/schema changes.

Visual verification (required by CLAUDE.md) — since the requester is remote,
deliver screenshots: render the running app and capture (1) the orbit island,
(2) a menu open (Arrange), (3) a tooltip with a shortcut chip, (4) walk-mode
collapsed island. Review each for clipping, overlap, alignment, and correct
active/badge states; report what the screenshots show.

## Out of scope

- The Asset quality control (already shipped) — its Graphics button is reused
  as-is.
- Re-theming the dropdown panels' contents beyond the icon/label/description
  treatment.
- Mobile/touch-specific layout.
- New shortcuts beyond the three listed.
