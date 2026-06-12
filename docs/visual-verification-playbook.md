# Visual verification playbook

How to actually drive this app, take useful screenshots, and review them — the
rules, the gotchas, and the fixes found the hard way. **Read this before doing
visual verification, and update it whenever you find a new solution to an
interaction problem** (see the rule in CLAUDE.md). Treat every entry below as a
landmine someone already stepped on so you don't have to.

---

## Interaction-test ladders (required policy, 2026-06-12)

Scenarios are not just debugging aids — they are the app's interaction-test suite,
kept in `scripts/scenarios/`.

- **Every feature gets a ladder of scenarios, simple → complex.** Simple: the feature
  opens, renders, and is correctly flag/tier-gated. Complex: full multi-step journeys
  through the feature AND its interactions with the rest of the app — overlay/modal
  layering and ordering, Simple↔Pro mode switches, mobile viewport (`viewport` step),
  and adjacent features that share screen space or state.
- **No new feature ships without its own ladder.** Build the scenarios alongside the
  feature and run them as part of visual verification. The motivating failure class:
  sequencing/layering bugs invisible to unit tests — e.g. a clean-profile boot where
  one first-run overlay (onboarding) could hide another (product tour).
- **Existing features** are being back-filled feature-by-feature down the
  `FEATURE_FLAGS` list — tracked as `IXT-SUITES` in `TASKS.md`. When you touch a
  feature that has no ladder yet, add at least its simple rungs in the same change.
- Name files `<feature>-<rung>.json` (e.g. `pano-tour-simple.json`,
  `pano-tour-journey.json`); keep each scenario focused and re-runnable on a clean
  profile (`first-run.json` is the worked example).

## Scenario mode (recommended — use this for anything multi-step)

**Scenario mode** is the primary way to drive complex, multi-step user journeys
headlessly. It runs an ordered list of named steps in a single browser session
and produces numbered screenshots. It replaces the legacy blind-timeout + eval
pattern for everything more than a one-liner.

```
node scripts/shot.mjs --scenario <file.json|file.mjs> [--out-dir <dir>]
```

Example:
```
node scripts/shot.mjs --scenario scripts/scenarios/first-run.json --out-dir /tmp/first-run
```

Each step prints `STEP n/N <name> … OK (1.2s)`. A failing step prints the reason,
dumps `<out-dir>/failed-<name>.png`, prints recent page console lines, and exits
non-zero — instant post-mortem, no silence.

The scenario `url` field sets the default target URL, but the `SHOT_URL` env var
takes precedence when set — always pass `SHOT_URL` when running someone else's
scenario, since scenarios hardcode their author's dev-server port.
Default localStorage is **empty** in scenario mode (so first-run flows trigger
naturally). Override with `SHOT_INIT_LS`.

### Timing contract — why scenarios beat blind waits

**Known pitfall (fixed in scenario mode):** the legacy harness fires `page.evaluate`
and then waits a fixed `waitMs` offset. Any `setTimeout` / async work kicked off
*inside* the eval fires *after* the screenshot — this burned a previous session
where an animation callback ran too late. In scenario mode, steps are strictly
sequential and awaited. Use `waitFor` steps to synchronise with async work instead
of guessing a delay.

**Rule:** prefer `waitFor` over `wait` wherever possible. `wait` is only for
unavoidable render-settle delays after a confirmed state change.

### Step types reference

All steps accept optional `name` (default `<type>-<index>`) and `timeout` (default 15 000 ms).

Two equivalent input formats are supported — **keyed** (recommended in JSON files)
and **typed** (useful for programmatic generation):

| Step type | Keyed form (JSON) | Description |
|---|---|---|
| `eval` | `{"eval": "window.x=1"}` or `{"eval": {"file": "path.mjs"}}` | Run JS in page. Returns when expression returns — use `waitFor` to sync async side-effects. |
| `waitFor` | `{"waitFor": {"css": ".selector"}}` | Wait until condition. See variants below. |
| `click` | `{"click": {"text": "Get started"}}` or `{"click": ".btn"}` | Click element by text (deepest match) or CSS selector. |
| `drag` | `{"drag": {"from": [x,y], "to": [x,y]}}` | Canvas left-button drag. |
| `rdrag` | `{"rdrag": {"from": [x,y], "to": [x,y]}}` | Canvas right-button drag. |
| `wheel` | `{"wheel": {"x": 800, "y": 500, "dy": -400}}` | Mouse wheel. |
| `key` | `{"key": "Escape"}` | Keyboard key press. |
| `type` | `{"type": "type", "text": "hello", "x": 0, "y": 0}` | Type text (click first if x/y given). |
| `select` | `{"select": {"selector": "select", "value": "kitchen"}}` | Native `<select>` value + change event. |
| `wait` | `{"wait": 1000}` | Fixed delay (ms). Only when waitFor cannot help. |
| `screenshot` | `{"screenshot": "step-name"}` | Save `<NN>-<name>.png` to `--out-dir`. |
| `store` | `{"store": {"action": "setUiMode", "args": ["pro"]}}` | Call a store action. |
| `viewport` | `{"viewport": {"width": 390, "height": 844}}` | Resize viewport (e.g. mobile). |

**`waitFor` condition variants:**
```json
{"waitFor": {"css": ".modal-overlay"}}            // element appears (default)
{"waitFor": {"css": ".spinner", "visible": false}} // element disappears
{"waitFor": {"text": "Get started"}}               // page text contains string
{"waitFor": {"store": "state.tourOpen === true"}}  // store predicate (JS expression)
{"waitFor": {"storeExists": true}}                 // window.__store is defined
```
Each `waitFor` accepts `timeout` (ms) and `failMessage` overrides.

### Store-injected fixtures must match the real types

`eval` strings bypass TypeScript — `setItems([...])` with the wrong shape
(e.g. `pos`/`rot` instead of `position: [x, z]`/`rotation`) doesn't error at
injection; it crashes far away at render/derive time (a `position[0]` read in
`spendByRoom` took down `BudgetPanel` and looked like an app bug). Check the
real type (`FurnitureItem` in `src/furniture/types.ts`) before hand-writing
fixtures, place items at coordinates inside an actual room (origin `[0,0]` is
a plan corner), and set a daylight hour (`setManualHour(13)`) or screenshots
come out near-black.

### Known headless limitations for scenario steps

- **R3F raycasts don't fire for synthetic DOM events** — `click` by text/selector
  clicks a real DOM element fine, but clicking the Three.js canvas does NOT trigger
  `onPointerDown`/`onClick` on 3D objects (meshes). Use store actions (`store` step)
  to manipulate scene state programmatically.
- **Scroll + keyboard navigation inside canvas** — works via `key` steps (keyboard
  events reach the canvas). Orbit/zoom via `drag`/`rdrag`/`wheel` also work (real
  CDP pointer input, not synthetic).
- **Geolocation is unavailable headless** — `navigator.geolocation.getCurrentPosition`
  calls the error callback silently. Use `store: dismissLocationPrompt` or
  `click: "Skip — use default location"` instead.

### Scenario template

Copy this skeleton, fill in the steps:

```json
{
  "name": "my-flow",
  "url": "http://localhost:5211/",
  "steps": [
    { "name": "store-ready", "waitFor": { "storeExists": true }, "timeout": 30000 },
    { "name": "dismiss-overlays", "eval": "const s = window.__store.getState(); s.endTour?.(); s.setOnboardingOpen?.(false); s.dismissLocationPrompt?.()" },
    { "name": "shot-start", "screenshot": "start" },
    { "name": "click-something", "click": { "text": "Button label" } },
    { "name": "result-visible", "waitFor": { "css": ".result-class" } },
    { "name": "shot-result", "screenshot": "result" }
  ]
}
```

### Worked example — first-run scenarios

Two scenarios cover the first-user experience (port 5212):

**`first-run.json`** — carousel → choose the guided tour → tour → location prompt → scene:
```bash
npm run dev -- --port 5212 --strictPort &
for i in $(seq 1 30); do sleep 1; curl -sf http://localhost:5212/ >/dev/null && break; done
node scripts/shot.mjs --scenario scripts/scenarios/first-run.json --out-dir /tmp/first-run
node scripts/shot.mjs --scenario scripts/scenarios/first-run-no-tour.json --out-dir /tmp/first-run-no-tour
```

Steps of `first-run.json` (30 total, 8 screenshots):
1. Clears localStorage and reloads → clean session
2. Waits for `window.__store` to exist and `onboardingOpen === true`
3. Screenshots onboarding carousel step 1 (welcome) → "Get started" → step 2 (quick tour) → "Next"
4. Screenshots choices screen → clicks "Take the guided tour"
5. Waits for `onboardingOpen === false`, then `tourOpen === true`
6. Screenshots tour steps 1–3 → "Skip tour" → waits for tour to close
7. Waits for location prompt (`.modal-overlay`) → screenshots → clicks "Skip — use default location"
8. Screenshots final furnished scene (no overlays)

**`first-run-no-tour.json`** — carousel → "Enter sandbox" → assert tour never opens → location prompt → scene.
Asserts `tourOpen === false` immediately after the carousel closes.

---

## Legacy mode (one-shot, backward-compatible)

`node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]`

Use this for quick single-frame checks where you only need one screenshot. For
anything that requires multiple screenshots or interaction steps, use scenario mode.

- Software WebGL (SwiftShader) headless Chromium. Slow to first frame — give
  `waitMs` ≥ 8000 for anything that loads a GLB.
- Env: `SHOT_VIEWPORT="W,H"` (responsive breakpoints), `SHOT_TOUCH=1` (emulate a
  touch device — coarse pointer + `hasTouch`), `SHOT_INIT_LS='{…}'` (seed
  localStorage, e.g. `hdb_onboarded`), `SHOT_URL` (target another port — parallel
  agents must run their **own** server on a free port, e.g.
  `npm run dev -- --port 5199 --strictPort`, and never `pkill -f vite`),
  `SHOT_NAV_TIMEOUT` ms (cold Vite transforms under parallel jobs easily blow
  the default 60 s `goto`).
- A dev server with a live HMR socket may never reach `networkidle2`; the harness
  catches the goto timeout and continues (the page has committed — `waitMs` covers
  boot), logging a `[harness] goto…` line. Treat that line as informational.
- `evalFile` is a JS file run **in the page** after `waitMs`. `actionsJson` is a
  JSON array of input actions, run **after** the evalFile.
- Actions: `{type:'drag',from:[x,y],to:[x,y]}`, `wheel:{x,y,dy}`, `click:{x,y}`,
  `type`, `key`, `select`, `wait:{ms}`.
- The harness prints `SHOT_SAVED <path>`, then a `---CONSOLE---` block with the
  **last ~30** page console lines. Your `console.log('PROBE ...')` calls show up
  there — but only the last 30 lines, so if you log in a tight poll loop the
  early ones scroll off. Prefer one summary log at the end.
- `window.__store` (the Zustand store) is exposed in dev. That's your main lever.
- `SHOT_URL=http://localhost:<port>/?…` targets a non-default dev server (run your
  own on a free port with `npm run dev -- --port <port> --strictPort` so you never
  fight another session's server). Query params survive into the page, so an
  evalFile can read variants from `location.search` and one evalFile serves many
  shots. Navigation waits for `networkidle2` with a 120 s timeout — on a slow
  (software-render) box the first cold load can take >60 s, so don't shorten it.

**Legacy timing pitfall:** in legacy mode, `page.evaluate(evalFile)` returns when
the JS expression returns — any `setTimeout` / async work triggered inside fires
*after* the screenshot. If you need to sync on async side-effects, move to scenario
mode with `waitFor` steps.

### A known-good legacy template

```js
// /tmp/vf.mjs — run: node scripts/shot.mjs /tmp/out.png 13000 /tmp/vf.mjs '<actions>'
(async () => {
  const S = () => window.__store.getState();
  S().endTour?.(); S().setOnboardingOpen?.(false); S().dismissLocationPrompt?.();
  // ... import groups / set up items via __store + temp hooks ...
  S().setItems([item]);
  S().focusOn([x, z]);                 // mount + frame the item
  setTimeout(() => {
    // ... act on caches that are now populated ...
    S().focusOn([x, z]);               // re-frame after mutating items
    console.log('PROBE done', JSON.stringify(/* the few values that prove it */));
  }, 3500);
})();
```
Then pass an `actions` array to tilt/zoom to a profile angle, and **look at the
PNG**.

---

## Rules

1. **Review the pixels yourself.** CLAUDE.md requires it — a passing `__vfLog`
   value is NOT verification. Read the PNG with the Read tool and describe what
   you actually see (gap? clipping? floating? facing the right way?). The data
   being right and the render being right are different claims.
2. **Get a side/profile angle for anything about height or contact.** A top-down
   shot hides float/clip/sink. The mattress-on-frame bug was only visible from
   the side. Orbit down before judging vertical relationships.
3. **Clean up after yourself, every time.** Revert temp `main.tsx` hooks
   (`git checkout src/main.tsx`), delete any GLBs you copied into
   `public/assets/ikea/` (they're gitignored but leave a dirty tree), and stop
   the dev server. Confirm `git status` shows nothing you introduced before
   moving on.
4. **Never commit debug hooks or `PROBE` logs.** Strip them before the feature
   commit. (Easiest: keep all temp exposure inside one block in `main.tsx` you
   revert wholesale.)

---

## Gotchas & fixes (the actual time-sinks)

### First-run overlays cover the scene (location modal, onboarding, tour)
Three first-run overlays will obscure your screenshot, and they're gated on
**store state**, not localStorage, so the harness's localStorage seeding does NOT
dismiss them. Worse, they cascade: dismissing the tour *un-suppresses* the
location prompt, so dismissing one at a time means re-shooting. **Always dismiss
all three up front**, as the very first lines of every evalFile, before placing
items or screenshotting:
```js
const st = window.__store.getState()
st.endTour?.()                 // product tour spotlight
st.setOnboardingOpen?.(false)  // first-run onboarding carousel
st.dismissLocationPrompt?.()   // "Where are you?" sun-position modal
```
(`sofa.helpHint.dismissed` localStorage handles the *help* hint, not these.) Note
the foreground "doors" you may see in the room editor are the apartment's door
leaves, not your items — clear `s.items` first if you need an empty room.

In **scenario mode**, you can do this in an `eval` step right after `waitFor storeExists`.

### First-run flow: onboarding carousel comes FIRST; tour is opt-in from the carousel
On a clean profile (no localStorage), the app opens the **onboarding carousel**
first — not the product tour. The carousel's third step ("Where would you like to
start?") has a **"Take the guided tour"** choice. Selecting it closes the carousel
and starts the tour; any other choice leaves the tour alone. The tour is then
available only via Help (?) or ⌘K.

Migration: users with `hdb_tour_done='1'` but no `hdb_onboarded` (who went
through the pre-C268 auto-starting tour) see the carousel once on their next
visit; after dismissal `markOnboarded()` sets `hdb_onboarded='1'` and future
visits are silent.

`first-run.json` walks carousel → "Take the guided tour" → tour steps → location
prompt → final scene. `first-run-no-tour.json` walks carousel → "Enter sandbox"
→ asserts `tourOpen === false` → location prompt → final scene.

### Pro-tier features are OFF at boot (the app starts in Simple mode)
The store boots with `uiMode: 'simple'`, which forces every `tier: 'pro'` flag
off — so a pro-gated overlay/tool/panel you're verifying silently never mounts
(no error, no DOM, clicks fall through to whatever is behind it). Call
`st.setUiMode('pro')` in the evalFile right after dismissing the overlays
(it re-resolves the flag map) before exercising any pro feature.

In **scenario mode**: `{"store": {"action": "setUiMode", "args": ["pro"]}}`.

### `focusOn([x,z])` doesn't frame the item well
`focusOn` recenters but keeps a high/far orbit angle, often pointing past a
single placed item. To actually see the item: after focusing, drive the camera
with actions — `wheel` dy negative to zoom in, then a vertical `drag` from high
to low screen-Y to tilt down to a side view. Example that yields a usable
profile:
`[{"type":"drag","from":[700,160],"to":[700,520]},{"type":"wait","ms":400},{"type":"wheel","x":700,"y":400,"dy":-400},{"type":"wait","ms":1200}]`
Tune the drag magnitude per scene; large vertical drags tilt more. **Check which
way your drag tilted**: from the default dollhouse pose a downward drag can pin
the camera to straight top-down (polar → 0) instead of a profile — if your shot
comes out plan-view, drag the *other* way (low→high screen-Y, e.g.
`from:[700,520] to:[700,230]`) to tilt toward the horizon, then wheel-zoom in.
Also set a daytime hour first (`setManualHour(12)`) or a night scene hides
geometry faults; and place the item with `rotation: 0` facing the camera side
you'll shoot from so drawer fronts/handles are visible.

In **scenario mode**: use `drag`/`wheel`/`store` steps.

### Items must be on-screen to mount (and to run their effects)
GLB geometry effects (footprint, support-plane caches) run in `GltfModel`'s
`useEffect` — which only runs once the component **mounts**, i.e. the item is in
the render. If you place an item far from the camera and never focus, it may not
mount and its caches stay empty. Place items near the camera target / call
`focusOn` right after `setItems`, then wait.

### Module functions aren't on `window`
Only `__store` (and a few `__arrange*` helpers) are exposed. To call a module
function (e.g. `importGroup`, `combineOnto`, a cache getter), add a TEMP hook in
`src/main.tsx` inside the `if (import.meta.env.DEV)` block:
```ts
const { combineOnto } = await import('./furniture/ikea/stacking');
(window as any).__combineOnto = combineOnto;
```
Revert it before finishing. Do NOT try `await import('/src/...')` from the
evalFile — the path/MIME resolution fails in the page context.

### IKEA GLBs need their blobs in IDB / over HTTP
To exercise IKEA import without the scraper UI: copy a scraped group folder into
`public/assets/ikea/<slug>/` (Vite serves it), then in the evalFile fetch
`metadata.json` + each variant `glb`, wrap them in `File` objects, and call
`window.__importGroup(meta, files)` (the same path `ikeaLive.ts` uses). Pattern:
```js
const meta = await (await fetch(`/assets/ikea/${slug}/metadata.json`)).json();
const files = [];
for (const v of meta.variants) { if (!v.glb) continue;
  const blob = await (await fetch(`/assets/ikea/${slug}/${v.glb}`)).blob();
  files.push(new File([blob], v.glb, { type: 'model/gltf-binary' })); }
const { def } = await window.__importGroup(meta, files);
```

### Caches that populate on render are racy in a one-shot eval
A geometry cache (e.g. support plane) is filled by the render effect, so reading
it immediately after `setItems` returns null. Either (a) **poll** for it before
acting (`setTimeout` loop checking the getter, then proceed), or (b) wait a fixed
generous delay (≥ 3.5 s after the item is placed AND focused) before the action
that depends on it. Polling is more robust; log only the final state.

In **scenario mode**: use `{"waitFor": {"store": "!!window.__myCache"}}` or a
`wait` step with a generous delay.

### Parallel worktree agents fight over the dev server
Subagent worktrees live under `.claude/worktrees/` INSIDE the repo: their dev
servers take 5173/5174 first, and their builds/file churn spam your Vite watcher
(page reloads, dropped connections). Run your own server on a fixed port
(`npm run dev -- --port 5199 --strictPort`) and point the harness at it with
`SHOT_URL=http://localhost:5199/`.

In **scenario mode**: set `"url": "http://localhost:5199/"` in the scenario JSON.

### IndexedDB does NOT persist across shot.mjs runs
Each `shot.mjs` invocation launches a **fresh headless browser profile**, so
anything written to IndexedDB in one run (uploaded assets, packs) is gone in the
next — a "persist in run 1, verify hydration in run 2" plan silently probes an
empty DB. Verify persistence/hydration round-trips **within a single run**:
persist, then simulate the reboot in-page (clear the relevant store slice +
session caches, call the hydrator, e.g. `hydrateUserAssets()` via a temp
`main.tsx`/`bootstrap.ts` hook) and probe after that.

### The dev server dies mid-session
Long runs / multiple shots can leave the Vite server down (`ERR_CONNECTION_
REFUSED`). Before each shot batch, `curl -sf http://localhost:5173/` and restart
if needed. Don't assume it's still up from a previous step. Start it detached and
poll the port until ready:
```bash
(npm run dev >/tmp/dev.log 2>&1 &)
for i in $(seq 1 25); do sleep 1; curl -sf http://localhost:5173/ >/dev/null && break; done
```
`pkill -f vite` exits non-zero (144) when it signals itself — that's harmless,
not a failure.

### `goto` times out on `networkidle2` in an offline sandbox
Hung third-party fetches (Poly Haven/CDN requests that black-hole instead of
failing) keep the network "busy" forever, so puppeteer's `networkidle2` never
fires even though the app booted fine. The harness now catches that navigation
timeout and continues (relying on `waitMs`) — if you see
`[harness] goto networkidle2 timed out`, the shot is still valid.

### Lazy panels mount seconds after their store flag flips
Modals/panels are `lazy()`-loaded (PERF5): `setSmartStartOpen(true)` flips the
store immediately, but the chunk can take several seconds to mount under the
headless profile — a `document.querySelector('.modal-overlay')` probe right
after is a false negative, and a keypress sent too early hits the un-mounted
state. Poll for the DOM node (or the editor's `.plan-screen`) before acting,
and put generous `wait` actions before synthetic keys. Also note `setInterval`
ticks get throttled while the page is busy compiling shaders — log
`performance.now()` deltas, not your tick count.

In **scenario mode**: use `{"waitFor": {"css": ".modal-overlay"}}` instead of
a fixed `wait`.

### Editing source mid-session triggers HMR
Vite hot-reloads your edits into the running server, so you usually don't need to
restart after a code change — but a change to `main.tsx`'s startup block may need
a full reload (the harness does a fresh `goto` each run, so it picks it up).

### Decoding Draco GLBs outside the browser is painful
Don't try to parse Draco-compressed GLBs in Node (DRACOLoader wants a Worker;
the stdlib `glb_analysis.py` can't decode Draco geometry, only the container).
The browser already has Draco wired — do geometry probing in-page via an
evalFile that loads through the app's own loader, not in a standalone script.

### An isolated room renders as a closed box you can't see into
The per-room editor (`enterRoomEditor(roomId)`) renders only that room's walls.
A naive "render the matched walls" gives a fully-enclosed box — from any orbit
angle the near walls occlude the interior, so the first shot looks like a blank
cube. Two things make it usable, both already in `apartment/RoomShell.tsx` /
`roomShell.ts`: (1) **clip shared walls** to the room footprint span (the
bedroom north wall is one 9 m segment shared by all three bedrooms — render the
whole thing and you get the neighbours' windows too), and (2) **hide each wall
when the camera is on its outward side** (camera-facing wall reveal, a per-frame
`mesh.visible` toggle). If you add a similar isolated view, do both — and frame
the camera on the room centre (`OrbitCamera` keys this off `roomEditor.roomId`),
or a far room like `livingDining` loads off-screen to one side.

### Drag-and-drop won't work on a `<button>` drop target
A native `<button>` makes an unreliable drop zone — browsers mishandle drag
events on it and `dataTransfer.items` / `webkitGetAsEntry()` may not populate, so
dropped **folders** silently do nothing. Use a `<div>` with `onDragOver`
(`preventDefault`) + `onDrop`; put any picker button *inside* it. The harness has
no native drop action, but you can verify the handler wiring + loose-file
fallback in an evalFile by dispatching a synthetic event:
`zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))`
where `dt` is a `DataTransfer` with `dt.items.add(new File(...))`. A synthetic DT
has no real `webkitGetAsEntry` entries, so it exercises the `dt.files` fallback,
not directory recursion — unit-test the recursion separately with faked
`FileSystemEntry` objects.

### Emulating touch (long-press, coarse-pointer gates) — `SHOT_TOUCH=1`
Touch-gated code (`matchMedia('(pointer: coarse)')`, `body.mobile` long-press)
doesn't run under the default headless desktop profile. `SHOT_TOUCH=1` sets
Puppeteer's `isMobile + hasTouch`, so `(pointer: coarse)` matches and touch
handlers attach. Synthesize gestures from the evalFile with real `Touch` /
`TouchEvent` objects on the canvas (`new Touch({identifier, target, clientX,
clientY})`). Project a world position to screen px via the exposed camera
(`window.__three.camera`, dev-only): `p = new cam.position.constructor(x,y,z);
p.project(cam)` → `cx = (p.x+1)/2*w`, `cy = (1-p.y)/2*h`.

In **scenario mode**: use `{"viewport": {"width": 390, "height": 844}}` to
switch to a mobile viewport mid-scenario.

**Limitation — R3F won't raycast a *synthetic* mouse/contextmenu event headless.**
A dispatched `contextmenu`/click reaches the canvas and your DOM handlers fire,
but `@react-three/fiber`'s pointer system doesn't resolve a hit for it under
software-WebGL, so item-level `onContextMenu`/`onClick` (e.g. opening the context
menu) won't trigger from a faked event. Verify the parts you *can*: that the
handler fires, the event carries the right `clientX/Y`+`offsetX/Y`, and that
move-cancel logic works (`store.contextMenu` / a one-shot `contextmenu` listener
flag). The raycast→handler link is the same path a real right-click uses, so
proving the synthesized event matches a real one is sufficient. (This is the same
class of issue as the "orbit drag/zoom emulation is unreliable headless" note.)

### drei TransformControls gizmos CAN be dragged headless (unlike R3F raycasts)
The R3F-raycast limitation above does NOT apply to drei's `TransformControls`:
it raycasts its own fat picker meshes from real pointer events on the canvas, so
the harness `drag` action (real CDP mouse input) grips a gizmo handle fine under
SwiftShader — dragging the GLB-designer translate arrow wrote the snapped value
into the numeric field end-to-end. Two gotchas: (1) **compute drag coordinates
in the PNG's REAL pixel space** — screenshots are 1600×1000 (`SHOT_VIEWPORT`
default) but the Read tool may display them downscaled 2×, and coords picked off
a *previous* shot are stale the moment the camera/Bounds refit moves (a missed
drag silently orbits the camera instead, which is itself the tell); (2) take a
fresh framing shot first, read the gizmo origin off `file <png>` dimensions,
then aim for a point ~⅔ along the arrow shaft.

### Verifying a new-window exporter (report / BOQ / shopping list)
The harness screenshots only the original page, so a `window.open(…) → document.
write(html)` exporter renders off-screen. Patch `window.open` in the evalFile to
redirect the written HTML into the **main** document, then click the real menu
item — this exercises the whole opener path (flag gate, dynamic import, data
assembly, write) and leaves the export in the page for the screenshot:
```js
window.open = () => ({
  document: { write: (h) => { document.open(); document.write(h); document.close(); },
    close() {} }, focus() {}, close() {},
});
```
Scroll the resulting plain-HTML page with `{type:'key',key:'End'}` for the footer.

### Driving controlled React inputs from an evalFile
Setting `el.value = …` directly does nothing — React's controlled input snaps
back because no `input` event fired through its tracker. Use the **native value
setter** then dispatch `input` (React listens for `input`, mapping it to
`onChange`); for a `<select>` use `HTMLSelectElement.prototype`'s setter +
a `change` event (or the harness `select` action when targeting by selector):
```js
const setVal = (el, v) => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, String(v))
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
setVal(document.querySelector('input[aria-label="cylinder position X"]'), 0.15)
```
Target inputs by `aria-label` (stable, no test-ids needed). And **poll for the
panel that renders the input** before setting it — after clicking a button that
changes selection, a fixed 300 ms sleep is racy under the slow headless profile
(this intermittently broke the GLB-designer CSG verification); poll for the
specific `input[aria-label=…]`/`select[aria-label=…]` node instead.

In **scenario mode**: use `waitFor: {css: "input[aria-label=...]"}` before the
`eval` step that sets the value.

### three.js `Color` cannot parse `oklch()` theme tokens
The CSS token vocabulary resolves to `oklch(…)` values, and `new THREE.Color(cssValue)`
throws `Unknown color model oklch(...)` — so an **in-scene** (mesh/material) use of a theme
colour like `--accent` must convert it to `rgb()` first. `getComputedStyle().color` does NOT
help (browsers preserve `oklch` in computed style); the working conversion is a 1×1 canvas
readback: set `ctx.fillStyle = cssValue`, `fillRect`, then `getImageData` for the rgb bytes.
DOM overlays (e.g. `FinishDragOverlay`) can use the tokens directly — only three.js parsing
is affected.

### Driving a native `<select>` dropdown
A click at the select's coordinates only *opens* the OS popup (which Chromium
renders outside the page, so you can't click an option by pixel). Use the
`select` action instead: `{type:'select', selector:'.toolbar-room-select',
value:'kitchen'}` — it calls Puppeteer's `page.select`, which sets the value
**and fires the `change` event** so React's `onChange` runs. `selector` defaults
to the first `<select>` on the page. To *prove* the handler ran (not just that
the value was set), bind the select to store state (`value={storeValue}`) — a
controlled select snaps back unless `onChange` actually committed, so a screenshot
showing the new label is end-to-end proof. (That's how the room-editor room
switcher was verified: selecting `kitchen` re-rendered the kitchen scene.)

In **scenario mode**: `{"select": {"selector": ".toolbar-room-select", "value": "kitchen"}}`.
