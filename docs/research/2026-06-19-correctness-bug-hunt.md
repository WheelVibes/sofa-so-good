# Correctness bug-hunt audit — 2026-06-19

Branch: `claude/interior-design-improvement-niqt2i` (HEAD `20d192f`).

Focused, evidence-based hunt for **real** correctness defects across state/store,
geometry/layout/collision, floorplan, units, rendering/materials lifecycle, and async/IO.
Every item below points at a concrete `file:line` and a concrete failure scenario. Each was
either read directly or confirmed numerically; speculative "could be improved" items are
excluded. HIGH-severity defects (data loss, WebGL leak, wrong geometry) are listed first.

Severity legend: **high** = data loss / crash / wrong geometry / WebGL leak / persistence
corruption · **med** = wrong but recoverable / bounded leak · **low** = cosmetic / minor / rare.

---

## HIGH

### BUG-001 (high) — Autosave watch-list omits persisted fields → silent data loss on reload
`src/state/storage/autosave.ts:18-34` (`Persistent`), `:36-55` (`pickPersistent`), `:57-75` (`shallowEqual`).

`serialize()` (`src/state/schema.ts:525-536`) persists `comments`, `drawingCallouts`,
`panoTourStops`, and `quoteTemplate`. The autosave change-detector watches only items,
floorPlan, doors, finishes, userFurniture, userMaterials, timeMode, manualHour, lightsMode,
annotations, cameraMode, orientationDeg, location, locationPromptDismissed, designNote — **none
of those four**. The file's own header comment states the invariant ("every field that
`serialize()` writes must be watched here … keep this list in lock-step"), which is violated.

**Failure scenario:** From a loaded design, the user adds a design comment (`addComment`), edits
the quote template (`setQuoteTemplate`), or adds/edits a drawing-set callout, then reloads/closes
the tab without touching any *watched* field. The store subscription sees no watched-reference
change, so `flush()` is never scheduled, autosave never writes, and the change is gone on reload.
`pushHistory()` (called by those mutators) only touches `past/future/_lastPushKey/_lastPushAt`,
none of which are watched, so it does not rescue the save. `panoTourStops` self-persists to its
own localStorage key (`src/state/slices/panoTourSlice.ts:65`) so it survives despite the gap, but
`comments`, `drawingCallouts`, and `quoteTemplate` have **no** independent persistence → true
data loss.

**Root cause:** `Persistent`/`pickPersistent`/`shallowEqual` were never extended when comments
(F24), drawing callouts, and the quote template were added to `serialize()`.

**Fix:** Add `comments`, `drawingCallouts`, `quoteTemplate` (and for hygiene `panoTourStops`) to
all three of `Persistent`, `pickPersistent`, and `shallowEqual`.
**Test:** Extend the existing `src/state/storage/autosave.test.ts` `it.each` regression block with
cases mutating only each of these fields and assert `adapter.save` is called exactly once after the
debounce window.

### BUG-002 (high) — `PlanRoomFloor` rectangular floor allocates a new `PlaneGeometry` every render, never disposed
`src/apartment/floor/PlanRoomFloor.tsx:105`.

In `FloorMesh` the rectangular-floor branch does `const geometry = worldUvPlaneGeometry(width,
depth, texTransform)` **inline in the render body** — not in `useMemo`, with no disposal effect.
`worldUvPlaneGeometry` (`src/materials/worldUv.ts`) does `new PlaneGeometry(...)` on every call,
so a brand-new geometry is allocated on every render and the previous one is orphaned. R3F does
**not** auto-dispose a geometry passed via the `geometry=` prop (only geometries declared as JSX
children get auto-disposed), so each orphan leaks a GPU vertex buffer. The sibling `PolygonFloor`
in the same file (`:136-139`) correctly memoizes — proving the established pattern was missed here.

**Failure scenario:** On a custom (user-authored) plan, `PlanLevelShell` re-renders on every
finish edit, room hover, selection change, or camera-mode change; that re-renders every
`PlanRoomFloor`/`FloorMesh`, leaking one `PlaneGeometry` per rectangular room per render. Over an
editing session on a multi-room plan, `renderer.info.memory.geometries` climbs unbounded →
eventual WebGL context loss (blank canvas).

**Root cause:** Missing `useMemo` + missing disposal effect.

**Fix:** `const geometry = useMemo(() => worldUvPlaneGeometry(width, depth, texTransform), [width,
depth, texTransform?.scale, texTransform?.angle])` plus
`useEffect(() => () => geometry.dispose(), [geometry])` (mirror `WallSegment.tsx:438`).
**Test:** Render a custom plan, repeatedly toggle a store value the level shell subscribes to (e.g.
apply a finish) while sampling `renderer.info.memory.geometries`; it climbs with the bug, stays
flat with the fix.

### BUG-003 (high) — User-uploaded materials lose name/category/uvScale/swatch on reload
Written: `src/materials/upload/persist.ts:49` (`persistChannel` stores only `meta: { matId, role }`).
Read: `src/state/storage/hydrateAssets.ts:158-180` (`hydrateUserAssets` reads `meta.category`,
`meta.name`, `meta.uvScale`, `meta.swatch` — none ever persisted).

**Failure scenario:** User uploads a custom material named "Oak Floor", category `wall`, uvScale
`[2,2]`, with a chosen swatch. It works in-session (the def is added to the store directly at
`persist.ts:107`). After reload, `hydrateUserAssets` reconstructs it as name = first 8 chars of the
matId, category = hard default `'floor'` (`hydrateAssets.ts:167`), uvScale = `[1,1]`, swatch =
`#cccccc`. The wall material now tiles wrongly and is mis-categorised in the picker.

**Root cause:** Persist and hydrate disagree on the `meta` schema; upload options are never
round-tripped to IDB.

**Fix:** In `persistChannel` (at least for the albedo record) include `name`, `category`,
`uvScale` (JSON-encoded array), and `swatch` in `meta`; decode them in `hydrateUserAssets`.
**Test:** New round-trip test under `src/state/storage/` using `fake-indexeddb`: persist a material
with non-default name/category/uvScale/swatch, run `hydrateUserAssets`, assert the rebuilt
`TexturedMaterialDef` matches. No such test exists today.

---

## MEDIUM

### BUG-004 (med) — L-shape room area double-counts an overlapping/contained extension
`src/floorplan/types.ts:376-381` (`planRoomArea`).

`planRoomArea` for the rect+extension case returns `main + ext = width*depth +
extWidth*extDepth` unconditionally, but the room outline (`roomPolygon` → `rectUnionOutline`,
`types.ts:350-372`), `planRoomPerimeter` (`:387`), and the floor render all use the rectilinear
**union**. When the extension overlaps or sits inside the main rect, area is inflated and
disagrees with the drawn shape.

**Failure scenario (verified numerically):** main 6×6 with extension `offset [1,1], 2×2` fully
inside → `planRoomArea` returns **40 m²**; true polygon area (rendered + perimeter basis) is
**36 m²**. Partial overlap (main 4×4 + ext `offset [2,2]`, 4×4) → 32 vs true 28. The inflated
value surfaces in the drawing-set area schedule (`src/floorplan/drawingSet.ts:421,430`), the design
score (`src/ui/.../DesignScorePanel.tsx:79`), and the editor room label
(`FloorPlanEditor.tsx:2161`). Reachable via the PlanInspector L-extension offset fields
(`PlanInspector.tsx:554-563`), which let the user drag the extension over the main rect.

**Root cause:** `planRoomArea` sums two rectangles instead of measuring the union outline that
every other consumer uses.

**Fix:** Compute the area from the union outline for the non-explicit-polygon case too — e.g.
`return polygonArea(roomPolygon(r))` for all shapes (single code path).
**Test:** Assert `planRoomArea(r) === polygonArea(roomPolygon(r))` for a contained/overlapping
extension (currently 40 vs 36).

### BUG-005 (med) — Unhandled promise rejection when a remote catalog asset fails to download
`src/ui/catalog/RemoteCard.tsx:53-57` and `:66` (`onClick={() => void onClick()}`).

`resolveRemoteAsset` (`src/state/slices/remoteCatalogSlice.ts:165-167`) sets status `'error'` and
**rethrows**. `RemoteCard.onClick` does `await resolve(entry, resolution)` with no try/catch, and
the call site discards the promise via `void onClick()`.

**Failure scenario:** Click a Poly Haven / CC0 card while offline or when the asset 404s. The card
correctly shows "Retry", but the rejected promise is unhandled → `unhandledrejection` console
error (and Vite's dev error overlay can pop). Pressing Enter on a focused card (`:70`) hits the
same path.

**Root cause:** Producer rethrows for the `inFlight`-awaiting integration consumers, but the UI
consumer never catches.

**Fix:** Wrap the `await resolve(...)` in `RemoteCard.onClick` in try/catch (the slice already
surfaces the error visually, so the catch can be a no-op).
**Test:** Render `RemoteCard`, mock `resolveRemoteAsset` to reject, fire click, assert no unhandled
rejection and that status shows error.

### BUG-006 (med) — `RoomFloor`/`WallSegment` face geometries memoized but never disposed
`src/apartment/floor/RoomFloor.tsx:44`; `src/apartment/walls/WallSegment.tsx:92`.

Both memoize `worldUvPlaneGeometry(...)` (so no per-render leak, unlike BUG-002) but have **no**
disposal effect. When `width/depth` (RoomFloor) or `segLen/segHeight` (WallSegment `FacePlane`)
change, or on unmount, the superseded geometry leaks. WallSegment carefully disposes its cloned
`faded` material (`:106`) and `bodyGeometry` (`:438`) but leaves the per-face plane geometry.

**Failure scenario:** Switching starter plans (4-room → 5-room → condo) orphans every room floor
geometry; editing ceiling height / wall thickness re-runs `buildWallSegments`, changing
`segLen/segHeight` and orphaning prior face geometries for every wall face. Bounded per action but
accumulates across a session.

**Root cause:** Missing `useEffect(() => () => geometry.dispose(), [geometry])`.
**Fix/test:** Add the disposal effect (mirror `WallSegment.tsx:438`); verify
`renderer.info.memory.geometries` returns to baseline after switching plans back and forth /
scrubbing ceiling height.

### BUG-007 (med) — Blob URL leak in remote-catalog thumbnails
`src/catalog/remote/hooks.ts:62` — `setUrl(URL.createObjectURL(blob))`, never revoked.

The effect early-returns once `url` is set (`:54`); its cleanup (`:66-68`) only flips
`cancelled.current`. No `URL.revokeObjectURL` anywhere.

**Failure scenario:** Scrolling a large CC0 catalog mounts/loads many `RemoteCard` thumbnails; each
creates a blob URL that lives for the page lifetime. Unmounting a card (virtualised list, closing
the drawer) does not free its thumbnail blob → steady leak proportional to thumbnails viewed.

**Root cause:** Created object URL is not tracked or revoked.
**Fix:** Track the URL in a ref and `URL.revokeObjectURL` it in the effect cleanup / on unmount.
**Test:** Mount, let the thumbnail resolve, unmount, assert `URL.revokeObjectURL` was called with
the created URL (spy).

### BUG-008 (med) — `renameItem` is not undoable
`src/state/slices/itemsSlice.ts:180-187`.

`renameItem` mutates the tracked `items` array but calls **neither** `pushHistory` nor
`pushHistoryCoalesced`, and its caller (`InspectorPanel.tsx:467`, an `onChange`) does not push
either. Sibling mutators `tiltItem` (`:95`), `updateItemProps` (`:152`), `setItemElevation`
(`:107`) all coalesce-push.

**Failure scenario:** Select an item, type a custom name in the Inspector "Name" field, press
Cmd/Ctrl+Z. The rename is **not** reverted (no history entry exists for it); undo instead reverts
the previous real action while the rename silently stays.

**Root cause:** Missing coalesced history push.
**Fix:** Add `get().pushHistoryCoalesced(\`rename:${id}\`)` at the top of `renameItem` (coalesced so
per-keystroke typing collapses into one undo step).
**Test:** In `itemsSlice.test.ts`, add an item, `renameItem`, `undo()`, assert the label reverts;
and that two quick renames coalesce into one undo step.

---

## LOW

### BUG-009 (low) — Sloped wall ignores per-wall thickness overrides and plan-wide default
`src/floorplan/slopedWall.ts:27-29` (`thicknessOf`).

`slopedWallTriangles` derives thickness from a hardcoded `0.2` external / `0.1` internal, ignoring
both the per-wall `thicknessM` override and the plan-wide `wallThickness` default that
`planWallThickness` (`src/floorplan/planGeometry.ts:18-24`) honors for every other wall.

**Failure scenario:** A wall with `topHeightEnd` set (sloped) **and** `thicknessM: 0.4` renders its
prism at 0.2 m — visibly thinner than the abutting flat walls.
**Fix:** Pass the resolved thickness (from `planWallThickness`) into `slopedWallTriangles`.
**Test:** Build a sloped wall with `thicknessM: 0.4`; assert the prism cross-thickness span is 0.4 m.

### BUG-010 (low) — `parseAngleInput` silently accepts trailing garbage
`src/floorplan/wallNumericEntry.ts:87-94`.

Uses bare `parseFloat(s)`, which accepts trailing non-numeric text: `parseAngleInput("90xyz")` →
`90`, `"3.5abc"` → `3.5`. The sibling `parseLengthInput` uses anchored regexes and rejects garbage
with `NaN`.

**Failure scenario:** A typo like `"90o"` or `"45 deg!"` is silently treated as a valid angle
instead of being flagged invalid.
**Fix:** Validate with an anchored numeric regex (e.g. `/^-?\d+(\.\d+)?$/`) before `parseFloat`,
returning `NaN` otherwise (mirror `parseLengthInput`).
**Test:** `expect(parseAngleInput('90xyz')).toBeNaN()`.

### BUG-011 (low) — Non-atomic read-modify-write of the remote-cache meta record (cross-key race)
`src/catalog/remote/cache/db.ts:115-149` (`putAsset`/`getAsset`/`deleteAsset`) and
`src/catalog/remote/cache/lru.ts:6-15` (`evictUntilUnder`).

All do `getMeta()` → mutate → `setMeta()` against the single `META_KEY` with awaits in between, no
locking. The per-key `inFlight` dedup in `resolveRemoteAsset` prevents the *same*-key race but not
cross-key.

**Failure scenario:** Two different assets resolved concurrently (rapid clicks on two cards)
interleave: both read the same meta, both write back, the second clobbers the first's byte
accounting. `remoteCacheBytes` and the LRU entry list drift from reality; eviction may
under/over-count. Bounded, recoverable, and entirely within best-effort cache code (so low).
**Fix:** Serialize meta mutations through a single in-module promise chain (mutex), or update meta
inside one idb read-write transaction.
**Test:** Fire `putAsset` for two keys concurrently with `fake-indexeddb`; assert
`getMeta().totalBytes` equals the sum of both bundles.

### BUG-012 (low) — Possible `TransactionInactiveError` (silently swallowed) in pano cache write
`src/ui/panorama/panoImageIdb.ts:150-156`.

After `await idbRequest(store.put(entry))` the same `store`/transaction is reused for
`store.getAll()` / `store.delete()`. Reusing an IDB store handle across an `await` can hit the
transaction-auto-commit footgun (`TransactionInactiveError`). The whole body is wrapped in
`try/catch {}` (`:159-161`) that "falls back to live capture silently", so worst case is a missed
cache write/eviction — never a crash (hence low).
**Fix:** Don't span put-success→getAll across the await on the same transaction; open the eviction
read in a fresh transaction, or do put + getAll without awaiting the put first.

### BUG-013 (low) — `newFloorPlan` replaces the plan without pushing history (inconsistency)
`src/state/slices/floorPlanSlice.ts:390-398`.

`newFloorPlan` replaces the entire `floorPlan` and prunes `finishes` with **no** `pushHistory`,
whereas the analogous `loadSavedPlan` (`:309`) and `resetFloorPlan` (`:381`) both push. If "New
apartment" is meant to be undoable, the prior plan is dropped irrecoverably. May be intentional
"new document" semantics — flagged as an inconsistency to confirm, not asserted as a hard bug.
**Fix/decide:** If undoable, add `pushHistory()`; otherwise leave and document the intent.

### BUG-014 (low) — `floorPlanStore.loadFloorPlans` restores saved plans without schema validation
`src/state/floorPlanStore.ts:18-23`.

Only `JSON.parse` + `Array.isArray`/`isDefaultPlan` checks; a parseable-but-malformed plan (e.g.
missing `walls`) is cast straight to `FloorPlan` and set into the store, unlike the
autosave/designFile paths which run `migrate` + Zod. Could feed bad geometry to the renderer. Lower
severity since it's per-device authored data.
**Fix:** Run the same `migrate` + Zod `safeParse` validation used by the autosave/designFile import
paths; drop entries that fail.

---

## Verified-correct / no-bug-found (riskiest areas checked and found sound — skip re-auditing)

**Geometry / collision / array math**
- `src/collision/obb.ts` — SAT (4 axes), `OVERLAP_EPSILON` flush-tolerance, zero-length segment
  guard (`obbVsSegment` returns false at `segLen === 0`). Corner winding correct. Sound.
- `src/furniture/radialArray.ts` — faceCenter yaw `atan2(-cos angle, -sin angle)` verified
  numerically to point local +Z at the ring centre for every test angle (the doc comment's "θ+π"
  is a loose paraphrase; the code is correct). Full-circle vs partial-sweep step, count<2 / sweep≤0
  / radius clamp edge cases all handled.
- `src/furniture/arrayPlacement.ts` — `arrayOffsets`/`gridArrayPlacements`: rotation-correct local→
  world step, `ARRAY_MAX_COUNT` cap, spacing clamp, source-cell exclusion. Sound.
- `src/layout/alignDistribute.ts` — `distributeEvenGaps` now clamps negative gap to 0 and reports
  `clamped` (the prior silent-overlap bug is fixed); `obbAxisHalf` AABB projection correct.
- `src/layout/angle.ts` — `nearestRightAngle`/`isOffSquare` correct for negative radians.
- `src/collision/equalSpacing.ts` — gap detection, MIN_GAP filtering, between-span exclusion,
  snap-centre math, badge de-dup. No NaN/divide-by-zero paths.

**Floorplan**
- `polygonArea` (`types.ts:256-265`) — shoelace with `Math.abs/2`, winding-agnostic, handles
  non-convex.
- `src/floorplan/wallArc.ts` — `arcCircle` guards `len < 1e-6` → null; uses `atan2` (no acos/asin
  domain risk); explicit minor/major arc selection; arc-length clamping at both ends; zero-length
  chord guards in `pointAtArcLength`/`nearestArcLength`.
- `src/floorplan/polyline.ts` — length/bounds guard `< 2` / empty.
- `src/floorplan/roomDetect.ts`, `planGeometry.ts` (curved `wallBoxes`/`planCollisionWalls`),
  `planRoomShell.ts`, `section.ts` — zero-length walls/chords filtered before divides; opening
  offsets are arc-length and consistent with the sampling. Sound.
- `planRoomPerimeter` (`types.ts:387`) — uses the union outline correctly (only `planRoomArea`
  diverges; see BUG-004).

**Units / measurement**
- `src/floorplan/wallNumericEntry.ts` `parseLengthInput` — `5'6"`, `5'`, `6"`, `5' 6"`, `42"`,
  `3.5'`, `3.5m`, `350cm`, fractions, negatives, empty, garbage all handled via anchored regex.
- `src/utils/measurement.ts` `formatLength`/`formatArea` — inch carry-to-foot, non-finite guarded.
  (Only nit: `-0″` display for tiny negatives — cosmetic, not filed.)

**State / store**
- `LocalStorageAdapter.load`/`readIndex` (`src/state/storage/LocalStorageAdapter.ts`) — `JSON.parse`
  + `migrate` + Zod `safeParse` all wrapped in try/catch → typed `StorageError`s.
- `migrate` (`src/state/storage/migrations.ts:35-56`) — version walk; missing migration / future
  version both throw `VersionMismatchError`.
- `SerializedStateZ` preprocess (`schema.ts:423-443`) — v1→v2 bump + legacy `timeOfDay`→`manualHour`
  mapping correct on the migrate-then-parse path.
- `applySerialized` (`schema.ts:544-606`) — finite-transform filtering (guards NaN/Infinity into
  three.js), custom-room finish-key validation, selection/hidden reset, `?? default` fallbacks.
- `hydrate` (`src/state/storage/hydrate.ts`) — asset/autosave failures isolated; IKEA defs merged
  before computing the `known` set so placed IKEA items aren't dropped as orphans.
- historySlice undo/redo/jumpHistory/coalesce/`prunedSelection`/`appendCapped` — index math, cap
  logic, dangling-selection pruning all correct.
- Other localStorage readers (auth, pano, qualityPrefs, editorPrefs, budgetPrefs, appearancePrefs,
  recent/favourites/userStyles/userSets/cameraViews) — all wrap `JSON.parse` in try/catch + validate
  shape. No unguarded-parse crash paths found.

**Rendering / materials lifecycle**
- `src/materials/cache.ts` — module material cache keyed correctly (`def.id` + size suffix for
  non-plaster procedural); worker hot-swap disposes old maps before swapping; colorSpace flags
  correct (sRGB albedo, linear normal/rough); `bmp.close()` after upload; `disposeCachedMaterial`
  disposes all maps.
- Color-space flags across `furnitureMaterials.ts` (wood-albedo already fixed) and the `LuxOverlay`
  `DataTexture` + `meshBasicMaterial toneMapped={false}` round-trip — verified correct, not a bug.
- `runProceduralWorker.ts` — request coalescing via `inflight`; `worker.onerror` resolves pending
  callbacks and nulls the worker.
- `RenderPump.tsx`, `FinishDropSurface.tsx`, `PanoramaController.tsx`, `LuxOverlay.tsx`,
  `SceneBackdrop.tsx` — listeners/RAF/subscriptions removed in cleanups; render-target/`autoClear`
  restored; DataTextures disposed on recompute + unmount.
- `ContactShadow.tsx`, `SceneEnvironment.tsx`, `Sky.tsx` — shared singletons / declarative drei,
  memoized; no leaks.
  (The geometry-disposal gaps are BUG-002/BUG-006; the rest of the render tree is sound.)

**Async / IO / import**
- `src/state/storage/designFile.ts` — project export/import: size cap, `file.text()` /
  `JSON.parse` / `migrate` try/catch, Zod `safeParse`; export revokes the object URL on next tick.
- `src/catalog/packs/install.ts` (`installPack`/`installPolyPizzaPack`) — abort checks, per-model
  failures skipped (AbortError re-thrown), renderer disposed in `finally`.
- `src/furniture/upload/bulkImport.ts` — per-file try/catch skips without aborting the batch;
  in-batch hash dedup; batched commits avoid O(n²) catalog rebuilds.
- `src/furniture/upload/persist.ts` — single file read, hash-dedupe, best-effort LOD tier writes.
- `src/materials/upload/persist.ts` — rollback path on partial failure correctly revokes object URLs
  and deletes already-written channels (the *meta-schema* gap is BUG-003, separate from rollback).
- `src/materials/convert/decodeGpuTexture.ts` — WebGL renderer disposed in `finally` on both KTX2
  and DDS paths; friendly throws surface as toasts.
- `src/ui/openDxf.ts`, `src/ui/paletteFromPhoto.ts` — object URLs revoked in `finally`/next-tick;
  image load errors handled.
- `src/catalog/remote/providers/*.ts` — fetches check `res.ok` and throw; abort threaded through;
  only successful bundles are cached (no cache poisoning, no infinite retry).

---

### Summary

14 concrete defects. Fix order: **BUG-001** (silent persistence data loss — every comment /
quote-template / callout edit, no test coverage), **BUG-002** (per-render geometry leak →
WebGL context loss), **BUG-003** (every uploaded material mis-restored on reload). Then BUG-004
(wrong room areas in schedules/score/labels) and the remaining med/low items. The geometry/collision
array math, undo/redo core, persistence parse-guards, and material colorSpace handling were checked
thoroughly and are sound.
