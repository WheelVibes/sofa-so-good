# Visual verification playbook

How to actually drive this app, take useful screenshots, and review them — the
rules, the gotchas, and the fixes found the hard way. **Read this before doing
visual verification, and update it whenever you find a new solution to an
interaction problem** (see the rule in CLAUDE.md). Treat every entry below as a
landmine someone already stepped on so you don't have to.

## The harness

`node scripts/shot.mjs <out.png> [waitMs] [evalFile] [actionsJson]`
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

### `focusOn([x,z])` doesn't frame the item well
`focusOn` recenters but keeps a high/far orbit angle, often pointing past a
single placed item. To actually see the item: after focusing, drive the camera
with actions — `wheel` dy negative to zoom in, then a vertical `drag` from high
to low screen-Y to tilt down to a side view. Example that yields a usable
profile:
`[{"type":"drag","from":[700,160],"to":[700,520]},{"type":"wait","ms":400},{"type":"wheel","x":700,"y":400,"dy":-400},{"type":"wait","ms":1200}]`
Tune the drag magnitude per scene; large vertical drags tilt more.

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

### Parallel worktree agents fight over the dev server
Subagent worktrees live under `.claude/worktrees/` INSIDE the repo: their dev
servers take 5173/5174 first, and their builds/file churn spam your Vite watcher
(page reloads, dropped connections). Run your own server on a fixed port
(`npm run dev -- --port 5199 --strictPort`) and point the harness at it with
`SHOT_URL=http://localhost:5199/`.

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

## A known-good template

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
