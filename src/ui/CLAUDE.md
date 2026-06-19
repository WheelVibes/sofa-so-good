# src/ui — UI / overlay rules

Area rules for DOM overlays. Component map in `docs/ARCHITECTURE.md`.

- **No hardcoded colour.** Use the token class vocabulary from `src/styles/`
  (`.panel`/`.btn`/`.toolbar`/`.menu-item`/`.seg`/`.swatch`/`.cmdk`/`.ctx-menu`/`.toast`/…),
  never Tailwind colour utilities or literal hex. Every surface must read correctly in
  light + dark across all 5 themes.
- **Viewport-responsive + touch parity.** Support desktop **and** mobile: `body.mobile`
  bottom-sheets at ≤640px (`useIsMobile`), controls inside `env(safe-area-inset-*)`, and
  mobile-toolbar/accordion parity for any new desktop action. Drag-and-drop drop zones must
  be a `<div>` (a `<button>` mishandles native drops).
- **Polished + pixel-perfect.** Use the standard spacing scale for margins/padding (no
  ad-hoc one-off gaps); align to existing components so layouts stay cohesive with the
  theme. Verify any new surface in light + dark across all 5 themes before shipping.
- **Empty states use the shared `EmptyState`** (`src/ui/EmptyState.tsx`): icon (from the
  `Icon` set) + title + optional one-line description + optional CTA, on the `.empty-mini`
  token vocabulary. Any panel/list that can be empty must render it (don't hand-roll inline
  "No … yet" text). Keep copy concise + friendly; use distinct copy for search-no-results
  vs truly-empty; only wire a CTA to a real existing handler.
- **Editing UI** (Catalog/Inspector/FinishPicker) only mounts in the per-room editor —
  gate on `canEditScene`; leaving the editor clears the selection.
- **Shortcut chips** come from `controls/keybindings.ts` (via `shortcuts.ts`) — never
  hardcode a key label. Tooltips + menus render through `Popover` (portal) so the
  scrollable toolbar can't clip them.
- Modals portal to `document.body`; reuse the shared `Modal` primitive. While any modal is
  open, global hotkeys are suppressed via `controls/modalGuard.ts` — `Modal` registers
  automatically; any modal-style overlay that does **not** build on `Modal` (custom
  `.modal-overlay`, upload dialogs, …) must call `useModalGuard(open)` itself. Escape is
  each modal's own listener; ⌘K/undo are suppressed while a modal is open (the ⌘K palette
  is not a `Modal` and keeps its own keyboard handling).
