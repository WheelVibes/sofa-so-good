# Code review — round 7 (R7-O), 2026-09-25

Adversarial review of `git diff 2f621182..origin/feat/photoreal-round7` — 17 commits,
**v0.35.12.3 → v0.35.17.0**, ~14 200 insertions across 376 files, written by roughly ten agents
working in parallel (several early ones sharing one worktree and one git index).

**Ground truth for this review.** `npx tsc --noEmit` → clean. `npm test` → **1185 files passed /
1 skipped, 11 669 tests passed / 2 skipped** (80 s). `npm run deadcode` (knip) → clean. No browser
and no dev server were started — this is a static review, so anything that needs a live GL context
or a real phone is filed under PLAUSIBLE, not CONFIRMED.

**Out of scope by instruction** (recorded product calls, not findings): (a) whether a showroom
visitor inherits the sender's approximate location; (b) `aiPhotoreal` not being on the view-only
denylist.

**Overall.** The branch is in better shape than its provenance predicts. The showroom gate is
genuinely layered (`canEditScene` + `resolveFlags` denylist + `enterRoomEditor` +
`setFloorPlanEditing` + the ⌘K group filter + toolbar/menu gating), the four-way UI-slot question
(checklist / showroom badge / PWA card / room readout) *was* thought about and mostly holds, and
the two-route share design is sound. The serious findings are concentrated in the new graphics
systems, not in the cross-agent UI integration the brief predicted would break.

Findings are split into **CONFIRMED** (traced in the code, with the mechanism established from the
installed dependency source) and **PLAUSIBLE** (suspicious, needs a runtime check before acting).

---

## CONFIRMED

### C1 — HIGH: cloning a lightmapped material in `attachRoomProbes` silently deletes its baked GI

**Where.** `src/scene/lighting/roomProbeAttach.ts:335` (`const copy = original.clone?.()`), against
`src/scene/visibilityLightmap.ts:889` and `:1074`.

**Mechanism (traced, not inferred).** `Material.clone()` is
`new this.constructor().copy( this )` (`node_modules/three/src/materials/Material.js:889-893`).
`Material.copy()` copies a fixed list of declared fields plus
`this.userData = JSON.parse( JSON.stringify( source.userData ) )` (`Material.js:977`). It does
**not** copy `onBeforeCompile` or `customProgramCacheKey` — those are *own properties assigned on
the instance*, which is exactly how `applyVisibilityLightmap` installs the baked-GI patch
(`visibilityLightmap.ts:889` assigns `material.onBeforeCompile`; `:1074` assigns
`material.customProgramCacheKey`).

So in the shared-material branch of `attachRoomProbes`:

```ts
const copy = original.clone?.()          // ← loses onBeforeCompile + customProgramCacheKey
attachRoomProbe(copy, a.probe, texture, mix)
a.mesh.userData.roomProbeOriginalMaterial = a.mesh.material
a.mesh.material = copy as unknown as Material
```

`attachRoomProbe` then captures `prevOnBeforeCompile = copy.onBeforeCompile`, which is three's inert
prototype method, and composes the box-projection patch on top of *nothing*.

**Failure scenario.** `realistic` tier, default 4-room flat, `roomProbes` on (default `true`).
A glossy shell/fitting material instance is used by meshes in two different rooms — the module's own
docblock names the case ("a chrome tap material shared by both bathrooms"), and the R7-L rationale
states the kitchen and both bathrooms all default to `wall-tile-white` at an effective roughness of
0.136. Those meshes take the clone branch, get a per-room reflection, and lose the Cycles irradiance
term: they render with the analytic fill instead of the bake — brighter, flatter, and out of step
with the adjoining un-cloned walls. The surfaces the feature exists to improve are the ones it
degrades. It is also invisible in a screenshot in the same way a missing lightmap set is: it looks
like a correctly-working subtle lighting difference.

Two secondary consequences of the same line:

- the JSON round-trip gives the clone *dead copies* of `visLampUniform` / `visExteriorUniform` /
  `visDayUniform` / `visNightUniform` / `visSpillUniform`, so they are no longer the live objects
  registered in `lampUniforms` &co.; and
- the clone keeps `userData.visLightmap === true`, so a later `detachVisibilityLightmap`
  (`visibilityLightmap.ts:1102`) believes the clone is patched and calls `.delete()` on uniform
  objects that were never in those Sets.

**Why no test caught it.** `roomProbeAttach.test.ts:196` (`CLONES a material shared across two
rooms`) builds a bare `new MeshStandardMaterial({ roughness })` with no `onBeforeCompile`, so the
drop is unobservable. The `COMPOSES with an existing onBeforeCompile` test at `:104` uses a plain
object literal and never goes through `clone()`.

**Suggested fix.** Either (a) carry the hooks across explicitly in `attachRoomProbes` before calling
`attachRoomProbe` — `copy.onBeforeCompile = original.onBeforeCompile;
copy.customProgramCacheKey = original.customProgramCacheKey;` and re-point the copied `userData.vis*`
entries at the *original's* live uniform objects — or (b) avoid the clone entirely by moving the
three box uniforms off the material and onto a per-mesh `onBeforeRender` write. (a) is the small
change; (b) removes the whole class of problem and also fixes P2. Whichever is taken, add a test
that clones a *real* `MeshStandardMaterial` that has been through `applyVisibilityLightmap` and
asserts the clone still patches `visMap`.

---

### C2 — HIGH: the new in-app "Reduce motion" control reaches no CSS, and both of its captions are false

**Where.** `src/state/storage/appearancePrefs.ts:57`; `src/styles/app.css:400`;
`src/ui/toolbar/AppearancePopover.tsx:143-150`; `src/ui/motionPreference.ts`.

**Mechanism.** U4 converted every *JavaScript* `matchMedia('(prefers-reduced-motion: reduce)')`
call site to `shouldReduceMotion()` — that part is real and complete (a `matchMedia` sweep of `src/`
finds no remaining reduced-motion query outside `motionPreference.ts`). But the app's principal
motion suppressor is **CSS**, not JS:

```css
/* src/styles/app.css:400 */
@media (prefers-reduced-motion: reduce) {
  /* "near-instant transitions + animations across every surface
     (bottom-sheets, fades, popovers, toasts, …)" */
  *, *::before, *::after { animation-duration: 0.01ms !important; … }
}
```

plus `parts.css:417`, `LoadingOverlay.tsx:194`, `TierChangeVeil.tsx:101`. Nothing writes the
preference to the DOM: `watchAppearancePrefs` persists `reduceMotion` into the localStorage record
(`appearancePrefs.ts:53`) but still calls `applyAppearance(s.theme, s.modePref)` (`:57`) with no
third argument, and a repo-wide grep finds no `data-reduce-motion` attribute or equivalent hook.

**Failure scenarios (both directions, both contradicting shipped copy).**

1. OS reduce-motion **off**, user picks **Reduce**. The popover says *"Animations and transitions
   are minimised **everywhere in the app**"* (`AppearancePopover.tsx:148`). In fact every CSS
   transition and keyframe still plays at full duration — sheets, popovers, toasts, the `pop`
   entrance on `.showroom-badge` / `.pwa-install-card`, `.stagger-in`. Only the handful of JS sites
   (`useAnimatedNumber`, `useFlip`, `useCollapseTransition`, `useAmbientFx`, `EditConfirmBar`,
   `ModeSwitchCrossfade`, `TierChangeVeil`, the boot-phrase rotator, the new orbit pill's
   cross-fade) respond. This is the *primary* user story for the feature — the user "who doesn't
   know their OS exposes this setting" — and it does not work.
2. OS reduce-motion **on**, user picks **Full**. The caption says *"Animations play in full, even if
   your device asks to reduce motion"* (`:149`). The `@media` block still fires and zeroes
   everything. The documented "explicit choice WINS over the OS setting either way" contract
   (`appearanceSlice.ts:13-20`, `motionPreference.ts:21-26`) holds for JS and is violated for CSS.

**Suggested fix.** Write the resolved preference to `<html>` from `applyAppearance` (and from the
pre-paint bootstrap in `index.html`, so there is no flash), e.g. `data-reduce-motion="on"|"off"|""`,
then rewrite each CSS block as
`@media (prefers-reduced-motion: reduce) { html:not([data-reduce-motion="off"]) … }` plus a parallel
`html[data-reduce-motion="on"] …` rule. Add a `styleGuards.test.ts` assertion that no
`prefers-reduced-motion` block in `src/styles/` lacks the `data-reduce-motion` escape, so the next
CSS motion rule cannot silently re-open the gap.

---

### C3 — HIGH: a failed KTX2 transcode has no PNG fallback, and the PNG is not precached

**Where.** `src/scene/lightmapTexture.ts:100-107` (the `onError` callback) and `:116-125` (the
dispatch); `vite.config.ts:86` (`globIgnores: ['assets/lightmaps/*.png']`).

**Mechanism.** The module's own docblock states the contract:

> a `.ktx2` entry with no usable transcoder silently retries the sibling `.png`, which the bake
> emits alongside for exactly this reason.

The implementation honours that for only **one** of the two ways a transcoder can be unusable.
`load()` falls back when `getKtx2Loader()` returned `null` (`:118-124`) — the "no renderer has bound
one" case. When a loader *is* bound but the transcode itself fails, the error callback does nothing
but warn:

```ts
(err) => {
  onWarn?.(`lightmaps: KTX2 transcode failed for ${url} (${String(err)}) — no map applied`)
}
```

and `onWarn` is wired only under `import.meta.env.DEV` (`VisibilityLightmaps.tsx`), so in production
it is completely silent. The empty `CompressedTexture` shell allocated at `:70` stays at
`version === 0` forever and the material samples black — i.e. no baked GI at all on that surface.

**Failure scenario.** This is precisely the environment the docblock names. In the
Electron/Capacitor/`file://` packages a renderer *does* exist, so `detectSupport` succeeds and
`getKtx2Loader()` is non-null; what fails is fetching `public/basis/basis_transcoder.wasm` (or
spawning the blob-URL worker under a `file:` origin). Result: all 229 lightmaps fail to transcode,
the PNG fallback never runs, and the flat renders with no baked GI — the exact "invisible in a
screenshot, looks like a correctly-working subtle lighting term" failure the fallback was written
to prevent, with no production log line. The same applies to any deploy that serves `.wasm` with a
wrong MIME type or loses `public/basis/` from the build.

The offline/PWA claim compounds it: `globIgnores` removes the PNG set from the precache, so an
installed PWA that hits a transcode error offline would have no local fallback to retry even once
the fallback exists. (The claim that the transcoder wasm *is* precached does check out — it matches
`**/*.{js,css,html,svg,wasm,…}` in `globPatterns` — so that is a second-order risk, not the primary
one.)

**Suggested fix.** In the `onError` handler, drop the URL from the cache, increment
`counts.fallback` and load the PNG sibling into the same shell (or replace the cache entry and
re-issue `onDecode()`). Log in production, not just DEV — a silent total loss of the bake is worth a
`console.warn`. Add a test for "transcode error → PNG sibling is requested" alongside the existing
`warns rather than throws when a transcode fails` (`lightmapTexture.test.ts:126`), which currently
pins the *incomplete* behaviour as correct.

---

### C4 — MEDIUM: the orbit room readout (U6) ships with no feature flag

**Where.** `src/ui/OrbitRoomReadout.tsx:130-132`; mounted unconditionally at
`src/ui/NavCluster.tsx:61`.

```ts
const walkReadout = useFeature('walkRoomReadout')   // gates the WALK variant only
const walkMode = isMobile && walking && walkReadout
const active = cameraMode === 'orbit' || walkMode   // ← orbit path is ungated
```

`walkRoomReadout` was added in R7-K (V14) for the *walk* variant. The original orbit surface
(commit `0fa6bf3d`, v0.35.12.6) never got a flag, and its commit message does not mention one —
`git show 0fa6bf3d -- src/features/flags/registry.ts src/features/flags/types.ts` returns nothing.
This is the shared-index round, so it reads as a genuinely missing piece rather than a decision.

**Why it matters, concretely.** CLAUDE.md's hard rule is explicit ("No feature ships ungated"), and
three practical consequences follow: there is no kill switch if the per-frame `roomAtPoint` lookup
turns out to be hot on a weak device; the surface has no `tier`, so the "test BOTH modes" rule has
nothing to test; and it cannot be classified by `flags/viewOnly.ts` (it *should* stay ON for a
showroom visitor, but today that is a coincidence rather than a recorded decision).

**Suggested fix.** Add `orbitRoomReadout` to `FEATURE_FLAGS` (`tier: 'simple'`, `default: true`,
same rationale as `walkRoomReadout`), gate `active` on it, and add the Simple/Pro test pair.
Alternatively widen `walkRoomReadout` to cover both modes and rename it — but a rename is the larger
change and that flag's registry comment is walk-specific.

---

### C5 — MEDIUM: `statusBarTint.ts`'s duty-cycle guarantee is contradicted by the clamp two lines below it

**Where.** `src/scene/lighting/statusBarTint.ts:105-113` (the claim) and `:196-201` (the code).

The docblock promises:

> the next interval is derived from how long the last readback actually took, so the sampler can
> **never** consume more than `1 / SAMPLE_DUTY_DIVISOR` of the frame budget **however deep the GPU
> queue gets**.

The implementation is:

```ts
const interval = budgeted
  ? Math.min(SAMPLE_INTERVAL_MAX_MS,                                          // 2000
      Math.max(SAMPLE_INTERVAL_MS, lastSampleCostMs * SAMPLE_DUTY_DIVISOR))   // 100, ×50
  : SAMPLE_INTERVAL_MS
```

The `Math.min(2000, …)` ceiling breaks the guarantee for any readback costing more than
2000 / 50 = **40 ms**. At the very cost the same docblock cites as the motivating measurement —
**76 ms** with the 19 fixture lights on — the achieved duty cycle is 76 / 2000 = **3.8 %**, not the
stated ≤ 2 %, and the bound degrades linearly from there (a 200 ms readback would be 10 %). The
clamp is defensible as a staleness bound; the words "never" and "however deep the GPU queue gets"
are simply wrong. Same class as the `decoders.ts` KTX2 claim this round already fixed.

**Compounding: the duty-cycle branch has no test.** `statusBarTint.test.ts:179` (`keeps the 100 ms
floor when the readback is free`) is the only interval test and passes `source: undefined`.
happy-dom reports neither `(pointer: coarse)` nor `(display-mode: standalone)`, so
`statusBarTintIsVisible()` is always `false` in the suite (`:148` asserts exactly that), which
forces `lastSampleCostMs = 0` on every path. The `lastSampleCostMs * SAMPLE_DUTY_DIVISOR`
expression is never evaluated with a non-zero cost anywhere in the suite.

**Suggested fix.** Either raise/remove `SAMPLE_INTERVAL_MAX_MS` and state the staleness trade, or
reword the docblock to "at most 1/50 of wall time up to a 2 s staleness ceiling, above which the
ceiling wins". Add a test that stubs `matchMedia('(pointer: coarse)')` true and injects a canvas
whose `getImageData` burns measurable time, then asserts the next accepted `now` is ≥ cost × 50
(clamped) — that also gives the flag its first real coverage.

---

### C6 — MEDIUM: `LocationPrompt`'s V5 docblock asserts the opposite of what the share encoder does

**Where.** `src/ui/LocationPrompt.tsx:27-29` vs `src/features/designShare.ts:112`.

The docblock justifies suppressing the geolocation primer for showroom visitors with:

> Nothing is lost by waiting: the sender's own `location` travels inside the share payload
> (`schema.ts:serialize`), and when it is absent `useSunPosition` already falls back to Singapore.

`serialize()` does include `location` (`schema.ts:907`), but `buildDesignSharePayload` overrides it
immediately afterwards:

```ts
return {
  ...serialize(state),
  location: null,            // ← designShare.ts:112
  locationPromptDismissed: false,
  …
}
```

so **no share link — showroom or editable — has ever carried a location**. The visitor always gets
the Singapore fallback, never the sender's. The behaviour is fine (arguably better); the stated
reason is false, and it is the reason a reader would rely on when deciding whether to re-enable the
auto-open. Note this also means the recorded open product call about a visitor inheriting the
sender's location does not describe the current code — re-filing that is the maintainer's call, not
this review's.

**Suggested fix.** Correct the docblock to "the link never carries a location — `designShare.ts`
strips it — so the visitor gets the Singapore fallback, which is the right sun for the overwhelming
majority of an HDB audience; they can set their own from Scene → Sun position."

---

### C7 — LOW: mobile File sheet renders an orphan "Load & reset" header in showroom mode

**Where.** `src/ui/toolbar/mobile/FileSection.tsx:367` vs `src/ui/toolbar/menus/FileMenu.tsx:425`.

The desktop menu guards its section label:

```tsx
{!viewOnly && <MenuLabel>Load & reset</MenuLabel>}
```

The mobile sheet does not:

```tsx
<SubHeader>Load &amp; reset</SubHeader>       // FileSection.tsx:367 — unguarded
{!viewOnly && fImportSh3d ? … }               // every item below IS guarded
```

**Failure scenario.** Open a `#/showroom/<code>` link on a phone → File sheet → a "Load & reset"
heading with nothing under it, immediately followed by the next section. Purely cosmetic, but it is
a textbook half-applied hunk: the same change, in the same round, applied to only one of a
documented pair of files ("Same four entries, same wording and same guards as the desktop File
menu — both call `ui/planActions.ts` so the two can't drift", `FileSection.tsx:386`).

**Suggested fix.** `{!viewOnly && <SubHeader>Load &amp; reset</SubHeader>}`.

---

### C8 — LOW: `toggleFloorPlanEditing` has no view-only guard, while the guard's own comment claims the store is the chokepoint

**Where.** `src/state/slices/floorPlanSlice.ts:649-666` (guarded) and `:668-680` (unguarded twin).

`setFloorPlanEditing` gained `if (open && get().viewOnly) return`, with the comment:

> the 2D plan editor … is refused **at the store** rather than at each of its half-dozen entry
> points.

`toggleFloorPlanEditing` calls `set(...)` directly and never routes through `setFloorPlanEditing`,
so it bypasses the new guard entirely. **Not currently exploitable**: its only caller is
`EditMenu.tsx:39`, and `<EditMenu />` is not rendered in showroom mode (`Toolbar.tsx:251`), plus
`floorPlanEditor` is on the view-only denylist. The `P` hotkey goes through
`planEditorHotkey.ts:43 → setFloorPlanEditing(true)` and is doubly guarded. So this is a latent
defect, not a live hole — but the comment states an invariant the code does not provide, which is
exactly how the next caller gets it wrong.

**Suggested fix.**
`toggleFloorPlanEditing: () => get().setFloorPlanEditing(!get().floorPlanEditing)`.

---

### C9 — LOW (security, small): the install-prompt listener deliberately accepts untrusted events in production

**Where.** `src/pwa/installPrompt.ts:86`; rationale at `src/pwa/installPromptState.ts:57-63`.

> our own listener in `installPrompt.ts` never checks `isTrusted`, so
> `simulateBeforeInstallPrompt` dispatches a plain `Event`…

The *seam* is correctly DEV-gated (`installInstallPromptDevSeam` returns early unless
`import.meta.env.DEV`), but the *listener's* permissiveness ships. Any script executing in the page
(an injected third party, a content script, an XSS) can
`dispatchEvent(new Event('beforeinstallprompt'))` with attacker-supplied `prompt()` / `userChoice`,
driving `installPromptState` to `'available'` and making the install card appear at a moment the app
did not choose; the card's Install button then awaits the attacker's promise and can be made to show
an "Installed" success toast that is a lie.

Impact is genuinely low (it presupposes script execution, at which point there are worse things to
do) and the trade was made knowingly. Recorded because it is an *unforced* trade: a DEV-only escape
hatch keeps the harness working at no cost.

**Suggested fix.** `if (!import.meta.env.DEV && !e.isTrusted) return` at the top of the listener.
The harness runs a dev build, so nothing is lost.

---

### C10 — LOW: `.pwa-install-card` is a byte-for-byte duplicate of `.showroom-badge`, and the two disagree on the mobile clamp

**Where.** `src/styles/features.css:938-961` (`.showroom-badge`) vs `:977-1006`
(`.pwa-install-card`).

Twenty-one declarations are identical (position, left/bottom with safe-area insets, `--z-hud`,
`width: 236px`, padding, surface, blur, border, radius, shadow, `animation: pop`,
`transform-origin`, the `max-height` `calc()`, `overflow-y`), plus near-identical `-head` / `-sub`
rules. Two agents solved the same layout problem twice — the same shape as the `isIos()` duplicate
already found and fixed.

The divergence is the tell: `.pwa-install-card` has
`body.mobile .pwa-install-card { width: min(236px, calc(100vw - 2 * var(--s-4))); }` (`:1006`),
copied from `.onb-check`; `.showroom-badge` does not. On the narrowest supported viewport (320 px)
236 px still fits, so nothing breaks today — but the three cards that explicitly share one slot now
have two different responsive behaviours, which is how the next narrow-viewport bug gets in.

**Suggested fix.** Extract a `.hud-card-bl` (bottom-left HUD card) class with the shared block,
including the `body.mobile` clamp, and have all three of `.onb-check`, `.showroom-badge` and
`.pwa-install-card` compose it.

---

### C11 — LOW: the reactive share-route step is a floating promise

**Where.** `src/state/storage/bootstrap.ts:152`.

```ts
await runStep('planShareLink',   loadSharedPlanFromUrl)
await runStep('designShareLink', loadSharedDesignFromUrl)
runStep('shareRouteListener', installShareRouteListener)     // ← not awaited
```

`runStep` is `async` (`:73`) and ends with `await yieldFrame()`. The install itself is synchronous
inside the promise, so the listener *is* registered before anything else can change the hash, and
`runStep` swallows its own errors — there is no live bug. It is inconsistent with the awaited
siblings around it and will read as an oversight to the next person. Add the `await` (or `void`, if
skipping the frame yield is deliberate — but then say so).

---

### C12 — LOW: any non-share hash change during a showroom session forces a full page reload

**Where.** `src/state/storage/bootstrap.ts:336-353` (`onShareRouteChange`, case 3).

```ts
if (parseDesignRoute(hash)) { await loadSharedDesignFromUrl(); return }
if (parsePlanRoute(hash))   { await loadSharedPlanFromUrl();   return }
if (!wasViewOnly) return
globalThis.location?.reload()
```

The docblock justifies the reload as covering "a hand-edited URL or a Back navigation". But the app
has at least one other hash route: `App.tsx:228` reads `window.location.hash === '#/login'`. A
showroom visitor who reaches `#/login` by any means gets a hard reload into a URL with no showroom
code — the shared design is gone, replaced by their own default flat, with no explanation.

No infinite-loop risk: `viewOnly` is session-only (`UI_INITIAL.viewOnly = false`, deliberately
outside the save schema), so the post-reload session is never view-only and the branch cannot
re-arm. `takeEditableCopy`'s `replaceState` correctly fires no `hashchange`, as its comment claims.

**Suggested fix.** Treat known non-share routes (`#/login`, and anything else `App` reads) as "leave
the session alone", or narrow the reload to the case where the hash becomes *empty*.

---

### C13 — INFO: two build numbers have no CHANGELOG entry

`CHANGELOG.md` runs `v0.35.13.0 → v0.35.13.1 → v0.35.13.4`; **`v0.35.13.2` and `v0.35.13.3` do not
exist** in either the changelog or the commit list. Skipped build numbers are harmless in
themselves, and the round documents at least one rebuilt commit (`0fa6bf3d`'s own message records
that its version bump and changelog entry had already landed in `a1e60874` after a
concurrent-worktree accident). Worth one line of confirmation from whoever owned `v0.35.13.x` that
nothing was lost along with the numbers, rather than a fix.

---

## PLAUSIBLE — needs a runtime check

### P1 — the mobile room-readout portal may paint over the 2D plan editor and the presentation slideshow

`src/ui/OrbitRoomReadout.tsx:260` portals the pill to `document.body` on mobile.
`<NavCluster />` is mounted unconditionally (`App.tsx:363`) — it is only hidden by CSS
(`.navcluster { display: none }`), which the portal escapes by design. The pill's visibility depends
on `cameraMode === 'orbit'` and on `cameraPose` still resolving within 15 m of a room; neither is
reset when the 2D plan editor opens or when `presenting` is true, and `.orbit-room-readout` declares
no `z-index` of its own (it relies on being a late child of `<body>`).

`ShowroomBadge` explicitly hides itself while `presenting`; this component has no such check.
Suspicion: on a phone, opening the plan editor or starting the presentation slideshow leaves a stale
room-name pill floating at top-centre. Needs a device or emulated-phone check — the pill's actual
stacking against the plan editor's and the slideshow's own layers cannot be settled by reading CSS.

### P2 — probe materials are cloned per *mesh*, not per *(material, room)*

`roomProbeAttach.ts:330-346`. The clone branch fires for every assignment whose material serves more
than one room, so N meshes in the same room sharing one material produce N clones, N uniform sets
and N `needsUpdate` recompiles — where 1 per room would do. The docblock frames it as "the handful
of materials that actually span rooms". The program cache key is shared, so this is memory and
attach-time cost, not draw calls. Whether it matters depends on how many shell/fitting meshes share
a cross-room material on the default plan — the DEV log at `RoomProbes.tsx:144` already prints
`(${result.cloned} cloned)`, so one console read answers it. (Fixing C1 by route (b) removes this
too.)

### P3 — `statusBarTintBudget` may silently change what the screenshot harness measures

`statusBarTintIsVisible()` (`statusBarTint.ts:135-152`) gates all canvas readback on
`(pointer: coarse) || (display-mode: standalone) || (display-mode: fullscreen)`. A headless Chrome
run at a 390 px viewport without touch emulation reports none of those, so the harness now takes the
*analytic sky* path where a real phone takes the *sampled pixel* path. Any visual-verification frame
that includes browser chrome, or any probe asserting on the `theme-color` meta, would be comparing a
different code path to the device. Cheap to confirm: assert
`matchMedia('(pointer: coarse)').matches` inside a scenario, or set `SHOT_TOUCH=1`.

### P4 — every room-probe re-capture after the first waits the full 2.5 s grace, and the DEV log mislabels it

`RoomProbes.tsx:151-155`. `capture(true)` is only reachable through `subscribeLightmapsApplied`, and
`markLightmapsApplied()` is called exactly once per `VisibilityLightmaps` attach pass
(`VisibilityLightmaps.tsx:337`), whose effect does **not** depend on `hourBucket` or `weather`. So
when `RoomProbes`' effect re-runs for an hour-bucket or weather change, nothing re-emits the signal:
the capture happens 2 500 ms later via the grace timer and is logged
`[provisional: baked GI not attached yet]` even though the bake is fully attached.

The pixels should still be right (the shell *is* baked by then), and the timer doubles as an
accidental debounce for a time-of-day scrub, which is genuinely useful. But the 2.5 s latency on
reflections after moving the sun is user-visible on `realistic`, and the behaviour depends on a
coincidence the code does not state — if anyone later makes `markLightmapsApplied` re-fire, the
debounce vanishes and every hour tick becomes an immediate 24-face capture plus material recompiles.
Suggested direction: have `RoomProbes` also consult a "lightmaps already applied" latch (a boolean
alongside the signal) and capture immediately when it is set.

### P5 — `bindKtx2Renderer` leaks a `KTX2Loader` when `detectSupport` throws on the first bind

`ktx2.ts:132-138`. On the first-bind path `probe = new KTX2Loader()`; if `detectSupport(gl)` throws,
the function returns without disposing it. No worker has been spawned at that point (three creates
the worker pool lazily on first `load()`), so the leak is one small JS object per failed bind rather
than a worker leak — but `Ktx2Controller` re-binds on every `webglcontextrestored`
(`Ktx2Controller.tsx:34,40`), so a device thrashing context loss accumulates them. Low confidence
that it ever matters; listed because it is a one-line fix (`probe.dispose()` before the early
return) and because the catch block's own comment shows the author was already thinking about a lost
context mid-teardown, which is exactly the repeating case.

---

## Checked and **fine**

Recorded so the next reviewer does not re-derive them.

- **Showroom gate vs PWA install card.** `pwaInstallPrompt` *is* on the view-only denylist
  (`viewOnly.ts`), **and** `PwaInstallCard` re-checks `viewOnly` directly, **and** the trigger
  (`checklistDone.length === CHECKLIST_STEPS.length && checklistDismissed`) is unreachable in a
  showroom because `onboardChecklist` is denylisted too. Triply unreachable, as documented.
- **The three bottom-left cards never co-exist.** `.onb-check` renders only while
  `!checklistDismissed`; `dismissChecklist` is monotonic with no un-dismiss path anywhere in `src/`;
  `.pwa-install-card` requires `checklistDismissed`; `.showroom-badge` requires `viewOnly`, which
  withholds `onboardChecklist` and `pwaInstallPrompt`. The slot-sharing comments are accurate.
- **The two share routes.** `DESIGN_ROUTE_RE` requires a literal `#`, and the code charset is
  `[A-Za-z0-9_-]`, so no `#/showroom/<code>` can be made to match the editable route — there is no
  route-confusion escalation. The reverse (a crafted `#/design/A#/showroom/B` resolving code `A`
  while classifying as showroom) only ever *downgrades* capability. Route and payload signals are
  correctly OR'd at boot and on `hashchange`.
- **`viewOnly` never reaches persistence.** It lives in `UI_INITIAL`, not in `SerializedStateZ`;
  `buildDesignSharePayload` keeps the capability in an envelope key outside the zod schema and omits
  it entirely when false, so existing editable links are byte-identical. As documented.
- **The AO/MSAA change is inert today.** `mobileMsaa` still defaults `false` (`registry.ts:2068`),
  `postprocessing` is `6.39.5` installed against a `^6.39.5` pin and a `6.39.3` floor, and
  `aoMsaaDecision` is pure and fully tested. No shipped behaviour change.
- **KTX2 colour-space and flip guards line up end to end.** The encoder sets `isYFlip: true`,
  `isPerceptual: false`, `isSetKTX2SRGBTransferFunc: false`, `generateMipmap: false`,
  `enableRDO: false`; `prepareVisibilityTexture` pins `NoColorSpace` (`visibilityLightmap.ts:340`);
  the transplant explicitly does **not** copy `decoded.colorSpace` (`lightmapTexture.ts:93`).
  `CompressedTexture` defaults `flipY = false`, matching the encode-time flip.
- **Both lightmap sets ship.** `public/assets/lightmaps/` holds 229 `.png` + 229 `.ktx2` + the index;
  no PNG was deleted, so `pngSiblingUrl` resolves online. `index.json` lists only `.ktx2`
  (`format: "ktx2"` at both index and per-map level). Precache goes 10.4 → 5.8 MB as claimed.
- **PMREM size pairing.** `2^floor(log2(192)) === 128` pairs `realistic/weak`'s `envResolution: 192`
  with `roomProbeResolution: 128`; `realistic/capable` is 256/256. Pinned in `quality.test.ts`. The
  `CUBEUV_*` macro constraint the docblock describes is real and correctly handled.
- **U4's "every JS call site" claim is true.** A `matchMedia` sweep of `src/` finds no remaining
  `prefers-reduced-motion` query outside `motionPreference.ts`. (The CSS gap is C2 — a different
  claim.)
- **`isIos()` de-duplication is complete** — `viewInAr.ts` imports from `utils/platform.ts`, and no
  third copy exists.
- **`P` hotkey, undo/redo, ⌘K, `enterRoomEditor` and `setFloorPlanEditing`** are all correctly gated
  for showroom mode.

---

## `skipShaderLinkChecks` — is `gl.debug.checkShaderErrors = false` safe to ship ON by default?

**Verdict: the perf case is real and the flag should stay, but shipping it ON by default is the
wrong trade *for this branch specifically*. Recommend default OFF for one release, then flip.**

### What it actually does

`RendererTierController.tsx:59` sets `gl.debug.checkShaderErrors = !skipLinkChecks`. In three r184
that single boolean guards the **entire** validation block in `WebGLProgram.js:onFirstUse`
(`:862-936`) — verified by reading the installed source, not the docs:

- `getProgramInfoLog(program)`, `getShaderInfoLog(glVertexShader)`,
  `getShaderInfoLog(glFragmentShader)`
- `getProgramParameter(program, LINK_STATUS)`
- the `renderer.debug.onShaderError` hook and the default `THREE.WebGLProgram: Shader Error …`
  console output
- population of `self.diagnostics`

Nothing else in `onFirstUse` depends on it; the cleanup that follows runs either way. So with the
flag on, a program that fails to link is *used anyway*: `useProgram` plus the draw call raise
`GL_INVALID_OPERATION` in the driver, the object renders nothing (or renders black), and **the app
emits not one byte of diagnostic output**.

### The case FOR default-on

- The measurement is specific and was taken on this app: a CDP trace put **683 ms of 10.3 s of
  sampled main-thread CPU in `getProgramInfoLog`** — the second-largest entry — and the change cut
  the worst mode-switch frame gap **717 ms → 283 ms** (`docs/audit/perf-trace-2026-09-25.md`,
  `docs/open-graphics-decisions.md` z16). These are synchronous GPU round-trips that block until the
  driver finishes an otherwise-asynchronous link, so they convert every program *burst* — the lights
  toggle (z16: +25/+31 programs), the first orbit↔walk switch (z17) — into a visible stall.
- three's own documentation recommends exactly this ("may be useful to disable this check in
  production for performance gain").
- The stutters it removes are on two of the most-used controls in a product whose stated goal is
  "feels like being inside the flat". A 717 ms hitch on the lights switch is a worse *user-visible*
  defect than a class of *developer-visible* defect that has not yet occurred.
- Reporting is only reporting. Nothing about correctness changes: a program that links today links
  tomorrow.

### The case AGAINST default-on — and why it wins this round

1. **This branch just added the repo's first hand-written `ShaderChunk` replacement.**
   `boxProjectEnv.ts` injects ~90 lines of GLSL into `envmap_physical_pars_fragment` and a varying
   into `worldpos_vertex`, on materials that *already* carry a second injection from
   `visibilityLightmap.ts`. That is the highest-probability source of a driver-specific GLSL compile
   or link failure this codebase has ever shipped — and it is default-on
   (`roomProbes: { default: true }`) on the `realistic` tier. Turning off error *reporting* in the
   same round you ship the thing most likely to produce an error is the wrong order of operations.
2. **The failure mode is this repo's own worst-case pattern.** A silent GLSL failure on, say, a Mali
   or Adreno driver that rejects something Metal and SwiftShader accept presents as: the glossy
   surfaces in three rooms render black or vanish, with a clean console. That is indistinguishable
   from "the reflection feature is subtle" — the *exact* failure shape C3 and the KTX2 docblock both
   warn about ("invisible in a screenshot; it looks exactly like a correctly-working subtle lighting
   term"). The repo has history here (v0.31.7.32/.33's 40 %-of-expected lightmap effect took two
   builds and a purpose-built bisect tool to find).
3. **The stated escape hatch does not work for most people who would need it.** The registry comment
   says the flag is "kept flippable at runtime so a dev chasing a shader error can turn the reporting
   back on". `resolveFlags` only honours overrides when `privileged = isDev || isAdmin`
   (`resolve.ts:65`). In a production build a non-admin cannot flip it by URL or localStorage. So
   the realistic debugging story is "reproduce it in a dev build" — fine for a bug you can
   reproduce, useless for the one you cannot (a driver you don't own, reported by a user who sees a
   black splashback). This round also ships no telemetry path for a shader error: with
   `checkShaderErrors` off, `onShaderError` never fires, so there is nothing to report even if a
   reporter existed.
4. **The perf win is not evenly distributed against the risk.** The trace repro was
   `realistic` + walk + 21:00 + lights on — the same tier that gets the new shader injection. But
   the flag is `tier: 'simple'`, `default: true`, so it is on for *every* user on *every* tier,
   including tiers whose program counts never burst.

### What a future shader bug looks like with the flag on

A developer gets a report: "the kitchen splashback is black on my Pixel." They open the app on their
own machine — it works, because their driver accepts the chunk. Console: clean. The `RoomProbes` DEV
log says `4 rooms captured … 62 meshes, 9 materials (2 cloned)`, so attachment *succeeded*. `tsc`
and 11 669 tests are green. `boxProjectEnv.test.ts` passes, because it only asserts string surgery
against the installed chunk, not that the result compiles. Nothing anywhere says "link failed". The
only way in is to obtain the device, run a dev build on it, and notice that flipping
`?ff=skipShaderLinkChecks:off` suddenly produces a `THREE.WebGLProgram: Shader Error …` — a step
nobody will think of, because the flag's existence is recorded in a registry comment and an audit
document, not at the point of failure.

### Recommendation

Ship the flag; change the default and one line of code.

1. **`default: false` for one release cycle**, then flip to `true` once `roomProbes` has real-device
   mileage. The z16/z17 stutters have been open since 2026-09-18; one more cycle is cheap next to a
   silent black-surface class of bug.
2. Whichever default is chosen, **keep error reporting on for the first few programs** — or for the
   first ~2 s after boot. The stalls the trace measured are program *bursts* at mode switches, not
   the boot compile, and boot is when a broken injected chunk would first link. A small wrapper that
   holds `checkShaderErrors = true` until `frameRenderedSignal` has fired a few times and then flips
   it off keeps nearly all of the win and closes nearly all of the blind spot.
3. Set `gl.debug.onShaderError` to something that survives the flag — a one-line handler that raises
   a store notification or writes to a ring buffer the diagnostics panel can show. Cheap, and it
   turns "silent black" into "reportable".
4. Fix the registry comment: the runtime flip is available to **dev builds and admin accounts only**
   (`resolve.ts:65`), not to a developer running production.
5. Add an ordering note — `RendererTierController`'s effect runs after the subtree's first render,
   so any program reaching `onFirstUse` before it commits is still checked. That is the safe
   direction, but it means the flag's measured effect depends on mount order and is worth pinning
   in a test or a comment.

---

## Appendix — what was run

```
npx tsc --noEmit                 exit 0, 0 lines
npm test                         1185 files passed / 1 skipped
                                 11669 tests passed / 2 skipped, 80.18s
npm run deadcode  (knip)         exit 0
```

No browser and no dev server were started (other agents hold them).

Docs read for intended behaviour: `docs/developer/showroom-links.md`,
`docs/developer/pwa-install.md`, `docs/developer/ktx2-textures.md`,
`docs/audit/perf-trace-2026-09-25.md`, `docs/audit/product-ux-2026-09-25.md`,
`docs/audit/visual-verify-r7-2026-09-25.md`, `docs/open-graphics-decisions.md`,
`src/scene/CLAUDE.md`, `src/state/CLAUDE.md`, `src/ui/CLAUDE.md`, `src/features/CLAUDE.md`.
