# src/ui — UI / overlay rules

Area rules for DOM overlays. Component map in `docs/ARCHITECTURE.md`.

- **No hardcoded colour.** Use the token class vocabulary from `src/styles/`
  (`.panel`/`.btn`/`.toolbar`/`.menu-item`/`.seg`/`.swatch`/`.cmdk`/`.ctx-menu`/`.toast`/…),
  never Tailwind colour utilities or literal hex. Every surface must read correctly in
  light + dark across all 5 themes.
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
