# src/ui — UI / overlay rules

Area rules for DOM overlays. Component map in `docs/ARCHITECTURE.md`.

- **No hardcoded colour.** Use the token class vocabulary from `src/styles/`
  (`.panel`/`.btn`/`.toolbar`/`.menu-item`/`.seg`/`.swatch`/`.cmdk`/`.ctx-menu`/`.toast`/…),
  never Tailwind colour utilities or literal hex. Every surface must read correctly in
  light + dark across all 5 themes.
- **Form controls are custom, never native `<select>`/`<input type=color>`.** Use the shared
  `ui/controls/Select.tsx` (themed dropdown — `.input`-styled trigger → anchored `Popover` on
  desktop / `Modal` sheet on mobile, listbox keyboard + ARIA) and `ui/controls/ColorPicker.tsx`
  (swatch trigger → SV pad + hue bar + hex + `ThemeColorRows` + recents; HSV math in the pure
  `ui/controls/colorConvert.ts`, hex via `materials/colorHarmony` `normalizeHex`). Native phone
  dropdown/colour UIs are off-brand and small native fields trigger the iOS focus-zoom. Text inputs
  keep their normal small size on mobile — the iOS focus-zoom is suppressed by
  `controls/iosZoomGuard.ts` (toggles viewport `maximum-scale=1` only while a field is focused),
  installed once in `main.tsx`; do **not** re-add a blanket `font-size:16px` rule.
- **Buttons use the `<Button>` primitive** (`controls/Button.tsx`): pass
  `variant`/`size`/`block`/`icon`/`loading` instead of hand-writing `.btn-*`
  class strings. The `.btn-*` classes stay the source of truth — `Button` only
  composes them. New buttons use it; the raw classes remain valid for legacy
  call sites being migrated.
- **Docked side sidebars (desktop).** The scene, toolbar and canvas HUDs live inside `.stage-area`
  (in `App.tsx`); the inspector/finish panels carry a `dock-panel` class and the **catalog** a
  `dock-panel-left` class (it's a sibling of `.stage-area`, not a child, so the rail can shrink the
  canvas). On desktop (≥641px), `.app-shell:has(.dock-panel)` opens a `--right-rail` and
  `:has(.dock-panel-left)` a `--left-rail`, so `.stage-area` shrinks from that side (canvas reflows,
  the `left:50%` toolbar re-centres over the remaining space) and the panel docks full-height. Pure
  CSS keyed on the panel's *presence* (panels mount only when open) — no JS open-state. A new panel
  that should reflow the canvas just needs the right `dock-panel`/`dock-panel-left` class; mobile
  (≤640px) keeps bottom-sheets (the dock rules are gated to ≥641px). (The 2D floor-plan editor has
  its own layout — not docked yet.)
- **Edits confirm before they commit (`EditConfirmBar`).** A furniture move / rotate / placement
  resolves to a `placementSlice.pendingEdit` and the floating tick/cross **Apply change?** bar
  (`src/ui/EditConfirmBar.tsx`): ✓ / Enter commits, ✗ / Esc reverts (restores the pre-edit `items`
  ref for a transform, removes the just-placed item for a placement). Stamp/Shift placement keeps the
  old rapid no-confirm path. A new gesture auto-commits any still-pending edit.
  Placement already gives immediate optimistic feedback: drag arms the live `PlacementGhost`
  (follows the cursor during `dragover`) and drop applies the item instantly into a
  `pendingEdit` reconciled by the ✓/✗ bar — there is no separate optimistic/reconcile layer
  to add.
- **Viewport-responsive + touch parity.** Support desktop **and** mobile: `body.mobile`
  bottom-sheets at ≤640px (`useIsMobile`), controls inside `env(safe-area-inset-*)`, and
  mobile-toolbar/accordion parity for any new desktop action. Drag-and-drop drop zones must
  be a `<div>` (a `<button>` mishandles native drops).
- **Polished + pixel-perfect.** Use the standard spacing scale for margins/padding (no
  ad-hoc one-off gaps); align to existing components so layouts stay cohesive with the
  theme. Verify any new surface in light + dark across all 5 themes before shipping.
- **Destructive-action policy.** Reversible destructive actions (delete a placed
  item) show an **Undo toast** (the action runs immediately, `notify` offers
  Undo — see `itemsSlice`). **Bulk clears** (`clearRoom`) are confirm **+** Undo
  by design: a confirm gate against fat-finger wipes, then a summary toast with
  Undo — don't "simplify" either away. Irreversible actions
  (delete a saved version/slot, delete a saved view, reset/replace the whole
  design) MUST gate on `confirmAction({ title, message, confirmLabel, danger })`
  (`promptSlice`, rendered by `ConfirmModal`) and bail on `false`. Never a
  blocking `window.confirm`; never silent irreversible deletion.
- **Empty states use the shared `EmptyState`** (`src/ui/EmptyState.tsx`): icon (from the
  `Icon` set) + title + optional one-line description + optional CTA, on the `.empty-mini`
  token vocabulary. Any panel/list that can be empty must render it (don't hand-roll inline
  "No … yet" text). Keep copy concise + friendly; use distinct copy for search-no-results
  vs truly-empty; only wire a CTA to a real existing handler.
- **Editing UI** (Catalog/Inspector/FinishPicker) only mounts in the per-room editor —
  gate on `canEditScene`; leaving the editor clears the selection.
- **Remote CC0 catalog is flag-gated by content kind.** Browsable remote *models* (Poly Haven
  `RemoteCard`s in the catalog grid) ride the **`remoteFurniture`** flag (pro, default on);
  browsable remote *materials* (FinishPicker Browse tab) ride **`remoteMaterials`** (pro). Pass the
  flag into `useUnifiedCatalog(includeRemote)` (via `useFeature('remoteFurniture')`) — never merge
  remote entries ungated. Only bootstrap the provider index when at least one of the two is on
  (`bootstrapRemoteCatalog()` fetches both kinds), so Simple mode (both forced off) hits no network.
  Gating is **browse/add only**: a placed/resolved remote def still merges into `useCatalog`
  (`buildMergedCatalog`) and renders with the flag off — don't gate the render/merge path.
- **Shortcut chips** come from `controls/keybindings.ts` (via `shortcuts.ts`) — never
  hardcode a key label. Tooltips + menus render through `Popover` (portal) so the
  scrollable toolbar can't clip them.
- **Menu shortcut combos go through `MenuItem`'s `kbd` prop** (`toolbar/ToolbarMenu.tsx`),
  which renders the right-aligned `.mi-kbd` chip — never inline the combo text in `label`.
- **Modal widths use the `--modal-sm`/`-md`/`-lg` tokens**: pass the token string to
  `Modal`'s `width` prop (`width="var(--modal-md)"`), not an ad-hoc `min(…px, …)` literal.
- **Keyboard focus treatment is `var(--focus-ring)`** (`box-shadow` on `:focus-visible`) —
  no ad-hoc focus rings/outlines on a new control.
- **Borders.** `--border` is the default hairline (panels, rows, cards, dividers, inputs at
  rest). `--border-2` is the *stronger* border — use it only to signal emphasis or
  hover/active state (`.clr-item:hover { border-color: var(--border-2) }`, left accent bars,
  hovered share options). Never a colour literal; never a third ad-hoc border alpha. Accent
  borders (`border-color: var(--accent)`) mark selection/focus, not mere hover.
- **Hover.** Fills step up one surface level: rest → `--surface-2`, hover → `--surface-3`
  (rows, chips, ghost buttons). Interactive **cards** use the shared `.liftable` class
  (`translateY(-2px)` + `--shadow-pop` rise) — don't hand-roll a per-card `transform`/
  `box-shadow`. **Row actions** that appear on hover (`.lyr-acts` pattern) MUST also reveal on
  `:focus-within` and stay always-visible under `body.mobile` (touch has no hover). Hover
  transitions use `var(--dur) var(--ease)`; larger entrances use the `--dur-1/-2/-3` +
  `--ease-out` scale. `.stagger-in` entrance containers (`components.css`) use fill-mode
  `backwards` on the child animation — never `both`, which pins the animation's `to` values
  (`opacity:1; transform:none`) forever and silently blocks later hover-lift transforms
  (`.liftable`) or state-driven opacity changes (e.g. `.lyr-row.hidden`) on the same element.
  The nth-child `--i` fallback only covers the first 12 children — lists that can render more
  than 12 items must set `--i` inline per item rather than relying on the fallback.
- **Type hierarchy** — one ladder, from the `--t-*` scale: page/hero title `--t-xl` (20px)
  weight 800 `--lh-tight`; panel title `--t-lg` (16px) weight 800 `--lh-tight`; section header
  (`.sec-h`, `.lyr-ghead`, `.menu-label`) `--t-2xs` (10px) weight 700 UPPERCASE +
  `letter-spacing: 0.06–0.08em` + `--text-3`; body/item label `--t-base`/`--t-sm` weight
  500–600 `--text`/`--text-2`; caption/meta `--t-xs`/`--t-2xs` weight 600 `--text-3`. Multiline
  reading copy (descriptions, empty states, onboarding) uses `--lh-body` (1.5); single-line
  titles/labels use `--lh-tight` (1.25). Numeric readouts add
  `font-variant-numeric: tabular-nums` (or `.mono`).
- **Untrusted URLs → `safeUrl` (`src/utils/safeUrl.ts`).** Any URL that originates from
  imported / user-supplied / scraped data (def `sourceUrl`, IKEA `productInfo` image/document
  URLs, retailer-offer links, …) MUST pass through `safeUrl()`/`safeHref()` before it reaches an
  `href`/`src` — render the link only when it returns a value, else fall back to inert text (a
  `javascript:`/`data:` URL would otherwise execute on click, SEC-001). It allows only
  `http:`/`https:`/`mailto:` + relative/protocol-relative URLs. The schema also neutralizes these
  fields on import, but the render sink is the defense-in-depth backstop.
- Modals portal to `document.body`; reuse the shared `Modal` primitive. While any modal is
  open, global hotkeys are suppressed via `controls/modalGuard.ts` — `Modal` registers
  automatically; any modal-style overlay that does **not** build on `Modal` (custom
  `.modal-overlay`, upload dialogs, …) must call `useModalGuard(open)` itself. Escape is
  each modal's own listener; ⌘K/undo are suppressed while a modal is open (the ⌘K palette
  is not a `Modal` and keeps its own keyboard handling).
