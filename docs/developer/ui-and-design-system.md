# UI & design system

## Design tokens (`src/styles/`)

One warm, Singapore-rooted system: **4 themes (Clay / Kampong / Porcelain /
Estate) × light/dark = 8 OKLCH palettes**, switched by `[data-theme]` +
`[data-mode]` on `<html>`. Every colour is a CSS custom property
(`--surface`/`--text`/`--accent`/`--border`/`--scene-*`/…) — components never
hardcode colour. Files: `tokens.css`, `components.css` (`.panel`/`.btn`/
`.toolbar`/`.menu`/inputs), `parts.css` (catalog/inspector/navcluster),
`features.css` (layers/cmdk/context-menu/toasts), `flows.css`
(onboarding/edit-room/presets/**smart-start**), `screens.css` (appearance/
loading/plan/walk), `responsive.css` (tablet/`body.mobile` bottom-sheets),
`app.css` (React-port glue). All imported from `src/index.css` after Tailwind.

The appearance choice persists in `localStorage` (`hdb_appearance`) and is
applied pre-paint by an inline script in `index.html` (no flash); Auto follows
the OS via `matchMedia`.

## Overlays (`src/ui/`)

- **Toolbar** (`ui/toolbar/`) — a horizontally-scrollable icon island;
  `IconButton`s + `ToolbarMenu` dropdowns (View / Scene / Arrange / Tools /
  File), portaled `Tooltip`/`Popover`. `AppearancePopover` switches theme +
  mode. The **User guide** button lives here (book icon → `ui/docsUrl.ts`).
- **CatalogDrawer** (`ui/catalog/`) — unified grid (Catalog / Layers / Packs).
- **InspectorPanel**, FinishPicker, WallAccentPicker, GraphicsSettings,
  BudgetPanel, NavCluster, **CommandPalette** (⌘K — also has the docs command),
  ContextMenu, Onboarding, **HelpModal** (with the user-guide link), a shared
  **Modal** primitive, `upload/` dialogs, `floorplan/` editor, `wizard/`
  (Smart Start), `ai/` (photoreal export section).
- `body.mobile` (≤640px) switches floating panels to bottom-sheets and the
  toolbar to a collapsed bar + action sheet (`toolbar/MobileToolbar.tsx`).

## In-app docs link

`ui/docsUrl.ts` resolves `${import.meta.env.BASE_URL}docs/` (host-agnostic) and
`openDocs()` opens it in a new tab. Wired into the toolbar, Help modal, and
command palette. See [Testing & verification](./testing-and-verification.md) for
the docs build.

Relevant specs: the toolbar + design-system specs under
`docs/superpowers/specs/`.
