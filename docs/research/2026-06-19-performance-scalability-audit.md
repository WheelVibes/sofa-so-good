# Performance, memory-leak & scalability audit — 2026-06-19

Pure-client, evidence-based. Scope: frame-rate killers, GPU/memory leaks that grow
with session length, and O(n²)/O(n) costs that bite at *realistic* scale (a furnished
multi-room flat, a few hundred items, a long browse/import session). Reasoned from the
code without a real GPU; verification notes are headless where possible.

A separate correctness bug-hunt already found GPU-resource leaks in `PlanRoomFloor.tsx`,
`RoomFloor.tsx`, `WallSegment.tsx`, plus blob-URL leaks — **those are excluded here**
(assumed in flight). The findings below are additional.

**Bottom line:** the codebase is already strongly optimized — `frameloop="demand"`,
memoized `Furniture`, lazy catalog reads in canvas controllers, a spatial-hash broadphase,
reused per-frame input objects, paginated catalog, code-split modals, shared singletons
(contact-shadow texture, procedural material cache with disposal). The genuinely high-impact
item is **one unbounded GPU cache** (PERF-001). The rest are medium/low and scale-dependent.

---

## HIGH

### PERF-001 — drei `useGLTF` cache is never evicted → unbounded GPU memory growth across a session
- **Severity:** high
- **Where:** `src/state/slices/userAssetsSlice.ts:56` (`freeResource`) and `:70` (`removeUserFurniture`); load site `src/furniture/GltfModel.tsx:111` (`useGLTF(resolvedUrl)`). Search confirms **no `useGLTF.clear(...)` call exists anywhere** in `src/`.
- **Scenario:** a user uploads several GLBs and/or downloads CC0 models from the catalog (Poly Haven / Poly Pizza), places and later deletes them, switches plans, or just browses-and-resolves many remote entries over a long session. `removeUserFurniture` → `freeResource` revokes the blob URL and deletes the IDB record, but the **parsed three.js scene (geometry + textures), which drei caches globally keyed by the runtime URL, is never disposed.** The blob source is freed; the GPU-resident buffers/textures are not. They accumulate for the whole tab session.
- **Suspected cause:** disposal path was written for blob URLs + IDB only; the drei loader cache (and three's internal `Cache`) was overlooked. Because URLs are unique per asset id, nothing ever collides/overwrites a cache slot either.
- **Fix direction:** on `removeUserFurniture` / `replaceUserFurniture` (old url) / pack-uninstall / remote-evict, also call `useGLTF.clear(url)` (drei) for each freed runtime URL **and** deep-dispose the cached scene's geometries/materials/textures (drei's `clear` disposes the cached object but verify it frees GPU buffers; if not, traverse + dispose before clearing). Also prune the module-level `FOOTPRINT_CACHE`/`SUPPORT_PLANE_CACHE`/`SUPPORT_PLANE_AUTH` entries in `GltfModel.tsx` keyed by `baseUrl(url)` (small, but unbounded over many imports). Optionally add a session LRU cap for *downloaded CC0* browsing so casual browsing can't balloon the cache.
- **Verify (headless):** unit-test a `disposeGltf(url)` helper: load a small GLB via `useGLTF`, assert it's in the cache, call the new free path, assert `useGLTF`'s cache no longer holds it and that a spy on `geometry.dispose`/`material.dispose` fired. Integration: drive `addManyUserFurniture` then `removeUserFurniture` for N defs in a jsdom test and assert the cache size returns to baseline. Manually: `performance.memory` / `gl.info.memory.{geometries,textures}` should return to baseline after import→delete cycles (today they ratchet up).

---

## MEDIUM

### PERF-002 — Orbit mode renders *every* light-emitting fixture as a real point light (ignores `maxFixtureLights`)
- **Severity:** medium
- **Where:** `src/scene/lighting/FurnitureLights.tsx:91` — `const chosen = cameraMode === 'orbit' ? emitters : emitters.slice(0, maxLights)`.
- **Scenario:** at night (or with Lights = on) in the orbit/overview view of a fully furnished multi-room home. The default flat already has ~22 emitter-capable items; a furnished 4–5-room HDB with lamps/pendants/downlights can reach 30–50 emitters. All become live `pointLight`/`spotLight` nodes. Three.js evaluates every non-shadow light per fragment, so fill-rate cost scales linearly with light count over the whole framebuffer — a real per-frame cost in orbit, exactly where the user sees the whole home. Performance tier has no shadows so it's bounded, but Medium+ adds shadow-casting cost elsewhere and the fragment cost remains.
- **Suspected cause:** deliberate ("show all lights, full apartment visible"), but it removes the only GPU budget cap precisely in the densest view.
- **Fix direction:** cap orbit to a generous-but-bounded nearest-N (e.g. `maxFixtureLights * k`), or merge distant/clustered emitters, or keep the cap but raise it per tier. The nearest-N ranking + camera-move gate already exist — reuse them in orbit instead of bypassing.
- **Verify (headless):** with a fixture set > cap and `cameraMode='orbit'`, `manualHour` at night, assert `active.length` is bounded (currently equals total emitters). A `perf.mjs` night-orbit scene with 40 lamps would show the frame-time delta directly.

### PERF-003 — `DragController.onMove` runs several O(n) passes over all items per pointermove
- **Severity:** medium
- **Where:** `src/scene/DragController.tsx:199–398`. Per move it: builds `itemsById` (O(n), :207), builds `others = state.items.filter(...).map(halfExtents)` (O(n), :226), runs the snug-stack candidate scan over `state.items` (O(n), :321), re-reads state and builds `afterById` (O(n), :349), and runs `canPlace` for the dragged item (O(n) over `others`, :368). Plus `wallFaces` rebuilds per move (:270).
- **Scenario:** dragging one piece in a ~200-item furnished home. Each of ~60 pointermove events/sec does ~5 full O(n) scans + a `canPlace` O(n) + alignment/equal-spacing work, i.e. low thousands of OBB/half-extent computations per second. Tolerable at a few hundred items, but it's the hot path most likely to drop frames as scenes grow, and it isn't broadphase-accelerated the way the design-wide scans are.
- **Suspected cause:** the drag path predates / doesn't reuse the `broadphase.ts` spatial grid; it scans linearly.
- **Fix direction:** the smart-alignment `others`, the snug-stack candidate search, and `canPlace`'s neighbour set could all be restricted to the dragged item's neighbourhood via `buildGrid`/`candidatePairs` (already proven for `findItemOverlaps`). Memoize `halfExtents` per item across moves (it only changes on rotation/resize). Cache `wallFaces(wallsForSpacing)` for the drag duration (walls don't change mid-drag).
- **Verify (headless):** unit-test the move handler against a 200-item store and count OBB/`canPlace` invocations per simulated move before/after; assert the broadphase variant produces identical snap/validity results (the broadphase contract is a superset, so exact tests stay green).

### PERF-004 — Pro-tier analysis panels are eagerly imported into the boot bundle
- **Severity:** medium
- **Where:** `src/App.tsx` static imports of `AccessibilityPanel` (:29), `BudgetPanel` (:49), `ClearancePanel` (:51), `CommentsPanel` (:53), `DaylightPanel` (:59), `DesignScorePanel` (:60), `DrawingCalloutsPanel` (:63), `FlagsPanel` (:67), and the analysis modules they pull (`analysis/designScore`, `analysis/accessibility`, `analysis/renovationCost`, `lighting2d/*`, etc.). Contrast with `src/ui/app/lazyComponents.tsx`, which *does* lazy-load the heavy editors/modals (FloorPlanEditor, GlbDesigner, Panorama, HqRender, …).
- **Scenario:** every first paint — including the Simple-tier casual user who never opens any of these — downloads + parses the analysis panels and their pure cores. These are `pro`-tier and forced off in Simple mode (`resolveFlags`), so a large share of users never render them.
- **Suspected cause:** panels were added with static imports while modals went through the lazy registry; the analysis panels weren't migrated.
- **Fix direction:** move the Pro/analysis panels into the `lazyComponents.tsx` `lazyWithRetry` pattern (they already render only when their store flag/panel-open is true, so a Suspense boundary is cheap). Keeps the Simple boot bundle lean.
- **Verify:** `npm run build` and compare the main chunk size + `vite` chunk graph before/after; assert the analysis modules land in their own async chunks. `knip`/bundle-visualizer confirms they leave the entry chunk.

### PERF-005 — Catalog search re-runs full fuzzy ranking over the entire merged catalog on every keystroke (no debounce / deferral)
- **Severity:** medium (scale-dependent — only bites with a large remote index)
- **Where:** `src/ui/catalog/CatalogDrawer.tsx:133` `fuzzySearchSmart(q, unified.all, gridItemText)`, called in render; input at `:251` calls `setQuery` synchronously (`:120`) with no debounce/`useDeferredValue`.
- **Scenario:** the built-in + generated catalog is a few hundred entries (fine). But `unified.all` also includes the browsable CC0 remote index (`useRemoteEntries`), which can be many hundreds to thousands of entries. Each keystroke runs synonym-aware fuzzy scoring over all of them inside the render pass → input lag while typing in a large catalog.
- **Suspected cause:** search was sized for the built-in catalog; the remote index grows it.
- **Fix direction:** wrap the query in `useDeferredValue`, or debounce `setQuery`, or memoize the fuzzy result on `(q, unified.all)` and cap the scored set. Pagination already bounds *render* cost (`PAGE_SIZE` slice at `:151`) — the gap is the *scoring* cost.
- **Verify (headless):** micro-benchmark `fuzzySearchSmart` against a synthetic 2000-entry `all` and assert per-call time; a render-count test on the drawer confirms deferral doesn't re-rank on every keystroke.

---

## LOW

### PERF-006 — `moveItem`/`rotateItem` rebuild the whole items array each call during a drag
- **Severity:** low
- **Where:** `src/state/slices/itemsSlice.ts:84–92` — `set((s) => ({ items: s.items.map(it => it.id===id ? {...it, position} : it) }))`.
- **Scenario:** every pointermove (and press-and-hold nudge) allocates a new N-length array + one new item object. `FurnitureLayer` re-runs its `items.map` (memoized `Furniture` children skip re-render except the moved one, so this is bounded). At a few hundred items the per-move array alloc is small GC churn, not a frame killer.
- **Fix direction:** acceptable as-is for design scale; if profiling ever shows GC pressure, a normalized `Record<id, item>` for items would make moves O(1) — but that's a large refactor and likely net-negative for the rest of the code that maps/filters arrays. **Note: don't fix preemptively.**
- **Verify:** count allocations/GC during a long drag in a 300-item scene; only act if measurable.

### PERF-007 — `SelectionOutline` selector filters all items on every store change
- **Severity:** low
- **Where:** `src/scene/selection/SelectionOutline.tsx:111–115` — `useStore(useShallow(s => s.items.filter(i => selectedItemIds.includes(i.id) && !hiddenItemIds.includes(i.id))))`.
- **Scenario:** the selector body runs on *every* store update (incl. each of the 6+ drag setters per pointermove), doing an O(n·m) filter (n items × m selected/hidden via `.includes`). `useShallow` correctly prevents re-render when the result is unchanged, but the *selector computation* still runs. For the usual 1–2 selected items it's effectively O(n); fine at design scale.
- **Fix direction:** precompute `Set`s for `selectedItemIds`/`hiddenItemIds`, or select `selectedItemIds`/`items` separately and derive in a `useMemo`. Minor.
- **Verify:** count selector executions during a drag; confirm result identity stability already prevents re-render (it does).

### PERF-008 — Module-level GLB caches grow without eviction (footprint / support-plane)
- **Severity:** low
- **Where:** `src/furniture/GltfModel.tsx:31` `FOOTPRINT_CACHE`, `:41` `SUPPORT_PLANE_CACHE`, `:44` `SUPPORT_PLANE_AUTH`. No removal on asset deletion.
- **Scenario:** each distinct GLB url ever loaded leaves a small permanent entry (a few numbers / a boolean). Negligible memory, but it's the same "never evicted" pattern as PERF-001 and should be pruned in the same fix for cleanliness.
- **Fix direction:** export a `forgetGltfCaches(url)` and call it from the asset-free path alongside the `useGLTF.clear` of PERF-001.
- **Verify:** assert cache `.size` shrinks after the free path in the PERF-001 test.

---

## Checked + found efficient (do NOT re-audit)
- **`frameloop="demand"` + `RenderPump`** (`scene/RenderPump.tsx`): single rAF, reused `PumpInputs` object (no per-frame alloc), pure `renderDecision.ts`, idle = 0 frames, hidden-tab guard. Exemplary.
- **`Furniture` memoization** (`furniture/Furniture.tsx:209`): `React.memo` with an exact equality fn on `item`/`def`/flags — dragging one item does not re-render the others. `FurnitureLayer` memoizes the hidden `Set` and level-elevation map.
- **Catalog memoization** (`furniture/catalog.ts`): `useCatalog` memoizes the merge on its input slices; `useCatalogGetter` is a non-reactive ref so canvas controllers (DragController, ClearanceOverlay, LuxOverlay, SelectionOutline) never re-render on catalog churn — the documented bulk-import-storm fix holds.
- **Collision broadphase** (`collision/broadphase.ts` + `placement.ts:212` `findItemOverlaps`): spatial-hash grid turns the design-wide scan into ~O(n); frame-scoped single-slot memo for repeated same-frame callers (Clearance/Score/report). `findWallClips` similar.
- **`FurnitureLights`** (`scene/lighting/FurnitureLights.tsx`): gates the nearest-N rebuild on real camera-move (`CAM_RECOMPUTE_SQ`) and items-identity change, keys the active set to skip no-op `setActive`, renders nothing in daylight. (Orbit-uncapped count is PERF-002, separate.)
- **`LuxOverlay`** (`scene/LuxOverlay.tsx`): quantized light levels so sub-% sun drift doesn't churn the memo; disposes superseded `DataTexture`s on recompute + unmount; non-reactive catalog.
- **`GltfModel`** (`furniture/GltfModel.tsx`): clones tint/finish materials only when needed and disposes those clones on re-run + unmount; shares cached geometry; authoritative-footprint guard avoids recompute. (Its gap is the *upstream* cache eviction, PERF-001.)
- **History** (`state/slices/historySlice.ts`): snapshots share slice references (no deep clone), `appendCapped` amortizes the cap — bounded memory, cheap pushes; streaming edits coalesce.
- **Catalog drawer** (`ui/catalog/CatalogDrawer.tsx`): paginated (`PAGE_SIZE` slice) so a big category/search never mounts hundreds of cards. (Search *scoring* is PERF-005, separate.)
- **Code-splitting** (`ui/app/lazyComponents.tsx` + `lazyWithRetry.tsx`): heavy editors/modals (FloorPlanEditor, GlbDesigner, Panorama, HqRender, RenderCompare, Versions, Elevation, History, Tour, Wizard) are dynamically imported; `three-bvh-csg`, GLTF/OBJ exporters are dynamic-imported at call sites. Only the Pro analysis panels remain eager (PERF-004).
- **Material cache** (`materials/cache.ts`): keyed with generation size; `disposeCachedMaterial` frees GPU maps on user-material delete; procedural worker hot-swaps textures and disposes the old maps.
- **`InstancedBoxes`** (`scene/InstancedBoxes.tsx`) collapses repeated batten/shelf geometry — instancing applied where it's a clear win.
- **`ContactShadow`** (`scene/ContactShadow.tsx`): one shared `CanvasTexture` singleton across all blobs.

---

### Priority order
1. **PERF-001** (high) — GLB cache eviction; the only finding that can crash the context over a long session.
2. **PERF-002** (medium) — orbit light cap; the clearest steady-state frame cost at scale.
3. **PERF-003** (medium) — broadphase the drag path.
4. **PERF-004** (medium) — lazy-load Pro analysis panels (Simple boot win).
5. **PERF-005** (medium) — defer/debounce catalog search.
6. PERF-006/007/008 (low) — only if profiling justifies; note explicitly *not* to fix PERF-006 preemptively.
