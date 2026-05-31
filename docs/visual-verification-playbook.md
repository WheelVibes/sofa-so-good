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
- `evalFile` is a JS file run **in the page** after `waitMs`. `actionsJson` is a
  JSON array of input actions, run **after** the evalFile.
- Actions: `{type:'drag',from:[x,y],to:[x,y]}`, `wheel:{x,y,dy}`, `click:{x,y}`,
  `type`, `key`, `wait:{ms}`.
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

### The "Where are you?" location modal covers the scene
First-run `LocationPrompt` is gated on **store state**, not localStorage, so the
harness's localStorage seeding does NOT dismiss it. Fix: in your evalFile, call
`window.__store.getState().dismissLocationPrompt()` before screenshotting.
(`sofa.helpHint.dismissed` localStorage handles the *help* hint, not this.)

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

### Editing source mid-session triggers HMR
Vite hot-reloads your edits into the running server, so you usually don't need to
restart after a code change — but a change to `main.tsx`'s startup block may need
a full reload (the harness does a fresh `goto` each run, so it picks it up).

### Decoding Draco GLBs outside the browser is painful
Don't try to parse Draco-compressed GLBs in Node (DRACOLoader wants a Worker;
the stdlib `glb_analysis.py` can't decode Draco geometry, only the container).
The browser already has Draco wired — do geometry probing in-page via an
evalFile that loads through the app's own loader, not in a standalone script.

## A known-good template

```js
// /tmp/vf.mjs — run: node scripts/shot.mjs /tmp/out.png 13000 /tmp/vf.mjs '<actions>'
(async () => {
  const S = () => window.__store.getState();
  S().dismissLocationPrompt();
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
