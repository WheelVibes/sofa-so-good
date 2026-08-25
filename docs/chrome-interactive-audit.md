# Chrome interactive audit harness

Drives the app through **a real Chrome tab** (the Claude-in-Chrome MCP tools) instead of the
headless puppeteer runner, and speaks the **same step vocabulary** as
`scripts/shot.mjs --scenario`, so scenarios are portable between the two.

Use this when it is available. It sees things the headless harness structurally cannot:
a real GPU and real materials, real fonts and text metrics, the real compositor, live
`localStorage`/IndexedDB, and the boot loader on a genuine cold start. Fall back to
`scripts/shot.mjs` when Chrome is not connected, when the run must be non-interactive
(CI, cron), or for the checks listed under [What this harness cannot do](#what-this-harness-cannot-do).

- Driver (in-page step engine + probes): `scripts/lib/chrome-audit/driver.js`
- Audit scenarios: `scripts/scenarios/chrome/ca-*.json`
- Findings log: `docs/audit/chrome-interactive-audit-2026-08.md`

---

## Running one

**1. Start the app** (`npm run dev`) and open `http://localhost:5173/` in a Chrome tab that
is **visible and frontmost**. A hidden/background tab throttles rAF: boot takes >20 s, never
reaches `sceneReady`, and captures come back stale. Check with `document.visibilityState`.

**2. Load the driver + a scenario.** Set `ROOT` once to your checkout path — Vite serves any
project file over `/@fs/<absolute path>` in dev, so no file has to be copied into `public/`:

```js
const ROOT = '/@fs/Users/you/dev/sofa-so-good'
const load = async (p) => (await fetch(`${ROOT}${p}?t=${Date.now()}`)).text()
;(0, eval)(await load('/scripts/lib/chrome-audit/driver.js'))
const scenario = JSON.parse(await load('/scripts/scenarios/chrome/ca-02-simple-coreloop.json'))
await window.__audit.load(scenario)
window.__audit.start()
```

**3. Poll, screenshot, resume.** The queue runs detached and suspends on any step the page
cannot perform on itself (`screenshot`, `viewport`), handing a directive back:

```js
window.__audit.poll()
// → { status: 'paused', directive: { action: 'screenshot', name: '03-catalog-drawer' }, at: '16/46 …' }
```

Take the screenshot with the MCP `computer` tool (or resize with `resize_window`), then:

```js
window.__audit.resume(); await new Promise(r => setTimeout(r, 5000)); window.__audit.poll()
```

**4. Read the findings** — flat, one string per finding (deeply-nested objects get truncated
by the tool bridge, which is why the reporter flattens):

```js
window.__audit.report()
// → ["probe-catalog | clipped | clipped-text | span \"L-shaped sectional\" | scrollW 103 > clientW 100", …]
```

**Always review the screenshots yourself.** A clean `report()` is not verification — the
lamp-shade bug, the plan-toolbar overflow and a regression introduced by one of the fixes
were all found by *looking*, and the audit's own probes produced false positives that only
measurement disproved.

## Re-running the whole suite

The scenarios are ordinary data files — rerun any of them at any time, in this order:

| Scenario | Covers |
|---|---|
| `ca-01-coldstart` | first run: onboarding carousel, 5 start choices, guided tour, location prompt, first paint |
| `ca-02-simple-coreloop` | Simple mode: room editor, catalog, inspector, finishes, walk, share |
| `ca-03-mobile-coreloop` | mobile layout: catalog sheet, place-confirm, inspector sheet, walk HUD |
| `ca-04-pro-panels` | Pro tier gating + Checks, Design score, Elevations, Budget, History |
| `ca-05-plan-editor` | 2D plan: entry, room select/rename, labels, exit |
| `ca-06-menus-themes` | toolbar dropdowns at open (stagger-void), command palette |

`ca-01` needs a genuine cold start first:
`localStorage.clear(); sessionStorage.clear()`, delete the IndexedDB databases, then navigate.

## Probing the boot screen

The boot loader is normally unreachable: the harness waits out the boot before step 1, so
`waitFor {css: "#boot-loader"}` times out (the playbook says the same). Two ways in:

1. **Snapshot it** — the playbook's technique. Strip the module scripts so the loader runs
   forever, then point a scenario at the file:
   `curl -s http://localhost:5173/ | sed 's|<script type="module"[^>]*src="[^"]*"></script>||g' > /tmp/boot-static.html`
   The inline phrase-rotator survives, so the cycling phrases still animate.
2. **A throttled tab** — a *hidden* tab holds the app on the boot screen long enough to probe it
   live. That is how the boot text's WCAG failure was found, so the hidden-tab condition is
   occasionally useful rather than only a hazard.

Worth doing: it is the app's first impression, and nothing else exercises it.

## Keeping the tab foregrounded

Every visual check depends on the tab being foreground, and within a single MCP tab group a
tab goes hidden when the whole Chrome **window** loses foreground (another app, or minimised).
No tab API can raise it silently, so the harness makes the condition loud and self-healing
instead of letting it corrupt a run:

- `pump()` checks `document.visibilityState` **before every step**. If the tab is hidden it
  calls `waitForVisible()`, which polls for up to 20 s — so briefly clicking away does not
  break a run, it just pauses it, and it resumes on its own the moment you come back.
- If it is still hidden after that, the queue **suspends** with a directive rather than
  stepping blind:

  ```js
  window.__audit.poll()
  // → { status: 'paused', directive: { action: 'focus', reason: 'tab is hidden — rAF throttled, captures would be stale' } }
  ```

  Nothing times out, and no stale pixels enter the findings.

**Host recovery on a `focus` directive** — in order:

1. **`npm run chrome:focus`** (macOS) — `osascript ... activate` raises AND un-minimises the
   window, which no tab-level API can do. This is the one step that fixes an OS-level focus
   problem without asking anyone, so try it first; `-- --check` reports whether Chrome is
   frontmost (exit 0/1) if you want to gate a capture on it.
2. `navigate` the tab to its own URL (`http://localhost:5173/`). The extension activates the
   tab it navigates, which is enough whenever the Chrome window itself is still on screen.
3. Take a `computer` screenshot — acting on a tab also tends to activate it.
4. Re-check with `window.__audit.visible()`, then `window.__audit.resume()`.
5. Only if all of that fails is it an OS-level problem the script cannot reach (a locked screen,
   another user's session): ask for the Chrome window to be raised.

To avoid the whole class, launch Chrome with the throttling switches Puppeteer uses by default —
`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
--disable-background-timer-throttling`. They cover a window sitting BEHIND another one; a
minimised window still reports `hidden` per spec, so keep step 1 as the fallback.

Check it yourself at any time with `window.__audit.visible()`.

## Step vocabulary

Identical to the puppeteer runner (`docs/visual-verification-playbook.md` → *Step types
reference*): `eval`, `waitFor` (`css` / `text` / `store` / `storeExists`), `click`
(`text` / `selector` / `x,y`), `drag`, `rdrag`, `wheel`, `key`, `type`, `select`, `wait`,
`screenshot`, `store`, `viewport`. Two additions:

| Step | Form | Purpose |
|---|---|---|
| `probe` | `{"probe": {"checks": ["overflow","clipped"], "scope": ".panel.catalog"}}` | run audit probes, optionally scoped to one subtree |
| `assert` | `{"assert": {"js": "…", "message": "…"}}` | fail the run when an invariant breaks |

`eval` takes inline code only (no `{file:…}` — there is no host filesystem in the page).

## Probes

| Probe | Finds |
|---|---|
| `console` | console errors/warnings + uncaught errors and rejections, deduped, attributed to the step |
| `overflow` | page-level horizontal scroll and elements sticking out of the viewport |
| `clipped` | text clipped by its own box (ellipsis or hard cut) |
| `tapTargets` | interactive elements under 44 px — **mobile only, see the caveat below** |
| `naming` | interactive elements with no accessible name (honours `aria-label`, `for=`, and wrapping `<label>`) |
| `transparent` | children of a just-opened panel that are not fully opaque — the TOOLBAR-MENU-VOID stagger check; run with **no settle** |
| `contrast` | text/background contrast below WCAG AA |
| `assets` | images that failed to paint |
| `ids` | duplicate DOM ids |
| `covered` | controls whose centre is covered by something else (scroll- and modal-aware) |

## What this harness cannot do

Real findings were nearly reported from each of these before measurement disproved them —
use `scripts/shot.mjs` for anything in this list:

- **True phone viewports.** `resize_window` clamps at ~606px wide; 390×844 and 320px are only
  reachable through the headless `viewport` step.
- **Coarse-pointer JS paths** (long-press, `matchMedia('(pointer: coarse)')` branches). Desktop
  Chrome reports `pointer: coarse === false` and the MCP exposes no touch emulation, so use
  `SHOT_TOUCH=1` for those.
  **Correction (2026-08):** an earlier version of this doc claimed tap-target *sizing* could not
  be audited in Chrome for this reason. That was wrong — every 44px `min-height` rule in
  `responsive.css` lives under `@media (max-width: 960px)`, i.e. gated on **width**, not pointer
  (the only `(pointer: coarse)` query in the stylesheet hides a `kbd` hint). Chrome at a narrow
  window does apply the touch sizing. What it cannot do is reach 390/320px — and that matters:
  at 606px the app still renders desktop-ish controls, which is why a Chrome run there reported
  22 "violations" where a real 390px run reports 1 on the home screen.
  Separately, the project's 44px rule is deliberately **scoped to controls isolated at a
  container edge**, so a blanket "under 44px" list is still not a bug list.
- **True phone viewports.** `resize_window` clamps at ~606 px wide; it will not reach 390.
  Use the puppeteer `viewport` step for 390×844 / 320 px.
- **Deterministic re-runs in CI.** This harness is interactive by construction.

## Gotchas (each one cost a real debugging detour)

- **A hidden tab is throttled — the harness now guards this for you.** With the tab
  backgrounded, `useFrame` never ticks, so `sceneReady` never flips, the boot loader never
  lifts, and captures return the last painted frame. Every symptom reads like an app hang; it
  cost one false "boot is broken" investigation before the cause (`visibilityState: 'hidden'`)
  was spotted. See [Keeping the tab foregrounded](#keeping-the-tab-foregrounded). **Driving the
  tab by hand (MCP `javascript_tool` without this driver) has no such guard**: probes still run
  and return live store state while `<Canvas>` has never mounted at all (App's phase-1→2 mount
  is two chained `requestAnimationFrame`s), so you get `canvas.length === 0` +
  `window.__three === undefined` + `bootPhase: 'ready'` + no console error. Screenshot (or
  click) first, then probe — and see the **Claude-in-Chrome quirks** section in
  [visual-verification-playbook.md](visual-verification-playbook.md) for the rest of the
  real-tab traps (stale `__three`, swallowed boundary errors, blocked probe output, 7-day
  IndexedDB caches, the two-renderer split, dev-api not hot-reloading).
- **The JS bridge times out at 45 s.** Never `await` a whole scenario over the wire — that is
  why the driver runs detached behind `start()`/`poll()` and only ever blocks briefly.
- **Editing any project file reloads the page.** Vite full-reloads on changes it cannot HMR,
  which wipes `window.__audit` and the app state mid-run. Batch your edits *between* runs, and
  re-`eval` the driver at the top of every call (it is idempotent).
- **Synthetic clicks do not focus.** Dispatched pointer events skip the browser's native focus
  default action, so a "click the search box, then type" sequence typed into `<body>` and the
  keystrokes fired **global shortcuts** instead — which silently jumped the camera to top view
  mid-scenario. The driver now focuses focusable targets after clicking.
- **`elementFromPoint` lies about scrolled-out elements.** An element scrolled below its
  container is not painted at its own rect, so a hit test at its centre returns whatever *is*
  painted there. That reported catalog cards as "covered by the pager" when the two rects did
  not overlap at all. `covered` now skips anything clipped by a scrolling ancestor.
- **A modal scrim covers everything by design.** `covered` scopes itself to the open modal.
- **Run the heavy phases separately.** Chaining `tsc` + `biome` + the full vitest suite in one
  shell command was OOM-killed (exit 137), and it took the Chrome extension down with it —
  costing a reconnect and a fallback run. Sequence them.
- **Drive the real UI, not the store, before believing a finding.** Store actions bypass the
  app's invariants, and three audit "bugs" evaporated when reproduced through the UI: aux
  panels *are* mutually exclusive (`closeAllAuxPanels`) — a direct `setHistoryOpen(true)` just
  skipped the guard; `setFloorFinish` accepts an invented id and renders a fallback; and
  `setQualityTier` accepts a tier that does not exist, resolving `geometryDetail` to
  `undefined` → `seg()` returns NaN → geometry with NaN segments renders as **nothing**
  (a lamp keeps its pole and silently loses its shade). Use `store` steps to set up state
  cheaply, then confirm the finding itself by clicking what a user would click.
- **Check the value space before asserting on it.** Finish ids are `floor-wood-walnut`, not
  `walnut-planks`; render tiers are `performance | medium | high | maximum`, and there is no
  `quality`. Read the source (or click the real control and read back what the store stores).
- **`FurnitureItem` has no room field** (`{id, defId, position, rotation, props}`) — room
  membership is positional. A scenario picking "an item in this room" by `i.room === roomId`
  silently falls back to `items[0]`, which is usually in another room entirely. Select by
  `defId`, or test the position against the room bounds.
