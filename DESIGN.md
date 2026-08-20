# DESIGN.md — Sofa So Good design system

The single-file design contract for humans and coding agents. Concrete values live in
`src/styles/tokens.css` (source of truth); this file names the system, states intent, and
records the do/don'ts. Component-level rules: `src/ui/CLAUDE.md`. Class vocabulary:
`src/styles/components.css` / `parts.css` / `features.css`.

## Identity

A warm, domestic, Singapore-rooted **productivity tool** — precise like a pro CAD app,
friendly like a consumer configurator. Polish is calm and subtle: micro-interactions confirm,
they never perform. Marketing-flash effects (magnetic buttons, custom cursors, gooey menus,
tilt cards, scramble text) are **off-brand — do not add them**.

## Color

- **5 themes** (`clay` default, `kampong`, `porcelain`, `estate`, `harbour`) × light/dark via
  `[data-theme]` + `[data-mode]`. All colors are **oklch** tokens.
- Semantic roles only: `--surface` (glass panel) / `--surface-solid` / `--surface-2` (inset) /
  `--surface-3` (hover) / `--elevated` (popovers), `--text` / `--text-2` / `--text-3`,
  `--accent` / `--accent-2` (hover) / `--accent-soft` / `--accent-soft-text` / `--on-accent`,
  `--danger(-soft)`, `--ok`, `--border` (hairline) / `--border-2` (emphasis/hover only).
- **Never a color literal** in component CSS/TSX — no hex, no Tailwind color utilities. Derive
  variants with `color-mix(in oklch, var(--accent) N%, transparent)`. The semantic
  mode-independent exceptions (`--sun`, `--photo-tile`, `--scrim`/`--on-scrim` for text
  over live 3D pixels) live in tokens.css with their rationale.
- Accent borders mean **selection/focus**, never mere hover. Hover = one surface step up
  (rest `--surface-2` → hover `--surface-3`).

## Typography

- `--font-ui` Plus Jakarta Sans; `--font-mono` JetBrains Mono for numeric/code.
- One ladder (`--t-2xs` 10 → `--t-xl` 20px): hero `--t-xl`/800, panel title `--t-lg`/800,
  section header `--t-2xs`/700 UPPERCASE `letter-spacing:0.06–0.08em` `--text-3`,
  body/label `--t-base`/`--t-sm` 500–600, caption `--t-xs`/`--t-2xs` 600 `--text-3`.
- `--lh-tight` (1.25) for headings/single-line; `--lh-body` (1.5) for multiline reading copy.
- Numeric readouts: `font-variant-numeric: tabular-nums` (or `.mono`).

## Space, shape, elevation

- Spacing scale `--s-1`(4) … `--s-7`(28) — no ad-hoc gaps.
- Radii: `--r-1`(3, chips/kbd) `--r-2`(5, buttons/inputs/cards) `--r-3`(7, panels) `--r-pill`.
  Crisp, architectural corners — don't soften.
- Elevation: `--shadow-panel` (docked/floating panels) and `--shadow-pop` (popovers, lifted
  cards) only. Panels use translucent `--surface` + `backdrop-filter: blur(var(--blur))`.
- Widths: `--panel-w`/`-compact`/`-wide`; modals `--modal-xs`/`-sm`/`-md`/`-lg` (360px
  default needs no token); z via `--z-*`.
- Scroll containers carry NO vertical padding — the inset lives on the first/last child
  (`.panel-body`/`.pop-panel`/`.lyr-body` pattern, UIUX-46): sticky section labels and the
  scroll-edge lips pin flush at the clip edge, and scrolled rows can never ghost through a
  padding strip past the panel's visual end. Rows boxed in by an opaque sticky label take
  the `--focus-ring-inset` variant so the ring is never truncated.

## Motion

- Micro-transitions (hover, fills, color): `var(--dur)` (0.16s) `var(--ease)`.
- Springs: use the paired `--dur-spring-snappy/--ease-spring-snappy` (position/size moves)
  and `--dur-spring-pop/--ease-spring-pop` (confirmation lands) tokens — sampled real
  springs compiled to CSS `linear()` (regenerate via `scripts/gen-spring-easing.mjs`);
  never split a spring easing from its paired duration.
- Entrances/choreography: `--dur-1`(150) `--dur-2`(300) `--dur-3`(600) + `--ease-out`
  (easeOutExpo — fast-in, soft-settle). Exits are faster than entrances or instant.
- Animate **transform + opacity only**; animation fills `backwards`, never `both`.
- Interaction feedback ≤ 300ms; decorative loops are slow (≥2s) and double-gated:
  `useAmbientFx()` = `ambientFx` flag AND quality tier above Performance AND not
  reduced-motion. Continuous animations must pause off-screen (IntersectionObserver).
- Respect `prefers-reduced-motion` everywhere; never animate a high-frequency action
  (drag-placing furniture stays instant).
- Entrance stagger: `.stagger-in` container, `--i` per child (inline when >12 children;
  never on containers with arbitrary child counts).

## Interaction grammar

- Keyboard focus = `var(--focus-ring)` box-shadow on `:focus-visible` — never ad-hoc outlines.
- Hover-lift cards = shared `.liftable` (translateY(-2px) + `--shadow-pop`).
- Hover-revealed row actions must also reveal on `:focus-within` and stay visible on touch.
- A selectable list row is never a click-only div: the primary action (icon + name) is a
  real button (`.lyr-sel` / the saved-view-row pattern) with `aria-pressed`, sibling action
  buttons after it; the row div may keep a whole-row mouse click and drag-and-drop duties.
- 3+ state controls = `Segmented`/`Select`, never click-to-cycle; `Segmented`'s selection
  glides on a measured `.seg-pill` (static `.on` is the unmeasured fallback). Buttons = `<Button>`
  primitive. Sliders = `SliderField`. Empty lists = `EmptyState`. Collapsibles = `Disclosure`.
  Confirmations = `confirmAction()` (never `window.confirm`). Spend/limit progress with a
  focal number = `RingGauge` (accent sweep, `danger` past the limit, `--dur-2 --ease-out`
  dashoffset glide) — one visual per value: a ring replaces a bar, never joins it.
- Destructive: delete = confirm + Undo toast backstop (deliberate policy — do not "simplify"
  to timed-undo-only).
- Mobile (≤640px `body.mobile`): bottom sheets, ≥44px touch targets, safe-area insets,
  desktop/mobile parity for every action.

## Naming (canonical component vocabulary)

Use these names in code, docs, and commits: **inspector** (right properties panel),
**catalog** (left library rail), **segmented control** (`.seg`), **disclosure** (collapsible
section), **popover** (anchored, `Popover`), **modal/sheet** (`Modal`; bottom sheet on
mobile), **command palette** (⌘K, `.cmdk`), **toast** (`.toast`), **toolbar island**
(floating top toolbar), **HUD** (canvas-anchored overlay), **empty state**, **badge**/**nub**
(counts), **kbd chip** (shortcut label).

## Process

- Every feature: flag-gated (`FEATURE_FLAGS`), tiered `simple`/`pro`, tested in both modes.
- Every surface: verified in light + dark across all 5 themes, desktop + mobile.
- Visual verification via `scripts/shot.mjs` scenarios is mandatory for app changes.
