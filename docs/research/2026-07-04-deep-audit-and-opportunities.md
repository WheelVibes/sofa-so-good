# Deep audit & opportunities — 2026-07-04

A fresh, ranked, engineer-actionable backlog refill. Every item below is **pure-client-doable**
in this frontend repo (no backend / real-GPU / licensed-asset deps — those are already tracked as
blocked in `TODO.md`/`TASKS.md`) and was **verified absent** from `CHANGELOG.md`, `TODO.md`, and
`TASKS.md` (already-shipped / already-tracked work is noted as such and not re-logged).

Scope note: the app is very mature. Whole categories a naive audit would flag are already shipped —
moodboard/style-board (`ui/moodboard.ts`), saved camera views (`ui/toolbar/menus/SavedViewsSection.tsx`),
style-quiz onboarding (`ui/StyleQuizModal.tsx`), measurement slice (`state/slices/measurementsSlice.ts`),
grid-snap + numeric wall entry (`floorplan/gridSnap.ts`, `wallNumericEntry`), grouped shopping-list /
room-schedule / cost CSV (`ui/shoplist.ts`, `ui/shoppingCsv.ts`, `ui/openCostBreakdownCsv.ts`),
**client-side URL-encoded share links** (`features/planShare.ts`, `ShareModal.copy3dLink`), A4 print
drawing-set (`ui/drawingSet.ts`), per-frame allocation hygiene, Zustand `useShallow` discipline, worker
offload of export/convert/optimize, bundle chunking, and `safeUrl` href/src sink hardening (SEC-001).
The genuinely-open, high-value items are below.

---

## Top 5 by value ÷ effort (across all axes)

1. **REAL-1** — apply anisotropy to DLC/uploaded material textures (S, near-zero risk, big visual win).
2. **PERF-B** — memoize `useMaterials()` merged-catalog rebuild (S–M, broad per-render CPU/GC win).
3. **PERF-A** — bound the wall/floor/ceiling material cache with the existing LRU (M, prevents a
   session-long VRAM ratchet → WebGL context-loss crash).
4. **BUG-2** — stop IndexedDB blob eviction from silently, permanently deleting placed furniture (M, data safety).
5. **BUG-1** — track `pointerId` in furniture drag so multi-touch doesn't teleport items (M, mobile core-loop).

---

## Axis 1 — Optimization / performance & memory

### PERF-A — Unbounded wall/floor/ceiling material cache ratchets VRAM to context loss  · M · risk: med
**Why it matters.** `CACHE` in `materials/cache.ts:23` is a plain unbounded `Map` with **no eviction**
(the only removal path, `disposeCachedMaterial:201`, is never called — see PERF-D). Every distinct
finish id ever built stays resident forever: custom `#RRGGBB`, `compose:<pattern>:<#hex>`,
`tint:<baseId>:<#hex>`, each with an optional `@<scale>` suffix. For any non-plaster procedural/composed
finish, `buildMaterial` (`:117-197`, `CACHE.set` at :155/:170/:195) synchronously mints a full
albedo+normal+roughness set (3 `CanvasTexture`s, 256²–512²) that is **never disposed**. Live colour/scale
scrubbing on a wall/floor leaks a material + up to 3 GPU textures per distinct value → VRAM climbs
monotonically toward context loss. This is exactly the AUD-002 bug already fixed for *furniture* materials
(`materials/furnitureMaterials.ts:532-542`, bounded LRU + dispose-on-evict) but left unfixed on the
wall/floor/ceiling path.
**Where.** `materials/cache.ts:23,117-197`; fix uses the existing `materials/materialLru.ts`.
**Fix.** Swap the raw `Map` for `LruCache` (bounded `max` + dispose-on-evict, deferred one frame), reusing
the `OWNED_TEXTURES` WeakSet pattern from `furnitureMaterials.ts:508-526` so shared singletons
(`getPlasterNormal`/`getPlasterRoughness`) are never disposed.
**Risk.** Must not evict/dispose a material still referenced by a live surface, and must exempt shared
singletons — the furniture path already solved both, so mirror it.

### PERF-B — `useMaterials()` rebuilds the entire merged catalog on every finished-surface render · S–M · risk: low
**Why it matters.** `materials/useMaterial.ts:25-42` `useMaterials` has no memo — it spreads
`BUILTIN_MATERIALS` and loops generated/user/remote/saved materials into a fresh object **every call**.
It's consumed via `useMaterialDef` (`:80`) by every wall face, floor, ceiling tile, and finished furniture
part (`apartment/walls/WallSegment.tsx`, `RoomShell.tsx`, `PlanRoomShell.tsx`, `floor/RoomFloor.tsx`,
`ceiling/RoomCeilingTile.tsx`, `furniture/FurnitureMaterialLoader.tsx`). One render pass over a furnished
plan does O(surfaces × catalogSize) object construction + GC churn, and re-runs on any of those surfaces'
re-renders.
**Where.** `materials/useMaterial.ts:25-42`.
**Fix.** Memoize the merged map at module scope keyed on the `[userMaterials, resolvedRemoteMaterials,
savedMaterials]` slice references (already stable via `useShallow` selectors), rebuilt only on change so
all surfaces share one build per commit.
**Risk.** Low — pure derivation; just ensure the cache key covers every input slice.

### PERF-C — Synchronous procedural bake blocks the main thread on finish apply / scrub · M · risk: low
**Why it matters.** The procedural branch of `buildMaterial` (`cache.ts:158-180`) calls
`generateProcedural` **synchronously** (paints 256²–512² albedo + `heightToNormalRGBA` + roughness on the
calling thread) and only *then* schedules the off-thread upgrade (`:177`). So the first apply of a
`compose:`/`tint:` procedural finish — and again per distinct value during a colour/scale scrub — hitches
a frame right during the interactive gesture. (Plaster / plain `#hex` reuse the shared normal, so they're
cheap; this is tile/wood/stone/composed only.)
**Where.** `materials/cache.ts:158-180`, `materials/procedural/generators.ts:237-259`.
**Fix.** Debounce finish commits to pointer-settle (apply on release, not per pointermove), and/or serve a
cheap solid/plaster preview during the drag and bake the real set on release. Complements PERF-A (fewer
distinct bakes → fewer cache entries).
**Risk.** Low; preview-then-commit is a known pattern here (EditConfirmBar).

### PERF-D — `disposeCachedMaterial` is dead code (overlaps tracked DE-4a) · S · risk: low
**Why it matters.** `cache.ts:201` correctly frees a material + its maps but is never called; user/custom
material deletes (`savedMaterialsSlice.ts:85 removeSavedMaterial`) only splice the list + revoke object
URLs. Already logged as **DE-4a** in `TASKS.md` — recorded here only to note it is **largely subsumed by
PERF-A**: with a dispose-on-evict LRU, evicted entries free automatically and this becomes a small
explicit-eviction-on-delete nicety rather than a standalone fix.

*(Audited and confirmed clean — no action: per-frame `useFrame` allocations across `scene/**`,
`apartment/**`, `furniture/primitives/**` reuse ref temporaries; Zustand consumers use `useShallow`
correctly; `vite.config.ts` bundle chunking + lazy-loads heavy deps. See run notes.)*

---

## Axis 2 — Refactoring / tech-debt

### REFAC-1 — `InspectorPanel.tsx` is a 1205-line monolith · M · risk: low
**Why it matters.** Root `CLAUDE.md` forbids monolithic files. One component holds ~10 inline action
handlers — `flip`/`rotate90`/`tryMove`/`trySetRot`/`faceIntoRoom`/`centreInRoom`/`duplicate`/
`duplicateRadial`/`duplicateRow` (the duplicate-* family alone is ~163 lines, `InspectorPanel.tsx:194-360`)
— plus ~17 section blocks. It's the second-most-churned inspector file and not tracked anywhere.
**Where.** `ui/inspector/InspectorPanel.tsx`.
**Fix.** Extract the duplicate-* family into a `useItemDuplication` hook/module (pure placement math already
lives in `arrayPlacement.ts`/`radialArray.ts` — the panel just needs the collision-check + commit glue) and
the transform actions into `useItemTransforms`; `GltfBody`/`ParametricBody`/`PathArraySection` sub-panels
already exist as the decomposition precedent. Behaviour-preserving, incremental (one hook per commit).
**Risk.** Low if each extraction is verified interactively (same as the FloorPlanEditor split).

### REFAC-2 — `FloorPlanEditor.tsx` regrew to 3186 lines (tracked MOD-FPE-SPLIT baseline was 2728) · note
**Why it matters.** PLAN-FURNISH Phase 1 added ~458 lines, reversing the MOD-FPE-SPLIT reduction. This is
an **update to the already-tracked MOD-FPE-SPLIT item**, not a new one: the deferred `PlanToolbar`
extraction (the ~620-line toolbar/control JSX fragment bundle) is now more justified than when it was
deferred, and the new furniture-placement dispatch code is a candidate for the same pure-helper +
thin-dispatch treatment the pointer tools already use.
**Where.** `ui/floorplan/FloorPlanEditor.tsx` (3186 lines).
**Fix.** Revisit the `PlanToolbar` lift and factor the PLAN-FURNISH placement math into a pure module under
`editor/`, per `editor/CLAUDE.md`.

---

## Axis 3 — Latent bugs / edge cases

*(All confirmed against source; the two known TASKS.md bugs — nested Select closing the toolbar menu, and
"Turn off light source" — are excluded.)*

### BUG-1 — Multi-touch furniture drag teleports between fingers (no `pointerId` tracking) · M · high
**Where.** `scene/DragController.tsx:105-109` (`onMove`), `:361-370` (`onUp`), `:556-558` (window
listeners); drag starts in `furniture/Furniture.tsx:90-132` and never records a pointerId.
**Failure scenario.** On a phone, press-drag a sofa with one finger, then rest a second finger (natural
pinch attempt). The window `pointermove` filters only on `draggingItemId`, not `ev.pointerId`, so the
second finger's coords drive `project()` + `moveItem` → the sofa teleports to the second finger and
oscillates. The first `pointerup` from *either* finger ends the drag (`onUp` also ignores pointerId),
committing the item at the wrong spot.
**Fix.** Capture the initiating `pointerId` in `startDrag`; ignore other pointers in `onMove`/`onUp`. M.

### BUG-2 — IndexedDB blob eviction silently & permanently deletes placed furniture · M · high
**Where.** `state/storage/hydrateAssets.ts:93` (`if (!rec) continue`) → `state/storage/hydrate.ts:67` →
`state/schema.ts:648` (`items.filter(it => knownDefIds.has(it.defId) …)`).
**Failure scenario.** User uploads a GLB (`user-<assetId>`, blob in IDB) and places 5 of them; layout
autosaves to localStorage. Browsers evict IDB and localStorage independently under storage pressure. On next
boot the blob is gone, so the def is skipped, its id isn't in `known`, and all 5 items are filtered out of
the restored design. The **next autosave then persists the design without those items** → permanent, silent
loss with no user warning (`droppedItemIds` is computed but yields no placeholder).
**Fix.** Retain orphaned items behind a "missing asset" placeholder, or refuse to overwrite the autosave when
any def failed to resolve (and surface a toast). M.

### BUG-3 — `baselinePlan` goes stale after undoing a plan load → wrong hacking plan & renovation cost · M · high
**Where.** `state/slices/historySlice.ts:78-89` — `snapshot()` **excludes** `baselinePlan` (confirmed: the
`HistorySnapshot` captures items/doors/finishes/floorPlan/comments/callouts/quote/priceRules, not
`baselinePlan`). Set by `floorPlanSlice.ts:408-422 loadSavedPlan` / `:523 resetFloorPlan` / `:535
newFloorPlan`; consumed by `ui/report.ts:682` and `ui/drawingSet.ts:362-383`.
**Failure scenario.** Load plan A (baseline=A, floorPlan=A). Load plan B (history snapshot records
floorPlan=A; sets baseline=B, floorPlan=B). Press **Undo**: `floorPlan` reverts to A, but `baselinePlan`
stays B. Open the Hacking/Demolition plan or reno-cost report → it computes `diffWalls(baseline=B, plan=A)`
and reports walls "demolished"/"added" that were never touched → a bogus real-money HDB reno estimate. Same
after undoing Reset-to-HDB / New-plan.
**Fix.** Include `baselinePlan` in `HistorySnapshot`, or recompute it only on load-type actions. M.

### BUG-4 — De-duped "Item deleted" toast's Undo only restores the second of two ~1 s-apart deletes · M · med
**Where.** `state/slices/itemsSlice.ts:172` (`pushHistoryCoalesced('delete')`) + `:211-219` (toast
`onAction: () => get().undo()`); de-dupe at `state/slices/notificationsSlice.ts:127-142`.
**Failure scenario.** Delete A at t=0 (snapshot S0=[A,B,C], Toast1). Delete B at t≈1000 ms — past the 500 ms
`COALESCE_MS` window, so a *second* snapshot S1=[B,C] is pushed. The second toast **de-dupes** against Toast1
(same kind+title+message) and the de-dupe keeps the **old** toast (`{...dup, createdAt}` at :139), discarding
the new `onAction`. User sees one toast; clicking Undo runs `undo()` which pops only S1 → restores B. A stays
deleted with no affordance; the user believes Undo fixed it and silently loses A.
**Fix.** Bind the toast Undo to a specific history depth/target, or stack per-delete toasts instead of
de-duping across separate history steps. M.

### BUG-5 — `duplicateLevel` keeps `groupId` → furniture groups bridge two storeys · S · med
**Where.** `state/slices/floorPlanSlice.ts:1216-1220` (item clone re-ids `id`/`levelId` but **not**
`groupId`); `groupsSlice.ts` ops are keyed purely on `groupId`, not level-gated.
**Failure scenario.** Group chairs X, Y (`groupId=g1`) on the ground floor. `duplicateLevel('ground')` →
clones X′, Y′ keep `groupId=g1`. Now `groupRotate('g1', …)`: `itemsInGroup('g1')` returns X, Y, X′, Y′ across
both storeys and `groupCentroid` averages across levels → rotating the ground group also spins the upper
copies about a meaningless cross-level centroid. `ungroup`/`removeFromGroup` likewise hit both storeys.
(Wall/room/opening/finish ids are correctly remapped via `cloneLevelGeometry`; only item `groupId` is missed.)
**Fix.** Build an old→new `groupId` map for the cloned items, mirroring the wall/room id remap a few lines
below. S.

### BUG-6 — `moveLevel` restacks elevations off-by-one (uses each level's own ceiling height) · S · med
**Where.** `state/slices/floorPlanSlice.ts:1308-1312`.
**Failure scenario.** Ground ceiling 2.6 m; upper A `ceilingHeight=4.0`, upper B `2.6`. Reorder
(`moveLevel`): restack runs `elevation = top + (l.ceilingHeight ?? plan.ceilingHeight) + slab`, using the
*current* level's ceiling to compute *its own* floor elevation. Physically a slab sits atop the level
**below**, so A's elevation should use the below-level's ceiling. Result: the 4.0 m-ceiling storey floats
~1.4 m too high (gap between storeys), and even unchanged-order levels shift. (`addLevel:1175-1186` sidesteps
this by always using ground's height as a fixed gap, so the two paths disagree.)
**Fix.** Offset the height reference by one level (accumulate `top` using the previous level's ceiling). S.

### BUG-7 — Increasing an opening's width via the inspector doesn't re-clamp its offset → overflows wall end · S · low
**Where.** `state/slices/floorPlanSlice.ts:936-943` (`updateOpening` blindly merges patch); UI
`ui/floorplan/editor/inspector/OpeningInspector.tsx:106` clamps only `width ≥ 0.1`, and the offset clamp at
`:99` uses `maxOff` from the *old* width.
**Failure scenario.** Wall 2.0 m, door `offset=1.5, width=0.4` (ends at 1.9). Increase width to 0.9 → offset
stays 1.5, door spans 1.5–2.4 and pokes 0.4 m past the wall end (`duplicateOpening`/`splitWall` clamp
offsets; the width-edit path doesn't).
**Fix.** Clamp `offset` to `[0, wallLen − newWidth]` when width changes. S.

---

## Axis 4 — Security (client-side)

### SEC-1 — Runtime GLB render loaders lack the URL-blocking `LoadingManager` the convert path uses · S · risk: low-med
**Why it matters.** The **convert** path hardens against external fetches: `furniture/convert/loadToObject.ts:33-41`
installs a `LoadingManager.setURLModifier` that rewrites any non-`data:`/`blob:` URL to a sibling blob or a
blank PNG, so a dropped model can't reference `http://evil/…`. But the **render** path does not: `GltfModel`
uses drei `useGLTF` (`furniture/GltfModel.tsx:230`) with no URL modifier, and `catalog/packs/thumbnail.ts:23`
+ `catalog/remote/resolver.ts` use a bare `GLTFLoader`. A crafted `.glb`/`.gltf` whose embedded glTF JSON
sets an image/buffer `uri` to an absolute external URL would trigger an outbound fetch on render — a tracking
beacon / IP-leak / SSRF-lite from opening someone else's shared or imported design. (Uploaded models usually
pass through convert+optimize, but `prune()` only drops *unused* data — an external URI on a *used* texture
survives; remote/shared GLBs load directly.)
**Where.** `furniture/GltfModel.tsx:230`, `catalog/packs/thumbnail.ts:23`, `catalog/remote/resolver.ts`.
**Fix.** Give the render/remote/thumbnail `GLTFLoader`s the same blank/blob-only `setURLModifier` (allow
`data:`/`blob:`, block everything else) so a crafted asset can never phone home. S. Defense-in-depth,
consistent with the existing `safeUrl` SEC-001 sink guard.
**Risk.** Low — self-contained GLBs use only embedded `data:`/`blob:` resources, so legitimate assets are
unaffected; verify the bundled CC0 catalog still resolves (it should — bundled GLBs are self-contained).

---

## Axis 5 — Realism (client-doable, not GPU-frontier)

### REAL-1 — DLC / uploaded material textures never get anisotropic filtering (blurry at grazing angles) · S · high value
**Why it matters.** `anisotropy.ts` (RD-401) exists precisely to kill "the single biggest game-ish blur
tell" and is routed through **every CanvasTexture** creation site (procedural, furniture, ContactShadow,
CornerAO). But the `textured` branch of `buildMaterial` (`materials/cache.ts:181-193`) — which receives
`Texture`s loaded by drei `useTexture` for **DLC CC0 materials** (ambientCG/Poly Haven) and **user-uploaded
materials** via `useTexturedMaterial` (`materials/useMaterial.ts:123-140`) — sets `wrapS`/`wrapT`/`repeat`
but **never calls `applyAnisotropy`**. So exactly the high-fidelity photo-textured floors/walls users pick
render blurry at grazing angles, while the procedural fallbacks look sharp — an inconsistent, avoidable
quality regression on the surfaces meant to look best.
**Where.** `materials/cache.ts:181-193` (add `applyAnisotropy(t)` in the `textured` loop, tracking each map
so `setMaxAnisotropy` re-applies the device cap).
**Fix.** Call `applyAnisotropy(t)` on each of `albedo/normal/roughness/ao` in the `textured` branch (mirrors
the `imageBitmapToTexture` path at `:62`). S.
**Risk.** Near-zero — anisotropic filtering is effectively free on all target hardware and needs only
mipmaps (loaded textures get them); `setMaxAnisotropy` clamps to the device max.

---

## Axis 6 — Value-add features via competitor research

Most candidate features are **already shipped** (see the scope note at top). Two genuine, on-loop,
pure-client gaps remain; one new reference app is worth adding.

### FEAT-1 — Time-of-day comparison split / clip-slider view · S–M · risk: low
**Who has it.** Sweet Home 3D (sunlight by time-of-day + location), RoomSketcher (compare snapshots
side-by-side). Sources: sweethome3d.com/features, roomsketcher.com/blog/visualize-your-interior-design-ideas.
**Why it fits.** Time-of-day lighting already exists (`TimeOfDaySlider`, location/sun rig); a split-screen or
draggable clip-slider comparing the *same* camera at, e.g., 10 am vs 8 pm makes the natural-light story
legible — a compelling "view" moment and a real HDB selling point (which units get evening sun). It's the
"view/share" cap on the loop, not analytics.
**Client-doability.** Render the scene twice into two viewports at two `time` settings (or a CSS clip-slider
over one canvas), reusing the existing lighting rig. Pro tier.

### FEAT-2 — Mirror / reflect a selection across a room axis · S–M · risk: med
**Who has it.** Floorplanner (rotate & mirror plans), Roomle (duplicate/positioning). Source:
floorplanner.com manual, docs.roomle.com/rubens/whats-new/2025/january-2025.
**Why it fits.** Duplication modes today cover linear/grid/radial/path (`arrayPlacement.ts`, `radialArray.ts`,
`pathArray.ts`) and single-item flip (`InspectorPanel` flip x/z), but **mirroring a furnished zone / group
across a chosen axis** (twin bedrooms, symmetric living layouts common in HDB) is absent — the natural fifth
array mode. Speeds the arrange step.
**Client-doability.** Pure transform math on the selection/group across an axis with re-facing, reusing the
existing collision-check + single-undo commit path the other array tools use. Pro tier.
**Risk.** Medium — must re-face mirrored asymmetric items correctly and re-run collision (skip-and-report
blocked copies, like radial).

*(Deferred / note-only: 2D **elevation/section** views (Live Home 3D / Sweet Home 3D) are client-doable via
an orthographic cut-plane camera but effort L and niche — a TODO, not near-term.)*

### New reference app found → add to `REFERENCES.md`
- **Mattoboard** — https://mattoboard.com/ — real-time 3D materials & furniture *moodboard / "DesignStream"*
  tool for designers; the strongest new on-mission find, directly relevant to our existing moodboard export
  (study its live-materials board UX).

*(Other apps surfaced but not worth adding — all in already-blocked buckets: Decor8 AI, InstantInterior AI,
RoomGPT, Interior AI (photo-restyle → backend/AI), MagicPlan (native LiDAR scan).)*
