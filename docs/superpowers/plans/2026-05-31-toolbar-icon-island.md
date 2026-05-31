# Toolbar Icon-Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered wrapping text toolbar with a streamlined, horizontally-scrollable icon island where frequent actions are direct icon buttons, busy clusters collapse into labelled portaled dropdown menus, and every control has a custom styled tooltip with a keyboard-shortcut chip.

**Architecture:** A new `src/ui/toolbar/` module. Logic units (shortcut labels, keybinding guard, popover open/close, tooltip content) are built TDD-first. Visual composition (icons, cluster layout) is built then verified with screenshots (the app's required visual-verification step). Existing per-action behaviour (Save/Load/Sets/Tidy/Report/etc.) is *moved, not rewritten*, from the old `Toolbar.tsx`. Popovers render through a `createPortal` primitive so the scrollable island never clips them.

**Tech Stack:** React + TypeScript, Zustand store, Tailwind, Vitest + happy-dom, `@testing-library/react` (already used), Puppeteer screenshot harness (`scripts/shot.mjs`).

---

## File Structure

- Create `src/ui/toolbar/icons.tsx` — inline SVG icon components.
- Create `src/ui/toolbar/shortcuts.ts` — `shortcutLabel(id)` mapping `KEYBINDINGS` → display string.
- Create `src/ui/toolbar/shortcuts.test.ts`.
- Create `src/ui/toolbar/Popover.tsx` — portal + fixed-position primitive.
- Create `src/ui/toolbar/Popover.test.tsx`.
- Create `src/ui/toolbar/Tooltip.tsx` — hover tooltip (name + shortcut chip) on Popover.
- Create `src/ui/toolbar/Tooltip.test.tsx`.
- Create `src/ui/toolbar/IconButton.tsx` — icon button (active/chevron/badge) + tooltip.
- Create `src/ui/toolbar/ToolbarMenu.tsx` — labelled dropdown trigger + portaled panel + `MenuItem`.
- Create `src/ui/toolbar/ToolbarMenu.test.tsx`.
- Create `src/ui/toolbar/menus/ViewMenu.tsx`, `SceneMenu.tsx`, `ArrangeMenu.tsx`, `ToolsMenu.tsx`, `FileMenu.tsx` — cluster bodies (logic lifted from old Toolbar).
- Create `src/ui/toolbar/Toolbar.tsx` — island shell + cluster composition + walk-mode gating.
- Create `src/ui/toolbar/Toolbar.test.tsx` — smoke test.
- Create `src/ui/toolbar/index.ts` — `export { Toolbar } from './Toolbar'`.
- Modify `src/ui/Toolbar.tsx` — replace body with `export { Toolbar } from './toolbar'` (keeps the import path `./ui/Toolbar` stable), OR delete and update the import in the consumer. (Task 9 resolves this.)
- Modify `src/controls/keybindings.ts` — add `topView: 'KeyO'`, `resetView: 'KeyH'`, `tidyHome: 'KeyL'`.
- Modify `src/controls/keybindings.test.ts` (create if absent) — collision guard.
- Modify `src/App.tsx` — dispatch the three new shortcuts in `onKey`.
- Modify `CLAUDE.md` + `README.md` — document the new toolbar.

---

## Task 1: Shortcut label helper

**Files:**
- Create: `src/ui/toolbar/shortcuts.ts`
- Test: `src/ui/toolbar/shortcuts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { shortcutLabel } from './shortcuts';

describe('shortcutLabel', () => {
  it('renders a plain letter key', () => {
    expect(shortcutLabel('toggleMeasurements')).toBe('M');
    expect(shortcutLabel('toggleCatalog')).toBe('C');
  });
  it('renders mod-key bindings with a Ctrl/Cmd prefix', () => {
    expect(shortcutLabel('undo')).toBe('Ctrl Z');
    expect(shortcutLabel('redo')).toBe('Ctrl Y');
  });
  it('returns empty string for an unknown id', () => {
    // @ts-expect-error intentionally invalid id
    expect(shortcutLabel('nope')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/shortcuts.test.ts`
Expected: FAIL — `shortcutLabel is not a function` (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import { KEYBINDINGS, type KeybindingId } from '../../controls/keybindings';

/** Bindings that are triggered with Ctrl/Cmd held. */
const MOD_BINDINGS: ReadonlySet<KeybindingId> = new Set([
  'undo', 'redo', 'copySelected', 'pasteClipboard', 'duplicateSelected',
]);

/** Human display string for a keybinding (e.g. 'M', 'Ctrl Z'). Empty when the
 *  id has no binding. Sourced from KEYBINDINGS so the toolbar never hardcodes
 *  shortcut text. */
export function shortcutLabel(id: KeybindingId): string {
  const code = KEYBINDINGS[id];
  if (!code) return '';
  const key = code.startsWith('Key') ? code.slice(3) : code;
  return MOD_BINDINGS.has(id) ? `Ctrl ${key}` : key;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/shortcuts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/shortcuts.ts src/ui/toolbar/shortcuts.test.ts
git commit -m "feat(toolbar): shortcutLabel helper sourced from keybindings"
```

---

## Task 2: New keybindings + collision guard

**Files:**
- Modify: `src/controls/keybindings.ts`
- Test: `src/controls/keybindings.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { KEYBINDINGS } from './keybindings';

describe('KEYBINDINGS', () => {
  it('defines the new toolbar shortcuts', () => {
    expect(KEYBINDINGS.topView).toBe('KeyO');
    expect(KEYBINDINGS.resetView).toBe('KeyH');
    expect(KEYBINDINGS.tidyHome).toBe('KeyL');
  });
  it('has no two ids bound to the same non-modifier key in the same context', () => {
    // O/H/L must not collide with any existing binding value.
    const values = Object.values(KEYBINDINGS);
    for (const k of ['KeyO', 'KeyH', 'KeyL']) {
      expect(values.filter((v) => v === k).length).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/controls/keybindings.test.ts`
Expected: FAIL — `topView` is undefined.

- [ ] **Step 3: Add the bindings**

In `src/controls/keybindings.ts`, inside the `KEYBINDINGS` object (after `toggleEditorTool`):

```ts
  toggleEditorTool: 'KeyG', // G: toggle select / orbit-camera tool
  topView: 'KeyO',          // O: top-down plan view
  resetView: 'KeyH',        // H: reset to 3D overview (Home)
  tidyHome: 'KeyL',         // L: auto-arrange every room (cLeanup)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/controls/keybindings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/controls/keybindings.ts src/controls/keybindings.test.ts
git commit -m "feat(controls): add topView/resetView/tidyHome keybindings"
```

---

## Task 3: Dispatch new shortcuts in App.tsx

**Files:**
- Modify: `src/App.tsx` (the `onKey` callback, ~line 117–135, and the tidy logic)

The tidy routine currently lives in `Toolbar.tsx`'s `TidyHomeButton`. Extract it to a reusable helper so both the button and the shortcut call it.

- [ ] **Step 1: Create the tidy helper (no test — pure store orchestration, covered by existing arrange tests)**

Create `src/layout/tidyHome.ts`:

```ts
import { useStore } from '../state/store';
import { buildMergedCatalog } from '../furniture/catalog';
import { arrangeAllRooms, arrangeAllRoomsForPlan } from './autoArrange';
import { isDefaultPlan } from '../floorplan/planGeometry';

/** Auto-arrange every room per the interior-design rules. Shared by the
 *  toolbar Tidy button and the Tidy keyboard shortcut. */
export function tidyHome(): void {
  const s = useStore.getState();
  s.pushHistory();
  const catalog = buildMergedCatalog(s);
  const next = isDefaultPlan(s.floorPlan)
    ? arrangeAllRooms(s.items, catalog, s.doors)
    : arrangeAllRoomsForPlan(s.floorPlan, s.items, catalog, s.doors);
  s.setItems(next);
}
```

- [ ] **Step 2: Wire the three shortcuts in `src/App.tsx` `onKey`**

After the `cyclePresetTime` block (~line 123), add (these are view actions, allowed in orbit mode only to match the toolbar gating; place them after the `if (cameraMode !== 'orbit') return;` guard at ~line 131):

```ts
      if (!mod && code === KEYBINDINGS.topView) state.requestTopView();
      if (!mod && code === KEYBINDINGS.resetView) state.requestHomeView();
      if (!mod && code === KEYBINDINGS.tidyHome) tidyHome();
```

Add the import at the top of `App.tsx`:

```ts
import { tidyHome } from './layout/tidyHome';
```

(`state` is the `useStore.getState()` already captured at line 132 inside the orbit-gated section.)

- [ ] **Step 3: Typecheck + run the existing app/arrange tests**

Run: `npx tsc --noEmit && npx vitest run src/layout`
Expected: tsc clean; arrange tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/layout/tidyHome.ts
git commit -m "feat(controls): dispatch topView/resetView/tidyHome shortcuts"
```

---

## Task 4: Popover portal primitive

**Files:**
- Create: `src/ui/toolbar/Popover.tsx`
- Test: `src/ui/toolbar/Popover.test.tsx`

`Popover` renders children into `document.body` via `createPortal`, anchored to a
trigger ref's bounding rect, and closes on outside-click / Escape.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { Popover } from './Popover';

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={ref}>trigger</button>
      <Popover open={open} anchorRef={ref} onClose={onClose}>
        <div>panel-body</div>
      </Popover>
    </div>
  );
}

describe('Popover', () => {
  it('renders children only when open', () => {
    const { rerender } = render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByText('panel-body')).toBeNull();
    rerender(<Harness open onClose={() => {}} />);
    expect(screen.getByText('panel-body')).toBeTruthy();
  });

  it('calls onClose on Escape', () => {
    let closed = false;
    render(<Harness open onClose={() => { closed = true; }} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('calls onClose on outside pointerdown', () => {
    let closed = false;
    render(<Harness open onClose={() => { closed = true; }} />);
    fireEvent.pointerDown(document.body);
    expect(closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/Popover.test.tsx`
Expected: FAIL — cannot find `./Popover`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'left' | 'center';
}

/** Portaled, fixed-position panel anchored under a trigger. Escapes the
 *  toolbar island's overflow clip; closes on Escape + outside pointerdown;
 *  clamps to the viewport horizontally. */
export function Popover({ open, anchorRef, onClose, children, align = 'left' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const panelW = panelRef.current?.offsetWidth ?? 0;
    let left = align === 'center' ? r.left + r.width / 2 - panelW / 2 : r.left;
    const top = r.bottom + 6;
    // Clamp to viewport with an 8px margin.
    const maxLeft = window.innerWidth - panelW - 8;
    if (panelW) left = Math.max(8, Math.min(left, maxLeft));
    setPos({ left, top });
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 60 }}
    >
      {children}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/Popover.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/Popover.tsx src/ui/toolbar/Popover.test.tsx
git commit -m "feat(toolbar): portaled Popover primitive"
```

---

## Task 5: Tooltip

**Files:**
- Create: `src/ui/toolbar/Tooltip.tsx`
- Test: `src/ui/toolbar/Tooltip.test.tsx`

`Tooltip` wraps a trigger element; on hover (after a delay) it shows a portaled
dark pill with the label and, if present, a shortcut chip.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows label + shortcut chip after hover delay', () => {
    render(<Tooltip label="Catalog" shortcut="C"><button>btn</button></Tooltip>);
    fireEvent.pointerEnter(screen.getByText('btn').parentElement!);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Catalog')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('omits the chip when there is no shortcut', () => {
    render(<Tooltip label="Credits" shortcut=""><button>btn</button></Tooltip>);
    fireEvent.pointerEnter(screen.getByText('btn').parentElement!);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Credits')).toBeTruthy();
    // No chip element (the only text node is the label).
    expect(screen.queryByTestId('tooltip-chip')).toBeNull();
  });

  it('hides on pointer leave before the delay elapses', () => {
    render(<Tooltip label="Catalog" shortcut="C"><button>btn</button></Tooltip>);
    const wrap = screen.getByText('btn').parentElement!;
    fireEvent.pointerEnter(wrap);
    fireEvent.pointerLeave(wrap);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByText('Catalog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/Tooltip.test.tsx`
Expected: FAIL — cannot find `./Tooltip`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useRef, useState, type ReactNode } from 'react';
import { Popover } from './Popover';

const DELAY_MS = 400;

/** Wraps a trigger; shows a portaled dark tooltip (label + optional shortcut
 *  chip) after a hover delay. */
export function Tooltip({ label, shortcut, children }: { label: string; shortcut: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [open, setOpen] = useState(false);

  const enter = () => {
    timer.current = setTimeout(() => setOpen(true), DELAY_MS);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span ref={ref} onPointerEnter={enter} onPointerLeave={leave} onPointerDown={leave} className="inline-flex">
      {children}
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} align="center">
        <div className="flex items-center whitespace-nowrap rounded-md bg-neutral-800 px-2 py-1 text-xs text-white shadow-lg">
          {label}
          {shortcut ? (
            <span data-testid="tooltip-chip" className="ml-2 rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
              {shortcut}
            </span>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/Tooltip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/Tooltip.tsx src/ui/toolbar/Tooltip.test.tsx
git commit -m "feat(toolbar): hover Tooltip with shortcut chip"
```

---

## Task 6: Icons + IconButton

**Files:**
- Create: `src/ui/toolbar/icons.tsx`
- Create: `src/ui/toolbar/IconButton.tsx`

No dedicated unit test (pure presentational; covered by the Toolbar smoke test
and visual verification).

- [ ] **Step 1: Create `icons.tsx`**

One component per icon used by the toolbar. Each renders a 20px stroked SVG.
Provide at least: `Orbit, Walk, Time, Sun, Lights, Measure, Quality, TopView,
Reset, Turntable, Rotate, Select, Undo, Redo, Snap, Catalog, Sets, FloorPlan,
Presets, Tidy, Style, Tools, Save, Load, Export, Record, Credits, Chevron,
Budget, Checks, SunStudy, Walkthrough, Report`.

```tsx
import type { SVGProps } from 'react';

function Svg({ d, children, ...p }: SVGProps<SVGSVGElement> & { d?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
         strokeLinecap="round" strokeLinejoin="round" width={20} height={20} {...p}>
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const Icon = {
  Orbit: (p: SVGProps<SVGSVGElement>) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2a10 10 0 0 1 0 20M12 2a10 10 0 0 0 0 20" /></Svg>,
  Chevron: (p: SVGProps<SVGSVGElement>) => <Svg {...p} d="M6 9l6 6 6-6" />,
  // ... (one entry per icon listed above; copy paths from /tmp/mock/build.mjs `I`)
} as const;

export type IconName = keyof typeof Icon;
```

(Reuse the SVG path data already authored in `/tmp/mock/build.mjs` — the `I`
object — so the production icons match the approved mockup.)

- [ ] **Step 2: Create `IconButton.tsx`**

```tsx
import { Icon, type IconName } from './icons';
import { Tooltip } from './Tooltip';

interface IconButtonProps {
  icon: IconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  chevron?: boolean;
  badge?: string | number;
  onClick?: () => void;
  /** When true, render as a static element (the trigger inside a menu/popover
   *  manages its own click); defaults to a real button. */
  as?: 'button';
}

/** A single icon control with a hover tooltip. Active state mirrors today's
 *  dark-pill highlight; optional chevron marks a dropdown; optional badge is a
 *  small rose count dot. */
export function IconButton({ icon, label, shortcut = '', active, chevron, badge, onClick }: IconButtonProps) {
  const Cmp = Icon[icon];
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`relative flex h-9 items-center gap-1 rounded-lg px-2.5 ${
          active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/80'
        }`}
      >
        <Cmp />
        {chevron ? <Icon.Chevron width={12} height={12} className="opacity-60" /> : null}
        {badge != null && badge !== '' ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{badge}</span>
        ) : null}
      </button>
    </Tooltip>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/toolbar/icons.tsx src/ui/toolbar/IconButton.tsx
git commit -m "feat(toolbar): icon set + IconButton with tooltip"
```

---

## Task 7: ToolbarMenu

**Files:**
- Create: `src/ui/toolbar/ToolbarMenu.tsx`
- Test: `src/ui/toolbar/ToolbarMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolbarMenu, MenuItem } from './ToolbarMenu';

describe('ToolbarMenu', () => {
  it('toggles the panel on trigger click', () => {
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="Sets" onClick={() => {}} />
      </ToolbarMenu>,
    );
    expect(screen.queryByText('Sets')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }));
    expect(screen.getByText('Sets')).toBeTruthy();
  });

  it('closes after a menu item is chosen', () => {
    let chosen = false;
    render(
      <ToolbarMenu icon="Sets" label="Arrange">
        <MenuItem icon="Sets" label="Sets" onClick={() => { chosen = true; }} />
      </ToolbarMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /arrange/i }));
    fireEvent.click(screen.getByText('Sets'));
    expect(chosen).toBe(true);
    expect(screen.queryByText('Sets')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/ToolbarMenu.test.tsx`
Expected: FAIL — cannot find `./ToolbarMenu`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { Popover } from './Popover';

/** A labelled dropdown trigger (icon + text + chevron) whose panel is portaled
 *  via Popover. Children are MenuItems; choosing one closes the menu. */
export function ToolbarMenu({ icon, label, children, active }: { icon: IconName; label: string; children: ReactNode; active?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const Cmp = Icon[icon];
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm ${
          open || active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/80'
        }`}
      >
        <Cmp />
        <span>{label}</span>
        <Icon.Chevron width={12} height={12} className="opacity-60" />
      </button>
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="w-60 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-2xl"
        >
          {children}
        </div>
      </Popover>
    </>
  );
}

/** A single row inside a ToolbarMenu: icon + label + optional description. */
export function MenuItem({ icon, label, sub, onClick }: { icon: IconName; label: string; sub?: string; onClick: () => void }) {
  const Cmp = Icon[icon];
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-neutral-100"
    >
      <span className="text-neutral-600"><Cmp width={16} height={16} /></span>
      <span className="flex-1">
        <span className="block text-[13px] text-neutral-800">{label}</span>
        {sub ? <span className="block text-[10px] text-neutral-400">{sub}</span> : null}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/ToolbarMenu.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/ToolbarMenu.tsx src/ui/toolbar/ToolbarMenu.test.tsx
git commit -m "feat(toolbar): ToolbarMenu dropdown + MenuItem"
```

---

## Task 8: Cluster menu bodies (logic lifted from old Toolbar)

**Files:**
- Create: `src/ui/toolbar/menus/ViewMenu.tsx`, `SceneMenu.tsx`, `ArrangeMenu.tsx`, `ToolsMenu.tsx`, `FileMenu.tsx`

These reuse existing store actions and the already-extracted helpers. No new
unit tests (the store actions they call are already tested; visual verification
covers rendering). **Lift** the bodies from the old `src/ui/Toolbar.tsx`:

- `ViewMenu` → MenuItems: Top view (`requestTopView`, shortcut O), Reset view
  (`requestHomeView`, shortcut H), Turntable (`toggleAutoRotate`, active when
  `autoRotate`).
- `SceneMenu` → the existing time dropdown contents (move `TimeDropdown` body)
  + a "Sun direction" item that opens the existing `CompassModal` (move
  `CompassModal` into `src/ui/toolbar/` or import it from its current home;
  keep its implementation unchanged).
- `ArrangeMenu` → Sets (move `SetsMenu` drop logic — `dropBuiltin`/`dropIkea`),
  Presets (`applyLayoutPreset` list), Style (`applyStyle` list), Floor plan
  (`toggleFloorPlanEditing`). Reuse the existing `LAYOUT_PRESETS`,
  `STYLE_PRESETS`, `FURNITURE_SETS`, `ikeaSetRecipes` imports.
- `ToolsMenu` → Budget (`toggleBudget`), Checks (`toggleClearance` + the
  blocked-door count badge via `blockedDoorItems`/`useCatalog`), Sun study (the
  existing RAF toggle component), Walkthrough (`WalkthroughButton` logic),
  Report (`buildReportHtml`). Keep the active-dot aggregate
  (`budgetOpen || clearanceOn || touring || recording`) on the menu trigger.
- `FileMenu` → Save (`LocalStorageAdapter.save` + `saveThumb`), Load (the slot
  list with thumbnails + Default/Empty resets — move `LoadButton` body),
  Export (`EXPORT_EVENT` dispatch), Record (`RecordButton` logic; hidden when
  `!canRecord()`).

Each is a thin wrapper rendering `MenuItem`s (or, for Time/Load/Sun which need
richer inline UI, a custom panel passed as `ToolbarMenu` children).

- [ ] **Step 1: Create the five menu files**

Move the corresponding function bodies out of the old `Toolbar.tsx` into these
files, swapping their trigger+popover scaffolding for `ToolbarMenu` + `MenuItem`
(or custom children where the panel is rich). Preserve every store call and
guard exactly. Export each as a named component.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (some unused-import errors in old `Toolbar.tsx` are expected until Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/ui/toolbar/menus
git commit -m "feat(toolbar): cluster menu bodies (View/Scene/Arrange/Tools/File)"
```

---

## Task 9: Toolbar shell + smoke test + swap in

**Files:**
- Create: `src/ui/toolbar/Toolbar.tsx`, `src/ui/toolbar/index.ts`, `src/ui/toolbar/Toolbar.test.tsx`
- Modify: `src/ui/Toolbar.tsx` (replace with re-export)

- [ ] **Step 1: Write the failing smoke test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useStore } from '../../state/store';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  beforeEach(() => useStore.getState().__resetForTest());

  it('shows editing clusters in orbit mode', () => {
    useStore.getState().setCameraMode('orbit');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /arrange/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /catalog/i })).toBeTruthy();
  });

  it('hides editing clusters in walk mode', () => {
    useStore.getState().setCameraMode('firstPerson');
    render(<Toolbar />);
    expect(screen.queryByRole('button', { name: /arrange/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/Toolbar.test.tsx`
Expected: FAIL — cannot find `./Toolbar`.

- [ ] **Step 3: Write the shell**

Compose the island per the spec layout. Frequent actions are `IconButton`s;
clusters are the Task-8 menus. Camera Orbit/Walk is an `IconButton` with chevron
opening a small Popover with two `MenuItem`s (or a segmented mini-control).
Wrap in the scrollable island container:

```tsx
import { useStore } from '../../state/store';
import { IconButton } from './IconButton';
import { ViewMenu } from './menus/ViewMenu';
import { SceneMenu } from './menus/SceneMenu';
import { ArrangeMenu } from './menus/ArrangeMenu';
import { ToolsMenu } from './menus/ToolsMenu';
import { FileMenu } from './menus/FileMenu';
import { GraphicsSettings } from '../GraphicsSettings';
import { CreditsModal } from '../CreditsModal';
import { shortcutLabel } from './shortcuts';
import { tidyHome } from '../../layout/tidyHome';
// ...state selectors as needed...

function Divider() { return <div className="mx-1 h-6 w-px bg-neutral-300/70" />; }

export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode);
  // ...selectors: catalogOpen, snapEnabled, editorTool, lightsMode, qualityTier, etc.
  // ...local state: graphicsOpen, creditsOpen...
  const orbit = cameraMode === 'orbit';
  return (
    <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
      <div className="flex max-w-[96vw] items-center gap-0.5 overflow-x-auto rounded-2xl border border-white/60 bg-white/85 px-2 py-1.5 shadow-xl backdrop-blur">
        {/* Camera cluster (always) */}
        {/* ...CameraControl... */}
        {orbit && (
          <>
            <Divider />
            <ViewMenu />
            <SceneMenu />
            <Divider />
            {/* Edit: Tool toggle, Undo, Redo, Snap, Measurements */}
            <Divider />
            <IconButton icon="Catalog" label="Catalog" shortcut={shortcutLabel('toggleCatalog')} active={catalogOpen} onClick={toggleCatalogOpen} />
            <ArrangeMenu />
            <IconButton icon="Tidy" label="Tidy home" shortcut={shortcutLabel('tidyHome')} onClick={tidyHome} />
            <ToolsMenu />
            <Divider />
            {/* Render: Graphics, Lights */}
            <Divider />
            <FileMenu />
          </>
        )}
        {/* Credits + Graphics button shown in both modes per current behaviour */}
      </div>
      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
      <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
```

Fill in the Camera/Edit/Render inline controls using the existing store actions
(`setCameraMode`, `setEditorTool`, `undo`/`redo`, `toggleSnap`/`cycleGridSize`,
`toggleMeasurements`, `cycleLightsMode`, `qualityTier`/open Graphics). Use
`shortcutLabel(...)` for every tooltip that has a binding (Measurements M,
Catalog C, Tool G, camera V, Top view O via ViewMenu, etc.).

- [ ] **Step 4: Create `index.ts`**

```ts
export { Toolbar } from './Toolbar';
```

- [ ] **Step 5: Replace the old toolbar with a re-export**

Overwrite `src/ui/Toolbar.tsx` entirely with:

```tsx
export { Toolbar } from './toolbar';
```

(Keeps `App.tsx`'s `import { Toolbar } from './ui/Toolbar'` working.)

- [ ] **Step 6: Run smoke test + typecheck**

Run: `npx vitest run src/ui/toolbar/Toolbar.test.tsx && npx tsc --noEmit`
Expected: smoke PASS (2); tsc clean (no more unused-import errors — old body gone).

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar/Toolbar.tsx src/ui/toolbar/index.ts src/ui/toolbar/Toolbar.test.tsx src/ui/Toolbar.tsx
git commit -m "feat(toolbar): icon-island shell + swap in (replaces text toolbar)"
```

---

## Task 10: Full suite + docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Run the full suite + build**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green (the pre-existing skipped test stays skipped). Fix any
regressions before continuing.

- [ ] **Step 2: Update docs**

In `CLAUDE.md`, update the `src/ui/` layout bullet to mention `toolbar/`
(icon-island: `IconButton`, `ToolbarMenu`, `Popover`, `Tooltip`, `menus/`,
shortcut labels from `keybindings.ts`). In `README.md`, update any toolbar
description to reflect the icon island + dropdown menus + tooltips/shortcuts.
Note the three new shortcuts (Top view O, Reset H, Tidy L).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: icon-island toolbar"
```

---

## Task 11: Visual verification (remote — deliver screenshots)

The requester is remote, so screenshots are the deliverable (CLAUDE.md requires
visual review of any app change).

- [ ] **Step 1: Start the dev server** (`npm run dev`, note the port; harness targets 5173).

- [ ] **Step 2: Capture four states** via `scripts/shot.mjs` with eval scripts that drive `window.__store`:
  1. Orbit island (default).
  2. A menu open — click the Arrange trigger (eval: find button by text, `.click()`).
  3. A tooltip with a shortcut chip — `pointerEnter` the Catalog button.
  4. Walk-mode collapsed island — `setCameraMode('firstPerson')`.

- [ ] **Step 3: Review each screenshot** for clipping, overlap, alignment, correct active/badge states. Re-crop with `scripts/crop.mjs` for detail shots.

- [ ] **Step 4: Deliver** the screenshots to the user with a written description of what each shows, and flag any issue found. Fix issues (new RED test if it's a logic bug) before declaring done.

- [ ] **Step 5: Stop the dev server.**

---

## Self-Review notes

- **Spec coverage:** module structure (T6–9), portaled popovers (T4), custom
  tooltips w/ keybindings source (T1,T5), three new shortcuts O/H/L (T2,T3),
  walk-mode gating (T9), Tools/Checks badges (T8), behaviour-preservation via
  lift-not-rewrite (T8), remote visual verification (T11). All covered.
- **Type consistency:** `IconName` (icons.tsx) is the icon prop type across
  IconButton/ToolbarMenu/MenuItem; `shortcutLabel(id: KeybindingId)`;
  `Popover` props (`open/anchorRef/onClose/align`) are reused by Tooltip and
  ToolbarMenu unchanged; `tidyHome()` defined in T3 and called in T3+T9.
- **No placeholders:** logic tasks carry full code; T8 lifts existing bodies
  (described action-by-action) rather than re-deriving them.
