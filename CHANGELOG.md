# Changelog

Autonomous improvement log for the HDB 3D interior-design sandbox. Newest first.
Each entry corresponds to one focused commit (C1–C250 on
`claude/codebase-analysis-optimization-f6yag0`, C251+ on
`claude/codebase-analysis-optimization-ny3xm9`). See `TASKS.md` for the backlog.

## [C251 / Q31 part 2] Drag finish swatches onto the 3D canvas — raycast drop
Dragging a swatch from the finish picker and releasing it over the 3D view now applies the
finish to whatever is under the cursor — room floor, wall, or furniture item — completing the
Q31 drag-to-apply program (part 1 shipped the pure payload/`resolveFinishDrop` core + Layers-row
drops). New pure classifier `scene/finishDropTarget.ts` walks the raycast hit list, skipping
invisible hits (the camera-facing wall reveal toggles `visible`, which three's Raycaster does
NOT skip) and untagged meshes (grid/gizmos/sky), and classifies via `userData` tags
(`itemId` on `Furniture` roots; `finishTarget {kind, roomId}` on floor meshes, wall interior
faces, and room-editor shells). `scene/FinishDropSurface.tsx` does the thin DOM wiring in BOTH
Canvases (main + room editor): native `dragover`/`drop` on the GL canvas (R3F's pointer system
never sees HTML5 drag events), `dropEffect='copy'` feedback, manual `Raycaster.setFromCamera`,
and it only claims events carrying the finish MIME — catalog-card placement and upload drops
untouched. Commits flow through the new shared `state/finishDropApply.ts` (now also used by the
Layers rows): exactly one undo step per drop, floor/wall recents, success toast — and it fixes a
latent part-1 bug by normalising raw catalog ids to `mat:<id>` on item drops (previously fell
back to generic wood). Part 1 had shipped ungated, so this adds the `finishDnd` flag
(`tier: 'simple'`, default on) gating picker dragstart + both drop surfaces. Touch keeps the
existing tap-to-apply flow (HTML5 DnD doesn't exist there). +18 tests (classifier, apply path,
both-modes flag). Visually verified headless: floor → checker, wall → navy, table → ebony in
one session with `past` 1→4, foreign-payload and sky drops no-ops; docs updated. Deferred:
custom-plan overview wall drops no-op (overview walls are unassociated fade boxes); transient
target highlight skipped under frameloop=demand.

## [C254 / PERF-FOLLOWUPS] History cap amortisation + frame-scoped overlap memo
Two backlog micro-optimisations. `historySlice.appendCapped` no longer slice-and-spreads the
whole past stack on every push once the 50-entry cap is hit: the stack grows into a 16-entry
headroom band and is trimmed back to the cap with ONE amortised slice, so steady-state pushes
stay a single spread copy; undo depth is always ≥ the cap and undo/redo/jump semantics are
unchanged (new tests pin the trim point, dropped-oldest order, and a full undo drain across a
trim). `collision/findItemOverlaps` gains a frame-scoped single-slot memo: same-task calls with
unchanged `items`/`defs` identities (several panels can scan in one render pass) return the
cached array allocation-free; it invalidates on identity change and self-expires on microtask
flush because OBBs read the mutable GLB-footprint cache. +6 tests; behaviour-preserving (full
suite green).

## [C253 / X-SHOP tail] SG retailer expansion in the dev price sidecar — Courts/HipVan/Castlery
The dev-only live-pricing sidecar (`scripts/price-server.mjs`) now has three retailer adapters
alongside IKEA SG: Courts (Magento GraphQL search), HipVan (Algolia-style hits), Castlery
(JSON-LD products in the search page HTML), each following the existing convention — pure
exported parser + URL builder, candidates re-ranked by fuzzy name match
(`scoreNameMatch`/`pickBestMatch` with the retailer's own top hit as fallback), all upstream
fetches timeboxed at 8 s, shape drift degrading to a 404 `no match` and network errors to a 502
`{error, retailer}` (never a crash). `/price` responses carry `retailerLabel`. Client:
`livePrice.ts` adopts the retailer list from `/health` (never hardcoded), fetches all retailers
per item in parallel with per-retailer failures dropping out, and returns offers
**cheapest-first**; the Budget panel prices each line/total by the cheapest offer and renders a
wrappable cheapest-first row of retailer buy links. Gating unchanged: the same devOnly pro-tier
`livePrices` flag, with a new test asserting it stays off in prod (Simple AND Pro). Verified
desktop 1600×1000 + mobile 390×844 with a stubbed sidecar: offers render cheapest-first, a 404
retailer drops silently, 4-offer rows wrap cleanly. The retailer URL/response shapes are
best-effort offline reconstructions — a real-network verification pass is tracked in TODO.md.
+15 tests.

## [C249 / T3] Per-LOD tiers for uploaded models — in-browser -low/-medium generation + tier-routed loading
Uploads now get the same `-low`/`-medium` LOD siblings the offline `optimize:glb` pass bakes for
bundled/IKEA GLBs, generated **in the browser** inside the existing optimize worker:
`furniture/optimize/lodVariants.ts` takes the optimized GLB and, per tier, downscales textures to
the shared `TIER_BUDGETS` caps (512/1024 px WebP) and decimates with meshopt `simplify`
(ratio 0.5/0.75, error 0.01) before dedup/prune + Draco — mirroring `optimize_glb_lod.mjs`
including its fallbacks (simplify failure → textures-only tier; tier failure or a variant that
doesn't shrink → tier omitted; nothing ever blocks an upload). Tiers persist as sibling IDB
records under derived `<assetId>:lod-<tier>` keys (`meta.role='lod'`), are re-resolved on boot by
`hydrateAssets`, and are deleted with their base asset. Runtime selection reuses the builtin path:
`gltf/lod.ts` gains a variant **registry** (blob URLs can't be suffix-probed) that
`resolveLodUrlSync`/`prewarmLod`/`baseUrl` consult first, so `GltfModel`'s existing
`effectiveAssetTier` routing serves the `-low` upload on the Performance render tier with zero new
render code. The upload dialog gets a default-on "Generate low-detail versions for slower devices"
opt-out (the tiers roughly triple per-model optimize time — measured headless/SwiftShader on an
8.6 MB 131k-tri GLB: optimize 32 s, +71 s for both tiers; real GPUs are far faster but it's well
past the 5 s silent threshold). meshoptimizer (already in the tree via @types/three) is now a
declared dep, dynamic-imported so it stays in the lazy optimize chunk. 18 new unit tests (tier
params, key derivation, registry selection, persist/hydrate/delete round-trip); verified headless
end-to-end: upload → base 4.63 MB + low 1.09 MB + medium 1.70 MB in IDB, in-page reboot rehydrates
the registry, and the Performance tier draws the low variant (67.6k tris rendered vs 133.0k on
the original — 0.508, right on the 0.5 target) with the model rendering cleanly.

## [C248 / F24] Pinned design comments — level-aware pins + panel, travels with saves/links
Sticky-note feedback on a design (the PROD half of F24; live presence stays backend-deferred):
`commentsSlice` holds `{id, position:[x,z], levelId?, text, author?, createdAt, resolved}` with
add/edit/resolve/delete actions that each push ONE undo step (`comments` joined the history
snapshot, and the History timeline labels the steps). Mirrors the annotations architecture:
an optional + additive `comments[]` in the save schema (no version bump) rides `serialize`/
`applySerialized`, so pins persist through autosave, `.sofa.json` export AND the `#/design/`
share link (designShare reuses serialize — covered by a round-trip test). 3D: `CommentPins.tsx`
renders a numbered teardrop bubble per pin at its storey's elevation (`levelElevation`, hidden
with its level like furniture; resolved pins dim green ✓); click opens an in-scene popover with
the note + resolve/delete. Placement mirrors the tape measure: `commentMode` arms a transparent
priority-raycast floor plane at the in-view storey's elevation — one tap → `promptText` →
pin (Esc disarms). `CommentsPanel` (`.aux` slot) lists open/resolved with click-to-focus (jumps
storey filter when needed), edit, resolve, delete. Gated end-to-end by a new `comments` flag
(pro tier, default on): Tools menu (with pin count), mobile Tools sheet, ⌘K (`COMMAND_FLAGS`),
and the pins themselves. Tests: slice CRUD + undo/redo, schema + share-link round-trips incl.
levelId/resolved, flag both-modes; two-storey placement + resolve verified visually.

## [C250 / V-TOUR] Cinematic tour through saved views
Competitor parity with Coohom's video walkthrough (2026 research pass — sources in TASKS):
`setTouring('views')` flies the camera through the user's SAVED VIEWS in order (pure
`viewTourFrames`, malformed poses skipped, ≥2 required; 3.5 s eased legs vs the room tour's 2.5 s)
and applies each destination view's captured lighting as its leg begins — a dusk shot plays at
dusk. "Cinematic tour" entries in the saved-views menu + mobile sheet (≥2 views); pairs with the
existing Record clip for an exportable .webm. `touring` widened to `false|'rooms'|'views'`
(boolean back-compat kept + tested). Verified mid-flight: camera interpolating with dusk
transitioning in.

## [C244 / GE2b] Drag gizmo for GLB-designer parts — translate/rotate/scale
The selected part in the 3D asset designer now carries a drei `TransformControls` gizmo in the
live preview: a **Move / Rotate / Scale** segmented control overlays the preview's top-left
(plus Blender-style G/R/S keys scoped to the dialog — it now registers with `modalGuard`, so
global scene hotkeys no-op while it's open). The gizmo is the fast path, the numeric fields stay
the precision path: a finished drag (coalesced per drag-END, never per frame) is mapped by the
pure `furniture/glbEdit/gizmoWriteBack.ts` `gizmoPatch` onto the part's existing fields and
routed through the same `updatePart` the inputs use — positions snap to 5 mm (clamped ±3 m),
rotations to 1° normalised to [-180, 180) (all-zero clears the field), scale multiplies `size`
per axis (min 0.02 m) and the live object's scale resets to 1 (geometry rebuilds at the new
size). Combined `mesh` parts (CSG results) move/rotate only — their triangles are baked, so the
Scale mode is hidden and the Edit section says so. OrbitControls pauses while a handle is
dragged (drei's `makeDefault` + `dragging-changed` wiring). Write-back mapping unit-tested
(19 cases); gizmo render in all three modes verified headless.

## [C247 / F21] WebXR VR walkthrough — gated entry + inert provider
`@react-three/xr` wired behind a `vrWalkthrough` flag (pro): `scene/xr/` holds a pure
`detectVrSupport` (3 tests), a lazily-created singleton XR store, and `MaybeXr` — an inert
pass-through wrapper inside the Canvas that only mounts the XR provider (and loads its chunk)
once a session is requested, unwinding when the headset session ends. "Enter VR" appears in the
View menu + mobile View sheet only when the flag is on AND `immersive-vr` is supported; the store
is pre-created on support detection so the click keeps its user activation. Verified headless
with a mocked `navigator.xr` (item renders; scene unchanged through the inert wrapper); an
actual headset session is real-device-deferred by nature.

## [C245 / F27] "Redesign this render" style-variant explorer on the AI photoreal path
Once a "Make photoreal" result exists in the Share modal, style chips (Scandinavian / Japandi /
Industrial / Luxury / Tropical — descriptors reuse the `briefParser.ts` keyword vocabulary so the
app speaks one style language) re-run the SAME BYO-key i2i call on the SAME captured snapshot
with a style-modified prompt, building a small gallery: thumbnail row (original + one entry per
style, replace-on-rerun), click to view full, per-variant download. Pure
`ai/styleVariants.ts` (`buildVariantPrompt` strips known style/theme segments then leads with the
new style — chips replace, never stack) + pure `ui/ai/variantGallery.ts` reducer (one in-flight
at a time, stale-result guard after a re-seed), both unit-tested at the same boundary as the
existing photoreal tests (the live round-trip still needs a real key). Stays inside the existing
`aiPhotoreal` flag: it is the same feature surface (an extra control on the same Share-modal
section, same provider/key/error path), not a new ship decision. Errors surface inline exactly
like the original path; key handling unchanged (localStorage only, never bundled). Visually
verified desktop + 390px mobile with a mocked provider (chips wrap, selected thumb outlined).

## [C246] Preset circulation guard + WFH studio re-spacing
New regression test: no shipped layout preset may have a tight pinch below 0.5 m between two
large circulation pieces (≥0.5 m² each; coffee-table seating adjacency and small decor excluded —
those are intentional and stay as in-app advisory hints). It caught one real defect: the WFH
studio's desk sat 0.40 m behind the sofa — re-spaced (sofa north 0.15, desk cluster south 0.10)
to a walkable 0.75 m, dining-side corner gap intact. TODO.md layout + quick-finishes follow-ups
cleared (the curated one-tap furniture finishes had already shipped as QuickFinishes).

## [C239 / GE5] CSG boolean ops in the GLB designer
The 3D asset designer can union/subtract/intersect two shapes: select a part, pick a second in
the new **Combine (boolean)** section's "with…" dropdown, choose the op — both parts are replaced
by ONE new `mesh` part (baked triangles in `ShapePart.geometry`, a new `ShapeKind`) carrying the
first part's colour/finish, positioned at the result's bounds centre with identity rotation (so
position/rotation editing, duplicate/mirror and re-combining keep working; size is baked and
hidden for mesh parts). `furniture/glbEdit/csgCombine.ts` bakes each part's transform into its
geometry then runs `three-bvh-csg` (MIT, pinned 0.0.17 for the drei-pinned three-mesh-bvh 0.8.x)
via Brush+Evaluator — DYNAMIC-imported at the call site so it stays out of the boot bundle.
Degenerate/empty results (e.g. intersecting disjoint shapes, zero-volume slivers) throw → toast
"Couldn't combine these shapes"; stored centre/size rounded to 1µm so the editable fields read
clean. Shapes only (the source GLB is never a part); no in-dialog undo — stated in the UI copy.
Pure helpers unit-tested + real-engine wiring tests (union/subtract/intersect bounds, disjoint
rejection); visually verified headless (box−cylinder notch, union lump, intersect lens).

## [C243 / F1 tail] Edge-preserving denoise on the HQ render
The HQ render's canvas blit now runs through the lib's `DenoiseMaterial` (smart edge-preserving
blur; σ=2.5, threshold 0.1) so low-sample previews and saved stills look clean while samples
accumulate — with a safe fallback to the plain blit if construction fails. Verified headless:
the denoised preview is visibly smoother than the raw accumulation at the same sample count.
F1's remaining open point is the real-GPU convergence/quality pass.

## [C242 / PERF9] Procedural finish textures size with the quality tier
`generateProcedural` reads a configurable base size: 256² on the Performance tier (the app
default — quarter the texels per map across albedo+normal+roughness, visually identical at
room viewing distances) and 512² on Medium+. `QualityController` sets it on tier change;
material cache keys carry the size so a tier switch regenerates instead of serving stale
textures. Verified: Performance-tier boot renders the furnished flat identically.

## [C241] Walkway wall pinches on custom plans, per storey
`findNarrowGaps`' item↔wall pass no longer skips custom plans: each item is tested against ITS
OWN storey's walls (`levelAsPlan` + `planCollisionWalls`, cached per level within a call; the
default flat keeps its fixed door-aware walls on ground). Closes the last F13 level-gating
remnant. Existing tests' isolation fixture updated (wall-less plan instead of relying on the old
skip); 2 new per-level pinch tests.

## [C240 / F5] Photographic depth of field on the HQ render
The HQ render gains a DoF select (off / f/8 / f/2.8 / f/1.4): with a stop chosen, the session
renders through the path tracer's `PhysicalCamera` cloned from the live pose, auto-focused on the
first surface at screen centre (raycast into the snapshot; 3 m fallback). Verified headless: the
f/1.4 session accumulates cleanly (4 samples in the harness window, scene clearly resolving) with
no converter errors; bokeh quality assessment joins the F1 real-GPU pass.

## [C237 / F23 tail] 360° panorama slides in Presentation mode
A saved view can be marked 360° (`SavedView.pano`, optional + additive; toggle in the saved-views
list, desktop + mobile): when the slideshow reaches it, a panorama is captured from that view's
pose and shown in the shared drag-to-look sphere viewer — extracted from PanoramaModal into
`ui/panorama/PanoramaViewer.tsx` (one implementation for modal + slides; pure look math in
`viewerLook.ts`, tested). Auto-advance pauses on 360° slides (the viewer is interactive); the
header shows "· 360°". Salvaged from an interrupted agent's WIP, verified end-to-end (slide 2/2
renders the captured pano full-screen with caption + drag hint). F23 is now fully shipped.

## [C236] Per-storey drawing sheets
The 2D diagrams fan out per storey on multi-level plans: the report's plan figure + furniture
footprints, lighting diagrams (report, Drawings panel, drawing set), electrical and demolition
plans all render one captioned sheet per level via `planLevels`/`levelAsPlan`/`itemsOnLevel`
(items filtered to their storey; demolition diffs each storey against the SAME storey of the
baseline, with whole-storey added/removed callouts). Single-storey output unchanged (existing
tests untouched). Salvaged from an interrupted agent's WIP (its tests included — 190 affected
tests pass), verified in-app: maisonette Lighting tab shows both storeys' diagrams + a schedule
spanning both levels' rooms.

## [C238 / F1] HQ render — progressive path-traced photoreal still (marquee)
`three-gpu-pathtracer` (MIT, dynamic-imported chunk) drives a dedicated offscreen renderer at the
chosen resolution (HD→4K, 64–1024 samples) so the live raster pipeline is untouched: a sanitized
snapshot scene (world-baked mesh clones with standard materials only; punctual lights copied;
gradient sky instead of the unreadable PMREM probe) feeds the BVH; samples accumulate on rAF with
adaptive tiling (2×2→6×6 by resolution, keeps the tab responsive), live preview, progress, Stop,
and Save-PNG-any-time. `hqRender` flag (pro); File menu + mobile + ⌘K. Verified headless
end-to-end at a dev-only tiny resolution (BVH build → accumulation → preview shows path-traced
noise converging → stop/save); full-resolution convergence quality needs the usual real-GPU pass.
Raster fallback = the existing File→Export PNG (linked in the modal's error copy).

## [C235 / ML7] Multi-storey docs sweep — program complete
New path-scoped `src/floorplan/CLAUDE.md` (the hard rules: `plan.rooms` is ground-only — use
`allPlanRooms`/`levelOfRoom`/`levelAsPlan`; level-gate cross-item scans; room ids plan-unique
across storeys); a "Multi-storey plans" section in `docs/developer/apartment-and-floorplan.md`;
`docs/research/multi-level-design.md` marked shipped (C221–C233). F13/Q-MULTILEVEL is complete:
schema → rendering → collision → editor tabs → analyses → templates → stairs advisory → walk
teleport, all level-aware. Remaining (tracked): per-storey 2D drawing sheets.

## [C233 / ML6c] Walk-mode level teleport
On multi-storey plans the first-person walker now follows the View→Levels selection: picking a
storey while walking teleports to that level's first room centre at eye height above ITS floor
(`walkLevel`/`levelSpawnPoint` in `floorplan/levels.ts`), the walk floor height = the level's
elevation (gravity/crouch/jump land on it), collision walls resolve from that storey's own
geometry (`levelAsPlan` → `planCollisionWalls`), and `buildWalkBlockers` gains a `levelId`
param so only the walker's-storey furniture blocks (the room editor passes the edited room's
storey, fixing upper-room editor walks ignoring their own furniture). 'All levels' walks the
ground floor as before; stale level ids degrade to ground. Desktop + mobile Levels controls hint
"Walk this storey" in walk mode. 6 new tests (walk-level resolution, spawn points, blocker level
selection). Verified headless on the maisonette: walker spawns upstairs at y=4.55 (2.9 m slab +
1.65 m eye) inside Bedroom 2 vs y=1.65 in the ground living room; interior renders correctly at
both elevations. (WASD traversal itself isn't drivable headless — collision is unit-tested.)

## [C232 / ML6b] Stair-connectivity advisory for multi-storey plans
New pure `analysis/stairConnectivity.ts` (HDB-compliance-hints pattern): on multi-level plans,
`buildStairAdvisories(plan, items, getDef)` emits a caution `Advisory` for every upper storey no
staircase reaches — a staircase-family item (`staircase` def / `Staircase` primitive) standing on
the storey directly below whose rotation-aware footprint (corners + centre + edge midpoints vs
`pointInRoom`) lands in rooms of BOTH storeys. Surfaced where the other plan advisories live: the
printable report's "HDB compliance hints" section (caution count included). Advisory only — never
a hard constraint, matching Sweet Home 3D / Planner 5D. 7 new tests (reachable/unreachable, wrong
storey, missed footprint, three-storey chains, single-level silence, report surfacing). Verified
headless: maisonette report shows "No staircase reaches Upper storey".

## [C231 / ML6a] Maisonette + loft templates gain real upper storeys
A new two-storey **HDB Executive Maisonette** template (`tpl-hdb-maisonette`, ~150 m²: living/
dining + kitchen/yard/shelter/WC + stair hall below; 3 bedrooms, 2 baths, landing + family area
above at 2.6 + 0.3 m), and the existing **Terrace House** (3 bedrooms + 2 baths + family area
upstairs at 3.3 m; renamed from "Terrace House (Ground)") and **Open Loft** (sleeping mezzanine +
dressing behind a parapet guard rail) now carry real `upperLevels` instead of single-floor
approximations. Every two-storey template stacks a 'Stair Landing' room exactly over its ground
stair space so a catalog staircase connects the floors. Layouts per
`docs/research/hdb-floor-plans.md` (new Executive Maisonette section). The generalised template
tests now sweep EVERY storey (bounds, overlap, plan-unique ids, per-level opening↔wall fit) plus
a stacked-stair-space assertion. Verified headless: maisonette stacked + upper-only views,
terrace + loft stacked views.

## [C234 / F4] Render presets — one-tap photo modes
Pure `scene/renderPresets.ts` (4 curated combos of sun preset + tone-mapping look + exposure +
fixture lights: Bright day / Soft morning / Golden hour / Cozy evening) + one `applyRenderPreset`
applier shared by the Scene menu chip row and the mobile Scene sheet (`renderPresets` flag,
simple-tier, both-modes tested). Verified: chips render in the menu; bright-day vs cozy-evening
screenshots are dramatically distinct (noon neutral vs night filmic with fixtures on). A/B
compare deferred until F3 HDRI lands.

## [Bug fix] Wall z-fighting at zoomed-out orbit distances (user-reported)
The wall finish face planes sit 1 mm off the wall body; at far orbit distances the depth buffer
can't resolve that gap and the faces strobed against the plaster (horizontal banding). Both face
renderers (`WallSegment` FacePlane and the custom-plan `PlanWallFinishFace`) now bias the depth
test with `polygonOffset` (-1/-1) on their per-wall material clones — rasterizer-unit bias is
distance-invariant, so the face always wins. Verified with 3× magnified before/after crops at max
zoom-out: banding on the bath/bedroom walls fully gone, no bleed onto skirting or floors.

## [C227 / ML4b] 2D editor level tabs — per-storey editing
The Floor Plan Editor gets a storey tab strip (`LevelTabs.tsx`: **Ground floor** + each
upper level + **＋ Level** add-and-switch + confirmed **✕** remove → back to ground). Every
tool (wall/room/polygon/auto-room/split/door/window), snap, dimension labels, area totals,
furniture-footprint overlay and `PlanInspector` edit now reads the ACTIVE level
(`levelAsPlan`) and routes mutations with its `levelId`. Slice fixes: `splitWall` /
`moveWallVertex` gain optional `levelId` (`withLevelGeometry` routing); `updateRoom` /
`setRoomCeiling` and the finishes write-through (`planWithRoomFinish`) now search ALL
storeys by room id instead of ground only. Item drags in the 2D plan validate against the
item's own storey walls (`placementWalls`). 6 new tests; verified headless on both tabs
(desktop + 390 px mobile, strip scrolls).

## [C230 / ML5b] Level-correct analyses — score, daylight, lux
Design score counts every storey's rooms (`allPlanRooms`) and attributes furnishing coverage +
room lighting per level (`itemInRoomOnLevel` — a ground lamp no longer "lights" the upstairs
bedroom at the same XZ); the daylight/ventilation report fans out per storey so each level's
rooms are assessed against ITS OWN windows (`levelAsPlan` now strips `upperLevels` on the ground
branch so recursive consumers terminate); `PlanLight` carries the fixture's `levelId` and the lux
schedule matches lights to rooms on the same storey. 3 new tests.

## [C228 / ML3 tail] Level-gate walkway, wall-clip and walk-mode checks
The remaining cross-item spatial analyses are storey-scoped: `findNarrowGaps` skips item
pairs on different levels and tests only ground items against the default flat's (ground)
walls; new `collision/levelWallClips.ts findWallClipsByLevel` groups items by storey and
resolves each level's own collision walls (`levelAsPlan` + `planCollisionWalls`) — adopted
by the design score, the printable report and the Clearance panel (single-storey plans
short-circuit to the old `findWallClips`, byte-identical); walk-mode `buildWalkBlockers`
excludes upper-storey items (walker is ground-only until ML6 level teleport). 9 new tests;
all existing single-storey tests untouched and passing.

## [C229 / ML5a] Upper-storey room editor — enter, furnish, level-stamped items
`planRoomShell` resolves a room's storey (`levelOfRoom` + `levelAsPlan`) so the per-room editor,
its placement walls and the walk camera clip against the right level's geometry; the shell carries
`levelId` and `isItemInRoom` requires a storey match (an upstairs room at the same XZ no longer
shows ground furniture). `addItem` stamps `levelId` from an upper-room editor context (explicit
ids from duplicates/pastes win); `FurnitureLayer` skips the elevation offset inside the isolated
editor; PlanShell click-to-enter works on every storey. Verified end-to-end: entered the upper
bedroom, placed a bed (probe: `levelId: 'lvl-2'`), exited — overview renders it on the upper
storey over the ground sofa. 5 new tests.

## [C226 / ML4a] Plan-edit actions route per storey + add/remove level
New pure `withLevelGeometry` (levels.ts) maps a geometry update onto one storey; the eight
wall/room/opening slice actions gain an optional `levelId` (ground default = behaviour
unchanged), and new `addLevel` (empty storey auto-elevated above the highest, undoable) /
`removeLevel` (drops the storey + its items + its stale finish keys, undoable; ground is a
no-op). 6 new tests. The 2D editor's level tab strip lands next (ML4b).

## [C225 / ML3b] Level-scoped placement collision
Items on different storeys no longer collide: one level-equality gate in `itemsCollide`
(covers `canPlace`, `findItemOverlaps`, design score, reports — zero caller changes), and
`placementWalls(state, levelId?)` routes an upper-level item's wall validation to its own
storey's walls via `levelAsPlan` (ground/unknown ids keep today's behaviour). Drag, ghost,
rotate/flush/mirror/preset actions pass the item's `levelId`. 5 new collision tests.

## [C219 / LP5] Lighting plan — per-room lux estimate + recommended-level check
New pure `lighting2d/roomLux.ts`: lumen-method estimate per room (registry candela → lumens via
4π × a documented scene-calibration constant; utilisation factor 0.45; CIBSE/IES/EN-12464-sourced
recommended bands per room kind) → ok/low/high status. Schedule renders in the Drawings panel's
Lighting tab, the printable report and the drawing set; respects the per-item emitter `enabled`
gate. Salvaged from an interrupted agent's WIP, integrated (isItemEmitter resolution) and
verified in-app (plausible per-room values + status chips). 17 lighting tests pass.

## [C218 / EL5] Elevation polish — door swing symbol + dimension label de-overlap
Doors in wall elevations now carry the standard drafting symbol: leaf line on the hinge jamb +
dashed quarter swing arc (hinge side plumbed from `PlanOpening.hinge` through `projectElevation`;
knob dot moves to the latch jamb). Per-item width dimensions de-overlap via new pure
`elevation/dimensionLayout.ts` (greedy row stagger + text-width approximation, 5 tests); the
overall-width line and viewBox grow with the stagger rows. Salvaged from an interrupted agent's
WIP, completed (stagger integration + tests) and visually verified (mirrored arcs/knobs on two
doors; the middle of three narrow adjacent labels staggers to row 1).

## [C223 / ML3a] Furniture renders at its storey's elevation
`FurnitureLayer` resolves each item's level (memoised id→elevation map; zero overhead on
single-storey plans), offsets it by the level elevation, and unmounts items with a hidden level
(View → Levels). Verified: bed on the upper floor renders elevated over the ground-floor sofa.
ML3 tail (drag/placement collision scoped to the item's level) still open.

## [C222 / ML2] Multi-storey rendering — stacked levels + level-visibility control
`PlanShell` restructured into per-level `PlanLevelShell`s (floors/ceilings/walls/skirting/doors/
windows run on a `levelAsPlan` pseudo-plan, so ground + upper storeys share one code path), each
offset by its elevation with a slab under upper floors; new `visibleLevels` filter drives a
"Levels" section in the View menu + mobile View sheet (All / per storey; only shown on multi-level
plans; hidden storeys unmount so picking can't hit them). `viewLevelId` lives in cameraSlice
(session-only). Upper-room click-to-enter deliberately disabled until ML5. Verified: two-storey
plan renders stacked with reveal working; upper-only view floats the storey at 2.9 m.

## [C221 / ML1] Multi-storey foundations — types, schema, resolution layer
F13 phase 1 (design: `docs/research/multi-level-design.md`): additive `FloorPlan.upperLevels`
(`PlanUpperLevel` — own walls/openings/rooms at an elevation) + `FurnitureItem.levelId`, both
optional + schema-round-tripped (no version bump); new pure `floorplan/levels.ts`
(`planLevels`/`levelById`/`levelElevation`/`levelOfItem`/`levelOfRoom`/`allPlanRooms`); the two
room-id collectors (`applySerialized` finish filter, `pruneFinishesForPlan`) now see upper-level
rooms. 10 new tests. Rendering/editing land in ML2–ML7.

## [C217 / F2] 360° panorama — equirect capture + drag-to-look viewer + PNG export
Six 90° renders through the normal screen pipeline (tone mapping/colour match the live view; the
camera-facing wall-reveal is settled opaque first via a `wallReveal` override + `registerAnimatedSource`
pump hold; composer render-state reset around the manual renders) cropped to exact 90°×90° squares and
CPU-assembled by pure `scene/panorama/equirect.ts` (unit-tested face math + bilinear assembler). Eye =
walk camera, or the orbit pivot at standing height. `PanoramaModal` (lazy, `panorama` flag, pro-tier)
shows a self-contained three sphere viewer (drag look, wheel zoom, context-loss tolerant) + PNG download;
entries in File menu, mobile File sheet, ⌘K. Also: custom-plan `FadeWall` now honours the `wallReveal`
override like the default flat. Verified headless: capture correctness via pixel probes at six directions
+ modal/viewer screenshots; the *interactive* viewer rotation provably updates the camera but SwiftShader
won't present a second WebGL context's redraws — real-GPU pass deferred (consistent with PR3c precedent).

## [C214 / F25] Text-to-room brief — "describe it" box in Smart Start
New pure `furniture/briefParser.ts`: deterministic keyword scoring (curated synonym table over all 15
layout presets + name/description fallback, whole-word matching) maps a free-text brief to the closest
preset, plus budget extraction ("$15k" / "S$ 12,500" / "budget of 18k" → `setBudgetTarget`). Wizard gains
a flag-gated (`textBrief`, simple-tier) textarea + "Match my brief" with an honest matched-terms/budget
line (and an explicit "couldn't match" state). 9 new tests incl. both-mode flag resolution. Verified
end-to-end in the wizard (typed brief → Japandi matched + selected).

## [C213 / FP-next] Custom-plan rooms: live 3D finish editing (floor + wall)
The 3D finish picker silently didn't render on custom plans (the shells read only `PlanRoom.floor`; walls
were fixed plaster). Now: new `floorplan/roomFinishes.ts` resolvers (live `finishes` slice → plan room →
default) drive `PlanShell` + `PlanRoomShell`; `setFloorFinish`/`setWallFinish`/`setAll*` write through to
the active plan's room (`floor` + new optional `wall`, schema round-tripped); new `clearWallFinish`;
`PlanRoomShell` walls render the room's wall finish via `PlanWallFinishFace` (world-UV, any catalog
material incl. textured + #hex); 2D `PlanInspector` gains a Wall-finish select and routes floor picks
through the slice; plan activation prunes stale custom-room finish keys. Harness: `SHOT_URL` +
`SHOT_NAV_TIMEOUT` env overrides in `scripts/shot.mjs` (parallel worktree dev servers / busy-CPU loads).
Verified: room editor renders grey-tile floor + red-brick walls on `tpl-studio` (screenshot), 10 new tests.

## [THEME-COLORS] Theme-token pass — replace hardcoded hex colours
Hardcoded hexes that bypassed the CSS token vocabulary (mis-rendering in dark mode / the 5 themes) now use
`var(--…)` tokens: `FloorPlanEditor` measurement annotations (new `--plan-annot`, light + dark) and the
`CATEGORY_FILL` furniture fills (new `--plan-cat-*` tokens in `screens.css`; `exportPlanPng` PLAN_VARS kept
in sync); `CompassModal` dial SVG (surface/border/text/danger tokens + new theme-independent `--sun`/
`--sun-edge`); upload `ConfirmDialog` rebuilt on `.modal-overlay`/`.btn`/`.btn-accent`/`.btn-danger` + a
surface-token gradient; `IkeaBody` swatch fallback (`--surface-3`) + active-variant ring (`--accent`, was
Tailwind blue). Left as a literal by design: `PlanInspector` cove `#ffe6c0` — a persisted scene-data default
(`coveColor`, consumed by the 3D cove light + `<input type="color">`), not UI chrome. Visually verified:
plan editor + compass modal screenshotted in clay light, clay dark, and porcelain dark.

## [P-CHUNK] Code-split heavy paths + manual vendor chunks
Boot JS payload cut ~24% (3,027 → 2,290 KB minified; 837 → 632 KB gzip) with no behaviour change:
- **Dynamic imports at call sites** for heavy, rarely-used graphs: the rare-format three loaders
  (FBX/Collada/USDZ/3MF/OBJ/STL/PLY in `loadToObject`, ~198 KB) + `GLTFExporter` (`toGlb`), the
  @gltf-transform optimize pass (`runOptimize` fallback, ~255 KB; now best-effort — a failed chunk load
  keeps the original GLB), TGA/EXR/HDR/TIFF texture decoders (`decodeImage`), the pack `ThumbnailRenderer`
  (`hydratePacks`), and the report/moodboard/BOQ/DXF/drawing-set builders. The popup-based exports open
  their window synchronously inside the click (pop-up blockers still allow it) and build the document
  after the chunk loads, closing the window + toasting if the chunk fails.
- **Lazy components**: `PacksTab` and both upload dialogs (model + material) in the catalog drawer /
  finish picker — both dialogs reset state on close, so mount-gating is behaviour-identical.
- **Manual chunks** (`vite.config.ts`): react/react-dom/scheduler split into their own `react` chunk;
  `three/examples/jsm`, `utif`, `@gltf-transform`/`draco3dgltf` excluded from the eager `three`/`vendor`
  chunks so they follow their async importers. three 1,166→849 KB, vendor 870→387 (+190 react), index
  990→863 KB. Verified: full test suite, prod-build boot screenshot, and the lazified report path
  end-to-end in the harness.

## [MOBILE-TAP-TARGETS] Mobile toolbar controls meet the 44px touch-target minimum
In-browser audit of every interactive control in the mobile bar + hamburger sheet (360×780 and 430×932,
touch-emulated): the accordion rows (`.m-item`, incl. `.m-item-s` sub-label rows), section headers,
saved-view delete and slot-load were already ≥44px. Seven controls were under and are now ≥44px effective:
hamburger (38→44), room-editor exit X (34→44), room select (36→44), sheet close X (26×26 visual kept,
hit area padded to 44×44 via an invisible `::after`), saved-layout delete (36→44), Scene backdrop select
(34→44), and the time-of-day slider (4px-tall input → 44px hit area, thin 4px track preserved on the
track pseudo-elements). Verified with `getBoundingClientRect` + `elementFromPoint` probes and screenshots
at both widths.

## [POPOVER-SCROLL] Toolbar popovers vs. toolbar scroll
Verified the reported "popover detaches when the toolbar scrolls" on a narrow desktop (660 px, room-editor
toolbar): the shared `Popover` already closes on any capture-phase ancestor scroll, so no detach occurs. The
actual defect was the inverse — that same global listener also fired for scrolls *inside* a menu's own
overflow list (File → saved layouts, Arrange), instantly closing the menu you were scrolling. `Popover` now
ignores scroll events originating within its panel (they don't move the anchor) while still closing on
toolbar/page/ancestor scrolls. Unit tests cover both directions; mobile is unaffected (the mobile sheet
doesn't use `Popover`).

## [MODAL-HOTKEYS] Suppress global hotkeys while a modal is open
Typing into a mis-focused modal could trigger scene shortcuts behind it (e.g. `P` toggled the 2D plan
behind the Smart Start modal). New `controls/modalGuard.ts`: a module-level open-modal counter — the
shared `Modal` primitive registers automatically (`useModalGuard(open)`), as do the modal-style overlays
that don't build on it (GraphicsSettings, CompassModal, Onboarding, UploadModelDialog + its
ConfirmDialog). Every global keydown handler now early-returns via `isAnyModalOpen()`: `useKeyboard`
(main key map incl. Ctrl/Cmd+Z undo — suppressed behind a dialog like most apps; inputs keep native
undo), the direct App.tsx handler (⌘K/?/B/⌘A/`[`/`]`/`,`/`.`/`/` — ⌘K suppressed so the palette can't
stack on a dialog; `?` still closes the Help modal it opened), arrow-key nudge, the FloorPlanEditor `P`
toggle + its Enter/Esc/Delete keys, walk-mode WASD, and armed-placement R/Esc. Escape-to-close keeps
working (each modal owns its own listener); the ⌘K palette is not a `Modal` and keeps its internal
keyboard handling. Unit tests: counter semantics, hotkey no-op while open / resumes after close,
input/textarea/contenteditable guard, Modal registers+releases on open/close/unmount. Harness:
`scripts/shot.mjs` gains `SHOT_URL` + survives `networkidle2` timeouts (offline sandbox); verified
end-to-end — P/V suppressed behind Smart Start over the 2D editor, P exits the editor again once
closed, Escape still closes the wizard.

## [C215] Shoppable design export (F20)
A polished, self-contained buy-list HTML export: every placed piece with name, room, quantity
(identical defId+variant grouped per room), unit + line price, **grouped per retailer** (IKEA defs
carry retailer info/SKUs; everything else under "Unpriced / generic" with the Budget panel's
estimates via the shared `itemPrice`), per-retailer subtotals + grand total, and the design/budget
context (name, note, budget target under/over). Pure tested builder `ui/shoplist.ts`
(`buildShopList` + `buildShopListHtml`, 5-char escaping, http(s)-only hrefs);
`ui/openShoplist.ts` opens the window synchronously then dynamic-imports the builder
(popup-blocker-safe, out of the main chunk). New `shopExport` flag (simple tier, prod on) gating
the desktop **File → Shopping list**, the mobile File section, and a ⌘K command; IKEA product
links are dev-gated behind the dev-only `ikeaLive` flag per the licensing rule. 25 tests incl.
both-modes flag resolution.

## [C216] Vanity configurator — parametric dressing table with layout variants
The dressing table gains a wardrobe-style (C205) configurator. New `layout` param reshapes the base —
`Open legs` (four-leg + apron drawer band), `Single pedestal` (3-drawer pedestal left, legs right) and
`Double pedestal (kneehole)` (mirrored pedestals + slim centre drawer over a ≥0.35 m knee space) — and the
`mirror` enum gains `None (table only)`; width range widens to 0.8–1.5 m. Pure layout maths live in
`primitives/vanityLayout.ts` (slatLayout pattern: supports reach floor→underside, every part inside the
footprint, drawer fronts backed flush — 8 tests). The Hollywood-bulb option now emits real light at night:
`LIGHT_EMITTERS` gains a per-item `enabled` gate (`isItemEmitter`) honoured by `FurnitureLights`, the 2D
lighting plan and the design score, so a vanity only counts/glows with `lights=yes` on the rect mirror.
Harness: `shot.mjs` honours `SHOT_URL` + 120 s nav timeout (playbook updated). Visually verified all three
layouts, mirror none, and night bulbs on/off.

## [P-OPENS-PLAN] `P` toggles the 2D plan editor open from the 3D view
`FloorPlanEditor` is lazy-mounted only while `floorPlanEditing` is true (PERF5/C181), so its own
"`P` toggles the editor" keydown listener only existed once the editor was already open — `P` could
CLOSE the 2D plan but never OPEN it from the 3D view. The toggle now lives in an always-mounted
binding: new `controls/planEditorHotkey.ts` (`togglePlanEditor: 'KeyP'` in `keybindings.ts`,
`usePlanEditorHotkey()` mounted from App via the shared `useKeyboard` hook, so the repeat /
editable-target / open-modal guards all apply; walk mode + modifier combos + a disabled
`floorPlanEditor` flag are ignored). Closing via `P` keeps the frame-the-selected-item behaviour
(shared `exitPlanEditorToScene`, also used by the editor's Escape/Done). The editor keeps only its
editor-scoped keys (Enter/Esc/Delete). `controls/modalGuard.ts` (open-modal counter; `Modal`
registers via `useModalGuard`) suppresses the binding behind dialogs. Shortcut surfaces updated:
Edit-menu chip "(P)" from `shortcutLabel('togglePlanEditor')`, Help modal row "2D plan editor · P"
(user docs already listed `P`). Unit tests: opens from the closed 3D state with only the hook
mounted; closes + refocuses; suppressed while a modal is open and resumes after; editable-target /
walk / modifier guards; works in BOTH Simple and Pro mode and no-ops when the flag is off.
Visually verified: `P` from the 3D overview opens the 2D editor, `P` again returns to 3D, and `P`
behind the open Help modal does nothing.

## [C224] Shareable interactive 3D design link (X-PRESENT)
"Copy 3D link" in the Share modal: a chat-friendly, backend-less `#/design/<code>` URL
(`features/designShare.ts`) — same deflate+base64url codec as plan links, but the payload strips
session noise (device location, camera mode) and non-portable user/IKEA defs (their blobs are
IndexedDB-only; items referencing them are dropped with a count + toast on open), hard-capped at a
16 KB code with a clear "use the .sofa.json export" error past it. Decode reuses `migrate` + the zod
schema and the bounded-inflate zip-bomb guard with a tighter 4 MB cap (`planShare` gained
`ShareTooLargeError` + per-route `DecodeLimits`). Boot handles the route after the seed
(`loadSharedDesignFromUrl`) and toasts "Shared design loaded — it's yours to edit". A fully
furnished default flat (66 items) encodes to a ~4.2 KB code (16 KB JSON). Also fixed: `Modal`'s
inline `width` overrode the responsive CSS clamp, overflowing 390-px phones — now clamped to
`calc(100vw - 24px)`. 13 new tests (round-trip, noise-stripping, budget, bomb, unknown-defId drop,
route/boot).

## [Bug-fix batch] Reported bugs + agent-found defects
Five user-reported bugs + high-value findings from a parallel bug/perf/UI agent sweep:
- **Mobile onboarding**: the desktop spotlight tour (targets desktop toolbar controls; its overlay sits above
  the mobile hamburger sheet) auto-started on mobile and blocked the hamburger. Mobile now shows the centred
  onboarding carousel instead; `ProductTour` self-disables on a mobile viewport. Verified on a 390-px phone.
- **Backdrop occlusion**: the city near-ring (radius 34 m, wide blocks → inner edge ~9 m) could sit between
  the dollhouse camera (~23 m out) and the flat. Added a no-build clearance (`BUILD_CLEAR = 30 m`) so the city
  rings an open plaza and never occludes the apartment from any orbit angle. (Not a renderOrder issue — opaque
  depth testing already sorts correctly.)
- **Orbit floor clamp**: panning (shift-wheel / right-drag with screen-space panning) could drag the orbit
  target below Y=0 and dip the camera under the floor; the pivot is now clamped to the floor each frame.
- **Floor-plan editor** moved to the Simple tier (was hidden in Simple mode).
- **Walk-mode furniture collision**: new pure `collision/furnitureBlock.ts` (`buildWalkBlockers` +
  `resolveCircleVsObbs`, 8 tests) blocks the first-person walker against furniture footprints (skips
  mounted / no-clip / shin-height-or-lower items so you can step over a rug); resolved walls→furniture→walls
  so a piece can't shove you through a wall.
- **Found**: memoised FurnitureLayer's hidden-set (per-drag realloc); dispose PlacementGhost's tint material on
  unmount (GPU leak); clear item selection on entering a room editor (no stale cross-room Inspector); toasts
  render above modals (`--z-toast`).

## [C212] Marble tonal clouding (PR6 follow-on)
Added a broad low-freq tonal cloud to the marble albedo so a slab isn't a uniform white field between veins.
Subtle + tint-preserving (a clamped ±0.05 luminance drift). Behind `pbrSurfaces`. Visual verification was
inconclusive in the harness (couldn't isolate a white-marble surface — the coffee-table top uses its own
colour prop), but the change is a near-zero-risk tweak to the already-verified marble generator.

## [C211] Velvet pile maps (PR6 follow-on)
Velvet was borrowing the woven-fabric normal (now slubby after C209), which is wrong for smooth pile. Gave
velvet its own dense fine-nap normal + a faint low-freq pile-clumping albedo so the sheen reads uneven like
real velvet. Behind `pbrSurfaces`; verified on a green velvet sofa.

## [C210] Leather albedo (PR6 follow-on)
Leather upholstery had a pebble normal but a flat tint; added a near-white greyscale albedo (so the colour
still tints it) carrying broad hide mottle + faint crease/burnish lines, so leather reads as real hide.
Behind `pbrSurfaces`. Verified on a brown leather sofa close-up.

## [C209] PR6 — realistic furniture surfaces
Overhauls the procedural furniture textures that read flat/fake, behind the new `pbrSurfaces` flag (Simple
tier, default on — surface quality applies in both modes):
- **Wood** now lays out as discrete **planks** — each board gets its own value tone, a de-aligned grain phase,
  and a darker seam groove — so a tiled top reads as real boards instead of one uniform sheet.
- **Fabric** weave is no longer a perfect sin-grid: thread phases are warped by low-freq noise with occasional
  **slubs** + surface fuzz, so cloth (and velvet, which shares the weave) looks woven, not synthetic.
- **Painted/laminate** matte panels gain a faint shared **orange-peel + roller micro-normal** so the most
  common cabinet/bed/wardrobe finish stops reading as dead-flat plastic.
Maps stay 256² shared singletons + per-(kind,tint) cached — no extra GPU cost per piece — and are kept on
**all tiers** (incl. the default Performance tier, where most users are) since removing them would make the
default *flatter*, not better (a deliberate deviation from the plan's "Performance = no maps" step).
Verified close-up in daylight (software-GL shows the normal-driven grain/weave + albedo variation). The
remaining plan tail — defaulting common finishes to the local CC0 `mat:<id>` textures (needs
`FurnitureMaterialLoader` plumbing + per-furniture UV scaling) and an optional Performance env hint — stays
in `TASKS.md` PR6 for a real-GPU pass (reflections/clearcoat can't be judged under software-GL).

## [C208] Simple / Pro feature tiering
Every `FEATURE_FLAGS` entry now declares `tier: 'simple' | 'pro'`, and `resolveFlags` forces **pro-tier
features off in Simple mode** (the app default) — so the existing `useFeature`/`isFeatureEnabled`/`COMMAND_FLAGS`
gates hide them automatically with no new gating code. Simple mode keeps the minimal core loop (furnish via
Smart Start, finishes incl. Designer picks, backdrops/lighting/walkthrough/saved-views, budget, share/export);
everything analytical/professional/advanced (measure, checks, drawings, scores, daylight, accessibility, AI,
versions/history, floor-plan editor, packs, model upload, moodboard, palette, DXF/BOQ/electrical, mount-heights,
copy-appearance, user-sets, ceiling design, presentation, …) is Pro. `setUiMode` + `loadEditorPrefs` re-resolve
the flag map on mode change; the Simple↔Pro toggle is itself ungated. CLAUDE.md gained the tiering rule + a
"test both modes" rule; `featureFlags`/`featureFlagsSlice` tests cover Simple **and** Pro. Verified: Simple
hides the Tools menu + advanced actions, Pro restores them.

## [C207] Ceiling treatments in the report
The design report's room schedule gains a "Ceiling style" column (Flat / Tray / Coffered 3×2 / Dropped, with
a "+ cove" suffix) whenever the `ceilingDesign` feature is on and any room carries a non-flat ceiling — so the
printable spec reflects the F12 ceiling design. Pure `ceilingStyleLabel` helper (+ tests).

## [C206] Client presentation mode (F23)
A full-screen "Present" mode that turns the saved camera views into a client slideshow: each slide applies the
view's angle + lighting and captions it with the view name and an optional presenter note (editable per view
from the saved-views menu). Arrow keys / on-screen prev-next navigate, Esc exits, and an Auto toggle advances
every 6 s; the overlay is pointer-through except its control bar so the camera can still be nudged mid-slide.
Added `note` to `SavedView` (+ `setViewNote`) and a `presenting` UI flag. Behind the `presentation` flag.

## [C205] Configurable wardrobe interior (F10)
The open-style wardrobe gained an `interior` param — **Rail + shelves** (default), **All hanging**, **All
shelves**, or **Drawers + hanging** — reshaping the carcass fit-out (rails with garments, shelf stacks, and a
pulled drawer bank) so storage reads realistically in a layout. Verified up-close on the drawers layout.

## [C203–C204] Per-room ceiling design (F12 / Q-CEILING)
- **C203** (core): `CeilingConfig`/`CeilingStyle` types on `PlanRoom`; pure `apartment/ceiling/ceilingModel.ts`
  `buildCeiling` (tray = lower perimeter frame + raised centre; coffered = base + beam grid; dropped = base +
  lowered soffit box; all hole-free, rect-room only with a flat fallback for L-shapes/too-small rooms, drop
  clamped to a 2.0 m clearance; 9 tests); `schema.ts` round-trip (additive, no version bump); coalesced
  `setRoomCeiling` store action; `ceilingDesign` flag.
- **C204** (render + UI): `RoomCeiling.tsx` maps parts → meshes (BackSide planes, tier-gated risers + an
  emissive cove glow on High+); both `Ceiling.tsx` (default flat) and `PlanRoomCeiling.tsx` delegate to it.
  Per-room ceiling picker (style + depth/border/grid + cove) in `PlanInspector`. Verified: the coffered grid
  reads correctly from an interior up-view in daylight.

## [C202] Curated "Designer picks" finishes (C-MAT)
A one-tap "Designer picks" swatch row above the floor + wall grids in the finish picker — the handful of
finishes designers reach for most (oak/walnut/parquet/marble for floors; warm-white/greige/sage/navy/fluted-
oak/microcement for walls). Pure `materials/designerPicks.ts` resolves curated ids against the live catalog
(missing ids silently skipped, 3 tests). Behind the `designerPicks` flag.

## [C201] Flag-gating consistency for the devOnly sidecar features
Closed the last two gaps in feature-flag coverage: the Budget panel's "Live IKEA SG prices" toggle and the
PacksTab IKEA live-scrape card now gate through `useFeature('livePrices')` / `useFeature('ikeaLive')` instead
of a raw `import.meta.env.DEV` / `visiblePacks` check — so the flag registry is the single source of truth
(both stay devOnly/off in prod, but an admin/QA session can toggle them). Every flag now routes through the
flag system.

## [C200] Save selection as a custom set (F14)
Users can capture the current selection as a reusable, named furniture set — the new `userSetsSlice` stores
each piece as a centroid-relative offset (+ rotation + props) in localStorage, and `dropUserSet` drops it at
the largest room's centre as a selected group (the same path built-in sets use). A "My sets" section in the
Arrange menu (desktop) and the mobile Arrange sheet lets you save, drop and delete. Pure `captureSetItems`
+ slice tests. Behind the `userSets` flag.

## [C199] Vision-AI endpoint safety (S2)
The BYO-key floor-plan vision call now classifies its (user-configurable) endpoint before sending:
`classifyVisionEndpoint` refuses to POST the bearer key over plaintext HTTP to a remote host (it would leak
on the wire — localhost proxies over http are still allowed), and flags any HTTPS host that isn't a
recognised provider. The editor surfaces the warning and requires the user to type the host name to confirm
before the key leaves for an unfamiliar origin. Pure + 5 tests.

## [C198] Copy/paste appearance + recolour-by-category (F17 / Q-COPYSTYLE)
Look-only style transfer between pieces: "Copy appearance" captures an item's finish/colour/material/variant
(not its size or position), then "Paste appearance" applies it to the selection — keeping only the dims each
target understands, so a walnut finish jumps cleanly between differently-sized pieces. "Recolour category (N)"
applies one item's look to every other item in its category. Pure `furniture/appearanceProps.ts`
(`appearanceKeys`/`extractAppearance`/`mergeAppearance`, 5 tests) + an ephemeral `styleClipboardSlice`
(`copyAppearance`/`pasteAppearanceTo`/`applyAppearanceToCategory`, 4 tests, history-pushed, skips locked).
Inspector buttons on both the single-item and multi-select panels. Behind the `copyAppearance` flag.

## [C197] Standard mount-height presets (F18)
A "Standard heights" chip row under a mounted item's `mountHeight` slider in the inspector — designer
conventions (gallery picture-centre 1.45 m, TV seated-eye 1.1 m, pendant-over-table 1.5 m, sconce 1.65 m,
…) so wall/ceiling items snap to a sensible height in one tap. Pure data in `furniture/mountHeightPresets.ts`
(matched by def id, generic fallback, clamped to the slider range; 7 tests); presentational
`MountHeightPresets` chips. Behind the `mountHeights` flag. Verified in the room editor on wall art.

## [C196] Tier-gate the Canvas DPR ceiling (PERF6, partial)
The main Canvas now takes its device-pixel-ratio ceiling from the active quality tier's `dprMax`
(Performance = 1, was a hardcoded 1.75) — a real fill-rate saving on the default tier / weak GPUs, applied
live on a tier switch. `antialias` + `preserveDrawingBuffer` are WebGL context-creation attributes and can't
be toggled without recreating the context, so they're left as-is (deferred, needs real-GPU verification).

## [C195] Catalog hook memoisation + in-canvas getter (PERF1)
`useCatalog` is now memoised on its three input slices, so the non-trivial merged-catalog build runs only
when a slice actually changes — not on every consumer re-render (a FurnitureLayer re-render on every drag
pointermove was rebuilding the whole catalog). The in-canvas overlays (SelectionOutline, HoverHighlight,
RotateGizmo, ClearanceOverlay, PlacementGhost) now read through the non-reactive `useCatalogGetter` ref so
catalog churn during a bulk import never re-renders the R3F tree. Verified: furniture, clearance rings, and
selection outline all render correctly.

## [C192–C194] Hot-path perf
- **C192** (PERF8): `DragController.onMove` indexes the item list into id→item Maps once per pointermove,
  replacing several full-list `.find` scans (including an O(n·m) per-moved-item collision loop) with O(1) lookups.
- **C193** (PERF3): `Lighting` memoizes its tween target so `targetVals` (an object + 4 arrays) no longer
  allocates every frame once the day/night tween has settled — only the tone-mapping/exposure write stays per-frame.
- **C194** (PERF4): `FurnitureLights` gates its per-frame nearest-emitter rebuild+sort on a real input change
  (camera moved >0.2 m or items changed) — a stationary night scene no longer re-scans every frame.

## [C190–C191] Suggestions + electrical plan
- **C190** (F16): "magic" contextual suggestions in the Design Score panel — per-room "what to add" hints
  from `analysis/suggestions.ts` (pure, category-gap heuristics by room type + area), gated by the new
  `suggestions` flag; skipped while dragging (mirrors the score recompute gating).
- **C191** (F29): electrical / power & data plan in the formal drawing set — pure `floorplan/electricalPlan.ts`
  + `electricalPlanSvg.ts` (socket / switch / aircon / TV / data / water-heater symbols + schedule), with
  `deriveElectricalPoints` inferring points from appliances/electronics/aircon/TV/wet-area items + a switch
  inside each door. Gated by the new `electricalPlan` flag.

## [C187–C189] Reliability polish + feature-flag coverage
- **C187** (B7): undo/redo/jump prunes dangling selection ids no longer in the restored items.
- **C188** (B8): analysis-panel width moved to an `.aux-360` class (off the inline JSX style).
- **C189** (feature flags): new CLAUDE.md rule — every feature must have a `FEATURE_FLAGS` entry + be
  gated. Added flags for the previously-ungated tools (drawings/daylight/designScore/accessibility) and
  split moodboard/dxfExport/boq off the broad `report` flag; gated their Tools + mobile + ⌘K entries.

## [C185–C186] Memory bound + complete pro drawing set
- **C185** (PERF9): procedural thumbnail cache is now a 300-entry LRU (was unbounded over a long catalog browse).
- **C186** (F32): cross-section drawing (`floorplan/section.ts` + `sectionSvg.ts`); the formal drawing set
  now adds Dimensioned plan + Section A–A + Demolition sheets (cover · plan · dimensions · elevations ·
  lighting · section · demolition · FF&E). 18 tests.

## [C184] Demolition / hacking + new-wall plan (F30)
Pure `floorplan/demolitionPlan.ts` `diffWalls` (order-independent wall match → kept/demolished/added +
hacked/added metres) + `demolitionPlanSvg.ts` (kept solid / demolished dashed-red / added bold-green +
legend). A session `baselinePlan` captures the plan as-loaded (template/saved/reset/new, not on edits);
the report's "Hacking & new walls" section diffs current vs baseline when walls changed. 11 tests.

## [C182–C183] Perf + security polish
- **C182** (PERF10): RenderPump reuses one PumpInputs object across rAF frames (zero per-frame garbage).
- **C183** (S3): report finish swatches validated against a hex/rgb pattern before entering `style=`.

## [C181] Lazy-load rarely-opened panels — trim the boot bundle (PERF5)
ShareModal / VersionsPanel / ElevationPanel / HistoryPanel / ProductTour / SmartStartWizard are now
`React.lazy` + gated on their open flag in App → their code loads only on open. Main entry chunk
**932 KB → 719 KB** (gzip 250 → 202 KB, ~23% smaller). Panels render identically when opened.

## [C177–C180] Commercial-readiness program — mobile parity + perf + commerce
- **C177** (B3): mobile Tools sheet gains Drawings / Daylight / Design score / Accessibility (desktop
  parity, shared closeAux).
- **C178** (PERF2): Design Score skips its O(n²) recompute mid-drag (gated on draggingItemId).
- **C179** (PERF7): new `collision/broadphase.ts` spatial grid; `findItemOverlaps` + `findNarrowGaps` run
  their exact tests only on near candidate pairs — O(n) for sparse designs, identical results. 21 tests.
- **C180** (F33): quote-ready **BOQ** export (`export/boq.ts` + `ui/openBoq.ts`) — FF&E + flooring/wall
  finishes + carpentry (linear-metre/feet), printable; the SG design→quote handoff. 11 tests.

## [C172–C176] Commercial-readiness program — reliability hardening + commerce/AI features
- **C172** (B4): `buildDaylightReport` / `buildAccessibilityReport` / `planCollisionWalls` now guard
  `Array.isArray` on plan walls/openings/rooms internally — every caller is safe on a partial plan.
- **C173** (B5): the report's `buildDesignScore` reuses the door-aware collision walls (was recomputing
  with doors closed → could disagree with the in-app panel).
- **C174** (B6): new pure `rectUnionOutline(rects)` — `roomPolygon` L-shapes are now correct for an
  extension on ANY side (grid overlay → boundary stitch), not just the south edge. Tests for north-L + overlap.
- **C175** (F19): **Moodboard / style-board** export (`ui/moodboard.ts` + `openMoodboard.ts`) — palette +
  finishes + furniture tiles + hero, escaped + colour-validated; Tools-menu action.
- **C176** (F28): **Palette-from-photo** (`analysis/imagePalette.ts` median-cut + `ui/paletteFromPhoto.ts`)
  — pick a photo → extract dominant colours → nearest catalog finishes → moodboard; ⌘K command.

## [C164–C171] Commercial-readiness program — audit fixes + parallel feature modules
Driven by the 4-front audit (see TASKS.md). Each its own commit:
- **C164** (B1, HIGH data-loss): `PlanRoomZ` now serializes `polygon` — free-form/Auto-room rooms no
  longer revert to their bounding rect on reload. Round-trip test.
- **C165** (S1, security): the three SVG builders (`elevationSvg`/`reportPlanSvg`/`lightingPlanSvg`) now
  use the full 5-char escape (incl. quotes) — attribute-safe under `dangerouslySetInnerHTML`.
- **C166** (B2): one shared `ui/auxPanels.ts` `closeAllAuxPanels` used by Tools menu + Mobile toolbar +
  ⌘K — fixes stacked/overlapping `.aux` panels (daylight/elevations/design-score/accessibility).
- **C167** (F34): HDB renovation **compliance hints** — pure `analysis/hdbCompliance.ts` (permit/caution/
  info advisories: structural hacking, wet-area waterproofing, floor loading, facade windows, ceiling,
  permits) + a report section. SG-market trust feature. 12 tests.
- **C168** (F35): **renovation timeline** — pure `analysis/renoTimeline.ts` (phase schedule scaled by
  area+rooms, 6-day week, 3–24 wk clamp) + a report Gantt section. 9 tests.
- **C169** (F15): **auto-dimensioned plan** — pure `floorplan/autoDimension.ts` + `autoDimensionSvg.ts`
  (overall + per-room running dimensions → palette-injected SVG) + a report drawing. 15 tests.
- **C170** (F31): **DXF export** — pure `export/dxf.ts` `planToDxf` (ASCII DXF R12, layered walls/rooms/
  openings/labels, +Z→-Y) + `ui/openDxf.ts` download + a Tools-menu action. 15 tests.
- **C171** (F8): **staircase primitive** (straight/L/U/spiral) — pure `staircaseModel.ts` `buildStaircase`
  (structurally sound, 19 tests) + `Staircase.tsx` + catalog registration + price.
The pure modules (C167–C171) were authored by parallel worktree subagents and integrated file-by-file
(no merge). Deferred: a `WindowBlind` (roller/roman/venetian) primitive was authored but overlaps the
existing `Curtain`+`RollerBlind` — better to add a `roman` style to `RollerBlind` than ship a duplicate.

## [C163] Studio backdrop → seamless infinity-cove cyclorama
Replaced the Studio backdrop's bare ground disc with a product-shot cyclorama: a large unlit gradient
dome (brighter at the zenith, gently deeper at the horizon; `MeshBasicMaterial` + fog-off so it reads
evenly-lit on every tier) wraps the scene with no hard skyline, over a matching neutral floor. Extracted
to `StudioBackdrop.tsx` (consistent with Park/Hills). Cheap (one mesh + a tiny gradient texture),
disposed on unmount. Verified via the screenshot harness.

## [C162] Renovation cost estimate (finishes) in the report
New pure `src/analysis/renovationCost.ts` `estimateRenovation(floorAreas, wallAreas)` — the finishes
counterpart to the furniture budget: indicative SG supply+install rates ($/m²) per finish category
(floor tile/stone/wood/vinyl; wall paint/tile/wallpaper, classified by id keyword) over the per-finish
areas the report already computes → flooring + wall line items + a subtotal (biggest spend first). Rates
live in one auditable `RENO_RATES` table. Surfaced as a **Renovation estimate** report section (area ·
rate · est. cost, finishes subtotal, and a combined Furniture + finishes total), clearly labelled
indicative (excludes hacking / M&E / margin). 5 module tests + 2 report assertions.

## [C161] Two more templates — Condo Studio (shoebox) + Condo 4-Bedroom
Library now 18 plans, filling the smallest + largest condo gaps: **Condo Studio** (~37 m²: open
living/sleeping + kitchenette + bath + balcony) and **Condo 4-Bedroom** (~140 m²: 4 beds + master
ensuite, common/shared baths, open living/dining, kitchen + yard, wide balcony). Hand-authored to pass
the strict templates test (no overlaps, in-bounds, openings fit their walls) and furnish cleanly via
Smart Start — the 4-bed verified end-to-end (render + 53-item furnish) via the screenshot harness.

## [C160] In-app Accessibility panel (Tools + ⌘K)
Surfaced the C159 check live: a new `AccessibilityPanel` (`.aux` slot) renders the Doorways +
Turning-space summary and per-door/per-room pass/fail rows with fix hints, mirroring the Daylight panel.
Wired into `featuresSlice` (`accessibilityOpen`), the Tools menu (+ `closeAux`), the Command Palette, and
App. Verified via the screenshot harness.

## [C159] Accessibility / universal-design check + report section
New pure `src/analysis/accessibility.ts` `buildAccessibilityReport(plan)` — a plan-level BCA-Code-on-
Accessibility rule-of-thumb QC: each door's clear opening width vs 0.85 m, and whether each habitable
room fits a 1.5 m wheelchair turning circle (smaller plan span ≥ 1.5 m); external rooms skipped, robust
to an empty plan. Surfaced as an **Accessibility** section in the printable report (pass counts + the
failing doorways/rooms to widen, or an all-clear). Plan-only, so it reads even for an unfurnished shell.
4 module tests + a report assertion.

## [C158] Richer auto-furnish kits — study, standalone dining, powder room, balcony
`furnishPlan` now covers more room types so Smart Start furnishes the templates' full variety:
**Study/home-office** (desk + office chair + bookshelf), **standalone Dining** (dining set only — no
stray sofa/TV), **Powder Room/WC** (half-bath: toilet + sink + mirror, no shower), and **Balcony/patio**
(outdoor table + chairs + planter). `kitForRoom` checks these specials before the generic name-kind
classifier. Tests cover each kit + a utility room staying empty; verified via the screenshot harness.

## [C157] Smart Start applies the preset floor/wall palette to custom plans too
Completes C153: on a custom plan/template, `applyLayoutPreset` now also restyles the shell — dry living
spaces (living/bedroom rooms, by inferred kind) take the preset's dry floor, the plan's wall colour
follows the preset wall swatch, and wet/utility rooms keep their hard-wearing floors. Furniture + plan
finishes apply in one `set` (the history snapshot includes `floorPlan` → a single undo step). Test
covers custom-plan furnish + palette + one-undo revert.

## [C156] Richer, instanced Park & Hills backdrops (photorealism + perf)
Reworked the non-city backdrops (built by a parallel worktree subagent, integrated here). Extracted the
shared `Ground` + a reusable `InstancedBatch` (Matrix4-composed instances) into their own files.
**Park** now scatters varied broadleaf + conifer trees and shrubs across two depth rings on a tinted
common (~128 meshes → ~12 draw calls); **Hills** layers three depth bands with aerial-perspective colour
(farther = lighter toward the sky) + distant tree clusters (~16 meshes → ~5 draw calls). `SceneBackdrop`
imports these (the subagent branched from an older base, so its duplicate dispatcher + ported helpers
were discarded in favour of the current ones). Verified Park + Hills via the screenshot harness.

## [C155] Design score categories click to select + frame their offending items
`buildDesignScore` attaches per-category `offenders` (item ids) for Clearance (overlap/wall-clip/blocked)
and Circulation (pinch-point items); the `DesignScorePanel` renders those categories as buttons that
select + frame the offenders — the score doubles as a jump-to-the-fix list. Tests for the offender ids.

## [C154] Design score in the printable report (DS2)
The handoff report (`ui/report.ts`) now carries the same aggregate 0–100 design score + A–F grade +
per-category bars (clearance / furnishing / circulation / daylight / lighting) and actionable fixes the
in-app `DesignScorePanel` shows, so the quality verdict travels with the PDF. Rendered from
`buildDesignScore` between the Clearance and Wall-elevations sections; omitted when the design is empty.
Also hardened `buildDesignScore` against a partial/hand-built plan with no `walls`/`openings` arrays
(guards the clearance + daylight categories). 2 report tests + a partial-plan robustness test.

## [C153] Smart Start furnishes any custom plan / template (not just the default flat)
The Smart-Start presets are authored at the built-in flat's exact coordinates, so applying one to any
of the 16 HDB/condo/landed templates dumped furniture in the wrong places. New pure
`furniture/furnishPlan.ts` `furnishPlanItems(plan, preset, defs, doors)`: seeds a kind-appropriate kit
per room (living/dining · master/standard bedroom · kitchen · bath; utility/balcony left empty), drops
each at the room centre, runs the existing plan-aware arranger to flush everything to the plan's own
walls, then sweeps residual overlaps so the result is always collision-clean. The preset palette
restyles the seeded furniture. `applyLayoutPreset` branches on `isDefaultPlan` → uses this for custom
plans. 5 tests; verified by furnishing a custom HDB-style plan via the screenshot harness. Turns the
exhaustive template library (C148) from empty shells into one-click furnished starts.

## [C152] Cabinet glass fronts adopt the tier-gated GlassMaterial
Wired the display-cabinet glass door (`CabinetModule` `'glass'` front) through the PR3c
`GlassMaterial` component — real refractive transmission on High/Maximum, cheap transparent pane on
Performance/Medium — extending the glass rollout beyond Shower + BarCart with the same verified pattern.

## [C151] Richer, instanced HDB-estate city backdrop (photorealism + perf)
Reworked the default **City** backdrop (`CityBackdrop.tsx`) for fidelity *and* draw-call economy:
blocks render as **instanced batches** (3 façade-tint `InstancedMesh`es + 1 rooftop-tank batch) instead
of ~22 separate meshes; a **denser two-ring skyline** (near mid-rise + far towers, ~40 blocks) gives
real depth; **rooftop water-tanks / lift cores** add silhouette interest; the façade texture gains
floor banding, lit window reveals and AC-ledge sills. The night window-emissive ramp is preserved per
material group. Verified day + night with the screenshot harness — the estate reads as a layered HDB
neighbourhood and windows light up warm after dark, with no artifacts.

## [C150] Performance — instance four more repeat-geometry primitives (parallel worktree subagent)
Extended the `InstancedBoxes` draw-call collapse to **RoomDivider** (slat/grid: ~24–40 meshes → 1),
**CubeShelf** (carcass + boxes + colour-varied books → 2), **FeatureWall** (slat backing + ~33 battens
→ 1), and **ToyStorage** (carcass → 1). New pure `primitives/slatLayout.ts` (batten/grid count/step/
offset maths) shared by RoomDivider + FeatureWall, and a pure `bakeInstanceMatrix` extracted from
`InstancedBoxes.tsx` — both unit-tested (14 assertions) against the exact original inline formulas, so
geometry is byte-identical. Fluted (cylinder) ribs and per-item-material bins/hangers intentionally
stay separate (axis-aligned single-material instancing only; no cross-item instancing). Built by a
subagent in an isolated worktree, integrated by 3-way merge.

## [C149] PR3c — material realism: sheen + clearcoat + tier-gated glass transmission (parallel worktree subagent)
New pure `src/materials/materialRealism.ts` (no three/GPU deps, 15 tests): `transmissionTiers(tier)`
(the High/Maximum gate), `glassConfig(tier, opacity, tint)` (real refractive params vs cheap
transparent fallback), `sheenLayer(kind)` (velvet/satin-fabric/leather), `clearcoatLayer(kind)`
(gloss/ceramic/marble/stone). Wired into `furnitureMaterials.ts`: velvet/leather/fabric/ombre get a
`MeshPhysicalMaterial` sheen lobe; lacquered paint + polished stone get a thin clearcoat; wood/fabric/
leather/velvet normals sharpened. New `getGlassMaterial(tier,…)` factory + `GlassMaterial.tsx`
component (reads `qualityTier` like `MirrorMaterial`) — **real transmission only on High/Maximum**, cheap
transparency on Performance/Medium so the flat default never pays for it. Applied to Shower screens +
BarCart glass shelves. Built by a subagent in an isolated worktree; integrated via a 3-way merge that
preserved the newer PR3b (`GLOSSY_ENV_INTENSITY`) + concrete/rattan work. Real-GPU visual verification
of transmission/clearcoat/sheen deferred (software-GL harness can't show them — see TASKS).

## [C148] Exhaustive HDB + condominium floor-plan template library (parallel worktree subagent)
Expanded `floorplan/templates.ts` from 4 HDB types to 16 starter plans: added **HDB Executive Apartment**
(~138 m²), **HDB 3Gen** (~118 m²) and **HDB Jumbo** (~190 m²); plus a condominium/landed set —
**Condo 1-Bed / 1+Study / 2-Bed / 3-Bed**, **Penthouse** (3.0 m ceiling) and a **Terrace house** ground
floor. Balconies/car-porch modelled as `floor-terrazzo` rooms with a parapet (`topHeight`). New research
doc `docs/research/condo-floor-plans.md`. Generalised the templates test to cover ALL templates (unique
ids, no room overlaps, in-bounds, every opening references a real wall and fits within it) — 12 tests.
Built by a subagent in an isolated worktree, integrated by 3-way merge (resolved the HDB-count assertion
4→7). All auto-appear in the floor-plan editor's Template picker.

## [C147] Design Score — aggregate layout-quality feedback panel
New pure `src/analysis/designScore.ts` `buildDesignScore(items, defs, plan)` → a weighted 0–100 score +
letter grade across five categories (clearance, furnishing balance, circulation, daylight, lighting),
each with actionable issues. Reuses the existing pure checks (`findItemOverlaps`/`findWallClips`/
`blockedDoorItems`/`findNarrowGaps`/`buildDaylightReport`) and adds two new heuristics — furnishing
coverage (footprint area vs room area, ideal ~22–45%) and per-room lighting coverage (emitters via
`LIGHT_EMITTERS`). Surfaced as a new `DesignScorePanel` (`.aux` slot: grade dial + per-category bars +
fix list), wired into the Tools menu + Command Palette + `closeAux`. 9 module tests. A Coohom/Planner-5D-
style live design-feedback feature, fully verifiable without a GPU.

## [C146] HDB flat floor-plan templates (researched via a worktree subagent)
Dispatched a dedicated research subagent (own worktree) to gather representative Singapore HDB
flat-type floor plans → `docs/research/hdb-floor-plans.md` (2-room Flexi, 3/4/5-room, Exec/3Gen:
bounding footprints + per-room W×D + layout adjacency + sources). Integrated four as reusable
`FloorPlan` templates (`hdb2Room`/`hdb3Room`/`hdb4Room`/`hdb5Room` in `templates.ts`) — non-overlapping
rooms, perimeter + partition walls, entrance/doors/windows, 2.6 m ceiling — appended to
`PLAN_TEMPLATES` so they auto-appear in the floor-plan editor's Template picker. Added a test asserting
HDB templates have no overlapping rooms + stay within bounds + unique room ids. Verified each renders
cleanly (4-room/2-room as labelled 2D plans; 3/5-room as valid 3D shells).

## [C145] Circulation / walkway-width check (built in parallel via a worktree subagent)
New pure `src/layout/walkway.ts` `findNarrowGaps(items, defs, plan)` → pinch points where the clear
gap between footprints (item↔item + item↔wall, reusing `itemFootprint`+`obbCorners`) falls in the
band (0.4 m, 0.9 m): **tight** < 0.6 m, **sub-ideal** < 0.9 m. Excludes overlaps (separate check) +
intentionally-close pairs (≤ sofaToCoffee). Surfaced as a "Walkways" category in the Clearance panel
(+ the summary now wraps to fit 5 stats) and folded into the report's Clearance & fit section. Built
by a subagent in an isolated git worktree; I took its tested pure module verbatim and re-applied the
UI/report wiring onto the current (newer) files. 20 module tests + a report test.

## [C144] Daylight & ventilation check (built in parallel via a worktree subagent)
New pure `src/analysis/daylight.ts` `buildDaylightReport(plan)` → per interior room: window glazing
area vs floor area (daylight ≥ 10%) + openable area (ventilation ≥ 5%, openable ≈ 50% of glazing),
each PASS/FAIL — an HDB/BCA-style code check. Windows attributed to rooms via the wall normal +
`pointInRoom`; external/ledge rooms skipped. Surfaced as a new **Daylight** `.aux` panel (Tools →
Daylight) with per-room cards. Built by a subagent in an isolated worktree; new files taken verbatim,
wiring (featuresSlice/App/ToolsMenu) re-applied onto current files. 14 unit tests. Verified the panel
renders (4/10 daylight·vent pass on the default flat; windowless Corridor/Bath correctly FAIL).
Also: excluded `.claude/**` agent worktrees from the vitest glob (they were doubling the test count).

## [C143] Lighting plan: room name labels
The lighting plan now labels each room at its centroid (`roomLabelPoint`), so the reflected-ceiling
plan reads room-by-room instead of as an unlabelled grid of fixtures. Internal to `lightingPlanSvg`;
user-entered room names are HTML-escaped (test covers escaping).

## [C142] Elevations: clearer door symbol (framed leaf + handle)
Doors in elevations now render as a framed leaf panel — an outer frame, a thin inset reveal, and a
handle dot at ~1 m on the leading edge — instead of a blank dashed cut-out, so they read as doors.
Internal to `elevationSvg`; covered by a new test (frame width + handle, no legacy dashed style).

## [C141] Drawing set — paginated multi-sheet "plan set" export
Fourth research-grounded large feature: a formal construction **drawing set** (Tools → Drawing set),
distinct from the one-page summary report. Paginated A4-landscape sheets with title blocks — cover +
sheet index, floor plan (A-1), one wall elevation per sheet, lighting plan + schedule, and the FF&E
schedule — each on its own page (`@page` + page-break) for clean print/PDF. Reuses every pure
renderer (`reportPlanSvg`, `elevationSvg`, `lightingPlanSvg`, `buildFfeSchedule`) so it stays in
lock-step. All user text HTML-escaped. 4 content tests; 1183 green. Opens in a print window (verified
via content tests + renderer reuse, per the report convention).

## [C140] EL5 — per-item width dimensions on wall elevations
Elevations now dimension each furniture piece's width in a row just below the floor (the cabinet/
unit widths installers read off NKBA elevations), above the overall-width dimension. Narrow pieces
(<0.3 m) are skipped to avoid clutter. Verified on a busy wall (3 beds + nightstands) — widths read
cleanly. Test asserts the per-item width label.

## [C139] FF&E schedule — the item-level procurement table in the report
Third research-grounded large feature (FF&E = Furniture, Fixtures & Equipment — the central designer
hand-off per Fohlio/Houzz/Programa). New pure `src/ffe/ffeSchedule.ts` `buildFfeSchedule(plan,items,
defs)` → one row per (room, def, variant): room, category, name, **source** (Built-in/IKEA/Custom/…),
**SKU** (IKEA article number), real **W×D×H**, qty, unit + line price — room-ordered, value-sorted,
reusing `pointInRoom` + `itemPrice`. Rendered as a full-width **FF&E schedule** table in the report
with a grand total. (Checked first — distinct from the existing category-cost summary + the existing
shopping CSV.) 4 core tests + 2 report tests; 1179 green. Docs + ARCHITECTURE updated.

## [C138] LP4 — unified in-app "Drawings" panel (elevations + lighting)
Extended the elevations panel into a **Drawings** panel with an Elevations/Lighting toggle, surfacing
the lighting plan in-app (it was report-only): the lighting view draws the fixtures + coverage circles
over the walls (theme-token `lightingPlanSvg`) with a fixture/type count. Tools entry relabelled
"Drawings". Verified: the Lighting view shows the default flat's 15 fixtures · 6 types with coverage.
Avoids panel proliferation; desktop + mobile-sheet both work. Docs updated.

## [C137] LP3 — lighting plan + schedule in the report
The design report now has a **Lighting plan** section: every fixture plotted over the walls (coverage
circles + glyphs via `lightingPlanSvg`, print inks) plus a **schedule** table (fixture · qty · height ·
intensity in candela). Only when the design has lights. 1 report test (plan svg + schedule present);
1173 tests green. Completes the second large drawing feature (LP1 core → LP2 renderer → LP3 report).
Docs + ARCHITECTURE updated.

## [C136] LP2 — lighting-plan SVG renderer
Pure, palette-injected `lightingPlanSvg(plan, lights, {palette})` (`src/ui/lighting2d/`): top-down
drawing matching the floor plan — thin wall context, each fixture's coverage (falloff) circle, and a
light glyph (warm bulb dot + 4-ray star) at the bulb position. Shared by the report (print inks) and
any in-app view (CSS tokens), mirroring the elevation renderer. 3 tests (walls/coverage/glyph,
coverage-off, degenerate-plan). LP3 wires it + the schedule into the report.

## [C135] LP1 — lighting plan: pure data core
Started a second large, research-grounded drawing feature (reflected-ceiling / lighting plan — a
Chief Architect / RoomSketcher deliverable). New pure `src/lighting2d/lightingPlan.ts`
`buildLightingPlan(items, defs)` → every placed light fixture (from the existing `LIGHT_EMITTERS`
registry) with world position (footprint centre + its rotated emitter offset), emit height,
intensity, coverage radius + colour, plus a grouped schedule. Reuses real emitter data (no new
placement UI). 5 unit tests (filtering, flush height, offset rotation, schedule grouping, label
fallback). No GPU — fully verifiable. LP2 (SVG over the plan) + LP3 (report schedule) next.

## [C134] Guard projectAllElevations against a plan with no walls array
`projectAllElevations` mapped `plan.walls` directly, which threw for a partial/hand-built plan stub
(caught by `reportData.test.ts` after EL4 wired elevations into the report — same class as C116).
Now defends with `plan.walls ?? []`; added a regression test.

## [C133] EL4 — wall elevations in the printable report
The design report now has a **Wall elevations** section: every wall that carries furniture or
openings is drawn (2-up grid, print palette, captioned + dimensioned) — so the PDF hand-off carries
the vertical drawings alongside the floor plan, clearance checks and shopping list. Reuses the same
`elevationSvg` renderer (already visually verified in the panel) with print inks; the section is
omitted when the flat is empty. 2 new report tests (section present + omitted-when-empty). Docs updated.
(The report opens in a popup the screenshot harness can't capture — verified via content tests +
renderer reuse, per the repo's report-verification convention.)

## [C132] EL3 — dimensions on wall elevations
`elevationSvg` now draws architectural dimension lines (overall width below, overall height at the
left with a rotated label, and each window/raised opening's sill height) with tick marks + unit
labels (metric/imperial) — turning the elevation into a real technical drawing for cabinet/fixture/
backsplash heights. On by default (`dimensions` opt); reserves left+bottom padding for the lines.
Tests cover the dim labels + the expanded viewBox; verified the dims render in the panel.

## [C131] EL2b — Elevations panel (Tools → Elevations)
Wired wall elevations into the app: a new `ElevationPanel` (`.aux` panel, so it docks top-centre on
desktop + becomes a full-width bottom sheet on mobile for free) with a wall picker + theme-token SVG;
`elevationsOpen` state (featuresSlice, in the mutually-exclusive aux group) + a Tools-menu "Elevations"
entry. Verified on desktop + mobile: Wall 1 of the default flat correctly draws its 3 windows + the
Queen/Single/Double bed silhouettes at their real positions/heights. 1160 tests green.

## [C130] EL2a — wall-elevation SVG renderer
Pure, palette-parameterised `elevationSvg(el, {palette})` (`src/ui/elevation/elevationSvg.ts`): draws a
`WallElevation` to a standalone SVG string in world metres (floor at the bottom) — wall panel + floor
line, furniture silhouettes (back-to-front, labelled), windows (translucent pane + mullion cross) and
doors (dashed cut-out). Palette is injected so the in-app panel (CSS tokens) and the report (print
hexes) share it; `elevationCaption` summarises dims/openings/items. User labels are HTML-escaped
(XSS-safe). 6 tests incl. injection + degenerate-wall. EL2b wires the panel next.

## [C129] EL1 — interior wall elevations: pure projection core
First step of a large, research-grounded feature (wall elevations are a standard pro deliverable —
Chief Architect / Cedreo / NKBA — that we lacked; we only had a top-down plan). New pure module
`src/elevation/projectElevation.ts`: per plan wall → a `WallElevation` (length × height, door/window
openings placed by offset/width/sill/head, and the furniture against the wall projected onto the wall
axis with its height, near-wall-filtered + sorted back-to-front). Plan-wall based so default + custom
plans share one path; reuses the collision OBB helpers. 9 unit tests (extent, openings, projection,
near/off-span/clamp, ordering, missing-def). No GPU — fully verifiable. EL2 adds the SVG + panel.

## [C128] Fix GLB designer layout on mobile (responsiveness)
The designer's side-by-side preview+controls `flex` row broke on phones — the preview collapsed to a
~120px sliver and the 280px controls column overflowed off-screen (shape buttons + dropdowns clipped).
Now stacks vertically on mobile (`useIsMobile`): full-width preview on top (38vh), scrollable controls
below. Desktop layout unchanged. Verified before (broken) → after (usable) at 390px + that desktop is
intact. Closes a real commercial-readiness gap (the repo's desktop+mobile rule).

## [C127] PR3b — glossy furniture finishes catch more of the IBL
Set `envMapIntensity` (`GLOSSY_ENV_INTENSITY` = 1.3) on the glossy furniture material factories —
marble/stone, leather, velvet — so they pick up more of the procedural IBL probe and read premium +
photographic; matte finishes (fabric, concrete) stay at the neutral default of 1 (extra reflection
would only muddy them). Free on Performance (no IBL there). Smoke-verified the scene renders cleanly
at high tier (66 items, no artifacts); the reflection gain shows on a real GPU (prod verification).

## [C126] GE4 — "Update original": save GLB-designer edits back over an existing asset
When the designer is built from one of your own assets, a new **Update original** toggle overwrites
that asset in place instead of adding a new catalog entry — built on the tested `replaceUserFurniture`
(keeps every placed copy referencing it + frees the old blob). `exportAndSaveAsset` gained an
`overwriteId`; the export is re-homed under the source id via the pure, unit-tested `buildOverwriteDef`.
Logic + UI verified; the full export round-trip needs a real uploaded source asset (left for prod
verification — the headless GLTFExporter/IDB path isn't set-up-able here). Docs updated.

## [C125] GE7 — mirror a part across the centre in the GLB designer
Added `mirrorPart` + a "Mirror across centre" button (part Edit panel): clones the selected shape to
the opposite X with its Y/Z rotations negated, so a symmetric pair (chair arms, table legs, sofa
sides) is one click. Unit-tested (position/rotation negation + deep-copied tuples + unknown-id
no-op); verified the button renders in the editor. Pairs with C122's duplicate for fast builds.

## [C124] GE1b — wedge (ramp) primitive in the GLB designer
Added an 8th primitive, **wedge** (a right-triangular prism / ramp — angled supports, roof slopes,
door stops). Built via `ExtrudeGeometry` of a triangle so three derives correct winding + normals,
then mapped (extrude axis → X) and centred. Unit tests confirm finite geometry + an exact w×h×d
bounding box; verified it renders as a clean flat-shaded ramp in the designer. Docs updated.

## [C123] PR1b — user Exposure (brightness) slider
Added an **Exposure** control in Graphics (0.6–1.6×) that rides on top of the altitude-driven
auto-exposure — like a camera's exposure-compensation dial — so users can brighten or darken the
whole scene to taste. Pure `clampExposure` helper (tested), persisted per-device in qualityPrefs;
`Lighting` folds it into `gl.toneMappingExposure`. Verified 0.6× vs 1.6× visibly darken/brighten
the render with no artifacts. Docs updated.

## [C122] GE6 — duplicate a part in the GLB designer
Added a per-row **duplicate** button (and `duplicatePart` in `editSpec.ts`) that clones a shape with
its full transform + material, deep-copying the size/rotation tuples and offsetting the copy along X
so it's visible — fast symmetric/repeated builds (table legs, slats). Unit-tested (clone independence
+ unknown-id no-op); verified the button adds a selected copy in the designer.

## [C121] GE2a — per-part rotation in the GLB designer
Each composed primitive now carries an optional Euler `rotation` (degrees), edited via a new
Rotation (°) row, so cones/capsules/torus rings/pyramids can be laid on their side or angled
(previously fixed-orientation). `buildEditedObject` converts deg→rad onto the mesh; the live
preview applies the same. Unit-tested (90° → π/2 on the built mesh). A full drag gizmo stays GE2b.

## [C120] GE3b — GLB designer parts can glow + go translucent
Rounded out the per-part material editor with **glow** (emissive in the part's own colour — neon,
lamp shades, screens) and **opacity** (translucent glass/acrylic) sliders. `partMaterial` sets
emissive/emissiveIntensity + the `transparent` flag, shared by preview + export. Verified all four
material sliders (roughness/metalness/glow/opacity) render with correct defaults; unit tests cover
the opaque/glow/translucent paths. Docs updated.

## [C119] GE3 — per-part PBR finish (roughness + metalness) in the GLB designer
Each composed primitive now carries optional `roughness`/`metalness` (defaulting to the old
0.6/0.05 matte look), driven by two sliders in the part Edit panel — so a part can read as matte
wood, soft plastic or polished metal. A shared `partMaterial` builds the material for both the
export and the live preview (no drift). Verified the sliders render with correct defaults; unit
tests assert defaults + explicit values flow into the built mesh material. Docs updated.

## [C118] PR3a — sharper IBL reflections at higher tiers
Made the procedural IBL probe's cubemap resolution tier-driven (`QualitySettings.envResolution`:
64 perf / 96 medium / 192 high / 256 maximum) instead of a flat 64px, so glossy surfaces
(glass, metal, varnished wood, marble) get crisper reflections as quality rises — at a one-time
build cost only. Test asserts the resolution ladder is monotonic. (First slice of the material
realism phase; deeper PBR work continues in PR3b.)

## [C117] PR2 — cinematic post stack on the Maximum tier
Made `EffectsImpl` tier-aware via two new `QualitySettings` flags (`aoFullRes`, `cinematic`, both
on only at Maximum, both gated behind `postprocessing`): full-resolution + high-quality N8AO, plus
a faint luminance-aware film grain (`Noise`) and a sub-pixel radial chromatic aberration so stills
read "photographed, not rendered". Effects assembled as a keyed array (composer children reject
conditional nulls). Smoke-verified the Maximum tier mounts + renders with no errors in the
software-GL harness; the subtle grading is for production GPU verification. Tests + docs updated.

## [C116] Fix report crash on a plan with no walls array (C113 regression)
The C113 wall-clip check called `planCollisionWalls(plan, {})` for any non-default plan, which threw
`plan.walls is not iterable` for a partial/hand-built plan (caught by `reportData.test.ts`). Guarded
it to skip the wall-clip scan when the plan has no `walls` array.

## [C115] GE1 — GLB designer: cone, pyramid, capsule & torus primitives
First step of the GLB-editor-pro program. Added four primitive shapes beyond box/cylinder/sphere —
cone, pyramid (45°-rotated square cone), capsule, torus — driven by a single `SHAPE_KINDS`/
`SHAPE_LABEL` source of truth in `editSpec.ts` with per-kind default sizes + floor-resting Y.
`partGeometry` (now exported) builds them and is reused by the live preview so it can't drift from
the export. Verified all four render correctly + selectable/editable in the designer; unit tests
assert every kind yields finite, non-degenerate geometry + one mesh per part. Docs updated.

## [C114] PR1 — selectable tone-mapping "Look" (Filmic / AgX / Neutral)
First step of the ultra-photorealism program. Made the renderer's view transform user-selectable in
**Graphics → Look**: Filmic (ACES, the existing default — no regression), AgX (gentler highlights,
more photographic), Neutral (Khronos PBR-neutral, truest material colour for showroom shots).
Pure/unit-tested operator + per-mode exposure bias in `look.ts`; `toneMappingThree.ts` maps to the
three constant; `Lighting` sets `gl.toneMapping`+exposure per-frame; persisted in qualityPrefs
(back-compat). Verified all three render distinctly + correctly (no artifacts) at high tier. Docs +
ARCHITECTURE updated.

## [C113] Design report surfaces overlaps + wall-clips (not just door blocks)
Extended the report's "Clearance & fit" section to run the full check set (door-swing blocks +
`findItemOverlaps` + `findWallClips`), matching the in-app Checks panel, so a printed/handoff report
flags overlapping pieces and furniture embedded in a wall — not just blocked doorways. All names are
HTML-escaped (same XSS-safe path). Tests + user doc updated.

## [C112] Clearance panel now flags furniture left inside a wall
Added `findWallClips(items,defs,walls)` (collision/placement.ts) — scans non-mounted, non-rug items
for footprints poking into a wall *body* (the same full-thickness wall OBBs `canPlace` rejects, so
flush-against-the-face placement is never flagged). Catches pieces stranded inside a wall after a
floor-plan edit. Surfaced as an "In wall" issue category; the panel resolves whole-plan collision
walls (default flat or custom plan). Verified the wall-clip card + 4-column summary render with no
false positive on a clear item. Tests + docs + ARCHITECTURE updated.

## [C111] Clearance panel now flags furniture-vs-furniture overlaps
The Clearance panel only checked door-swing blocking despite its "fit checks" framing. Added
`findItemOverlaps(items,defs)` (collision/placement.ts) — reuses the proven `canPlace`
furniture-vs-furniture rule (OBB + height-aware vertical spans + group-mate / rug / mounted
exemptions) across the whole design, so it never false-flags a stacked mattress, decor on a
surface, a rug, or grouped pieces. Surfaced as a second "Overlapping" issue category (amber) with
a Blocking/Overlapping/Clear summary; clicking an overlap selects + frames both pieces. Verified
both the overlap and all-clear states visually. Docs + ARCHITECTURE updated.

## [C110] Harden share-link decode against decompression bombs
`decodePlan` only capped the *compressed* code length (2 MB) — but deflate expands that into
gigabytes, so the claimed zip-bomb guard didn't hold (a single `inflateSync` allocates the whole
output before any size check). Replaced it with a bounded streaming inflate that feeds the deflate
stream in 16 KB slices and aborts once decompressed output passes a 50 MB cap (mirroring the
`.sofa.json` import limit). Added a regression test that feeds a 64 MB-of-zeros bomb and asserts a
clean `PlanShareError` instead of an OOM.

## [C109] Fix autosave dropping floor-plan / lights / annotation / orientation / note edits
The autosave watcher (`pickPersistent`/`shallowEqual`) only tracked a subset of what `serialize()`
persists, so editing *only* the floor plan, lights mode, a pinned dimension annotation, scene
orientation, or the design note never triggered a save — the change was silently lost on reload
unless an unrelated tracked field also changed. Added all five fields to the watcher (in lock-step
with `serialize()`) + a parametric regression test asserting each one autosaves on its own.

## [C108] Code-split the GLB Designer out of the initial bundle
Release-readiness checkpoint (tsc + 1102 tests + prod build + both doc guides — all green) flagged
the main JS chunk >1 MB. Lazy-loaded the Pro-only, fullscreen **GLB Designer** (`React.lazy` +
mount gated on `glbDesignerOpen`, matching the FloorPlanEditor pattern) so its editor + GLTF
exporter leave the initial bundle — the build now emits a separate `GlbDesignerDialog` chunk
(~3.9 kB gzip + its deps, loaded on open). Verified it still opens + renders in Pro mode.

## [C107] Regression guard — lint docs prose for build-breaking placeholder tags
Added `docsMarkdownLint.test.ts`: strips code spans/blocks from every user + developer guide
`.md`, then fails if any prose contains an unknown `<tag>` (the `<room>`-style placeholder that
silently broke the VitePress build in C106). Catches the whole class of bug in `npm test` —
far faster than a full `vitepress build` in CI — so the guides can't regress unnoticed again.

## [C106] Fix broken user-guide build + document the multi-select toolset
Fixed a **pre-existing broken `docs:build`**: three `*"Enter <room>?"*` placeholders (navigating
+ room-editor docs) were parsed by VitePress/Vue as unclosed `<room>` tags, failing the whole
user guide (and `build:all`); escaped them to `&lt;room&gt;`. Verified `npm run docs:build` now
completes. Also rewrote the user guide's "Multi-select" section to document the full toolset with
exact button labels (align centre/edge, even-gap distribute, rotate, mirror, snap, arrange-as-run).

## [C105] Docs: multi-select toolset map + full-panel render check
Brought `docs/ARCHITECTURE.md`'s multi-select line current — it now lists the full toolset
(align centre/edge, even-gap distribute, rotate ±90°, face-into-room, snap-to-wall, arrange-as-
run, mirror) and notes the shared `layout/selectionActions.ts` module (inspector + ⌘K).
Screenshot-verified the now-rich panel renders cleanly with no overflow (incl. the Mirror button).

## [C104] Mirror selection (left ↔ right) — multi-select + ⌘K
Added a **Mirror** bulk action that reflects the selection across its own centre line — each
piece's X reflects, heading negates and geometry flips (`flipX`), so an asymmetric layout reads
as its true mirror image (reuses the tested `mirrorItemX`). Commits **all-or-nothing** so a
piece that would clip a wall on the far side never half-mirrors the group into an overlap.
Wired into the inspector + the ⌘K Selection group. Verified (positions swap across centroid + flip).

## [C103] New storage item — freestanding garment rack
Added a `GarmentRack` primitive + catalog entry (storage): an open clothing rail on a
metal/wood/painted frame with a lower shoe shelf and a row of hung garments on hangers — the
open-storage alternative to a closed wardrobe (bedrooms, staging, retail). Screenshot-verified
both frame finishes (rail, shelf, varied hung garments).

## [C102] Docs: refresh catalog count (~75 → ~95) after this session's additions
Updated the README's stale "~75-item" catalog claim to "~95-item" (now ~97 entries: 93 builtin
+ 4 cabinet defs) after the session added toddler bed, laundry hamper, wall tapestry, floor
speaker, outdoor lounger, pet bed and aquarium. Verified the full default flat (66 items, 11
rooms) still boots + renders cleanly end-to-end — no regression from the session's changes.

## [C101] Aquarium glows at night + emitter-spec guard test
Registered the aquarium as a soft cool-aqua night-time light emitter (bulb placed inside the
water column) so it reads as a glowing tank after dark, matching the existing fixture emitters.
Added `lightEmitters.test.ts` validating every emitter spec (real catalog id, finite height,
positive intensity/distance, hex colour) + that the aquarium bulb sits within its tank. (The
night glow itself renders only on a dark scene/real GPU, like the other fixture lights.)

## [C100] New decor centrepiece — aquarium / fish tank
Added an `Aquarium` primitive + catalog entry (decor): a tintable stand cabinet with a clear
glass tank over a gravel bed, tinted water filled to just below the rim, planted stems and a
black top trim. A real interior centrepiece that was missing. Screenshot-verified (glass shows
the water/gravel/plants through it; sits on its stand).

## [C99] Security regression test — escape malicious user-furniture names in the report
Audited every HTML sink in the printable report (the only `document.write` path): plan name,
note, room/finish names, item names and annotation labels all already route through `esc()`.
Locked it in with a regression test that a user-uploaded piece named with an `<img onerror>`
payload is escaped in the shopping list (the one user-controlled string that wasn't yet tested).

## [C98] New decor item — pet bed (round basket / rectangular mat)
Added a `PetBed` primitive + catalog entry (decor): a round basket (cushion pad inside a raised
bolster ring) or a rectangular mat with bolsters on three sides, open at the front. Pets are a
real interior consideration that was entirely missing. Screenshot-verified both shapes.

## [C97] Shared selection-action module + ⌘K commands for wall actions
Extracted the multi-select wall/orient actions (snap-to-wall, arrange-as-run, face-into-room)
out of the inspector into a reusable `layout/selectionActions.ts` (slimming the panel and
de-duplicating the logic), then surfaced them in the **command palette** as a *Selection* group
that appears whenever 2+ pieces are selected. Screenshot-verified the ⌘K commands appear + run.

## [C96] Wall-aware "Arrange as run" for multi-select (kitchen-run feature)
Added an **Arrange as run** bulk action (pure, tested `layout/arrangeRun.ts`): lines the
selection up as one run — backs flush to the nearest wall, butted edge-to-edge in left-to-right
order, centred on where they were. The headline kitchen-run / wardrobe-wall move. Verified
end-to-end (3 scattered base cabinets → a flush butted run against the wall, fronts to room).

## [C95] Worktop materials on the kitchen island + counter primitives
Extended C94's worktop finishes to the `KitchenIsland` (was hardcoded marble) and
`KitchenCounter` (was a glossy slab) primitives via a `worktopFinish` option — island defaults
to marble, counter to solid (both back-compat). Concrete/marble/wood counters now span the
whole modular kitchen. Screenshot-verified (concrete island top + marble counter).

## [C94] Cabinet worktop materials — marble / concrete / butcher block
The parametric base cabinet's worktop was a flat glossy slab; added a `worktopFinish` option
(solid / stone-marble / concrete / wood) so it renders a real textured worktop via
`getSurfaceMaterial` (tiled ~2× for counter scale), defaulting to the old solid for back-compat.
Concrete & stone counters are the signature kitchen finish. Screenshot-verified (marble + concrete tops).

## [C93] Overlap guard for furniture sets + de-clip vignettes + parasol shade fix
Added a collision-validity test for every `FURNITURE_SETS` vignette (ungrouped, so it catches
real geometry overlaps; rugs/different-height items stay exempt) and nudged the pieces it
flagged so nothing clips — lounge, reading-nook, entryway, study, balcony, kids-room, sun-deck.
Also fixed a real bug: the **parasol had no `verticalSpan`**, so its 2.2 m canopy read as a
floor-level obstacle and nothing could sit in its shade — now spanned at canopy height so
loungers/tables tuck underneath. Verified (entryway row + all sets collision-clean).

## [C92] New one-click vignette — Sun deck set
Added a `sun-deck` furniture set (two loungers sharing a side table, parasol behind for shade)
— the poolside/balcony lounging counterpart to the bistro Balcony set. Screenshot-verified the
arrangement (loungers separated, parasol canopy overhead, no overlaps).

## [C91] New outdoor item — sun lounger / daybed
Added an `OutdoorLounger` primitive + catalog entry (outdoor category): a low slatted frame on
short feet with a thick seat cushion and an inclined back cushion at the head, in teak / rattan
/ painted / metal finishes. Expands the balcony/poolside set. Screenshot-verified (profile:
feet on floor, reclined backrest, cushions).

## [C90] "Snap to wall" for multi-select (+ pure flush/edge helpers)
Added a **Snap to wall** bulk action: pushes every selected piece flush against its nearest
room wall and turns its back to it (orient + move collision-checked together). Factored the
maths into pure, tested `faceWall.ts` helpers (`nearestWallEdge`, `rotationForEdge`,
`flushToWall`). Verified end-to-end (dresser → flush west wall, bookshelf → flush north wall).

## [C89] Bulk rotate ±90° for multi-select
Added **Rotate −90° / +90°** buttons to the multi-select panel: turns every selected
(unlocked) piece in place by a quarter turn, collision-checked per item (a piece that would
clip after turning is skipped). Fills the gap where multi-select could face-into-room but not
free-rotate. Verified end-to-end (two chairs turn 0→π/2 and re-render correctly).

## [C88] New surface finish — matte concrete / micro-cement
Added a `concrete` finish to `getSurfaceMaterial` (`getConcreteMaterial` — a tinted matte grey
with cloudy mottle, sparse aggregate specks and a fine-pore normal) and offered it on the
coffee/side/dining tables, kitchen island & counter, wall cabinet and vanity — the on-trend
industrial look. Screenshot-verified (coffee table + island read as believable concrete).

## [C87] Edge alignment for multi-select (Left / Right / Top / Bottom)
Wired the footprint-aware `alignEdge` helper into the inspector's multi-select panel as a new
**Align edges** section — snap every selected piece's near/far edge along X or Z to the
selection's extreme edge (vs only centre alignment before). Verified end-to-end (3 mixed-depth
items → back edges flush to a line).

## [C86] Footprint-aware even-gap distribute (+ pure align/distribute module)
Extracted the multi-select align/distribute maths into a tested pure module
(`layout/alignDistribute.ts`, 12 tests) and upgraded **Distribute evenly** to space
edge-to-edge *gaps* equally using each piece's footprint — so a row of differently-sized
items reads tidy (the old centre-spacing left uneven gaps). Verified end-to-end (4 mixed-size
items → equal ~0.82 m gaps, extremes pinned). Also exposes a footprint-aware edge-align helper.

## [C85] New electronics — floor-standing speaker
Added a `FloorSpeaker` primitive + catalog entry (electronics category): a hi-fi tower on a
low plinth with a tweeter + 1–3 woofer cones on the front baffle, matte or wood-veneer
finish, adjustable height. Pairs with the TV/soundbar and fills the thin electronics
category. Screenshot-verified both finishes (driver stack reads on the wood variant).

## [C84] New textile decor — wall tapestry (macramé / woven)
Added a `WallTapestry` primitive + catalog entry (textiles category): a wall hanging on a
wooden dowel, either a fringed macramé panel or a flat woven panel, with adjustable width /
drop / rod height. A mounted item that fills out the thin textiles category. Screenshot-
verified both styles flat against the wall (rod overhang + knotted fringe).

## [C83] New laundry item — laundry hamper
Added a `LaundryHamper` primitive + catalog entry (laundry category): a floor basket with a
round-woven or rectangular bin shape, woven-rattan or canvas body, a fabric liner over the
rim and an optional lid. Fills out the thin laundry category. Screenshot-verified both
variants (round rattan + lidded canvas bin) sitting on the floor.

## [C82] New one-click vignette — Kids room set
Added a `kids-room` furniture set (toddler bed against the wall + bedside nightstand & lamp
+ low toy-storage organiser + play rug) — the post-crib sibling of the Nursery set, dropped
group-selected in one click. Screenshot-verified the arrangement (top-down: no overlaps).

## [C81] New kids item — toddler bed
Added a `ToddlerBed` primitive + catalog entry (kids category): a low junior bed with four
legs, slatted base, mattress + pillow, a tall headboard and a low footboard, plus short
safety side rails over the head-half of each side (the foot-half stays open to climb in) —
the nursery's step up from the crib. Params: frame colour, bedding colour, finish
(wood/painted/gloss). Fills the gap where kids had a crib but no actual kids bed.
Screenshot-verified (profile view: floor contact, headboard/footboard heights, side rail).

## [C80] Lock toggle in the single-item inspector header
Added a lock/unlock button to the inspector header (lock icon when locked, unlock when not)
so a bed/built-in can be pinned in place without opening the Layers tab. Verified the
toggle flips `item.locked`.

## [C79] Report — room schedule header + ceiling-height column
The report's rooms table now has a labelled header (Room / Size / Ceiling / Area) and a
**ceiling-height** column (per-room override or the plan default) — a proper room schedule
for a spec/quote, surfacing the per-room ceiling feature. Report test asserts it.

## [C78] "Centre in room" — one-click move to room centre
Added a **Centre** inspector button (paired with Face-into-room in a 2-up row) that moves
the selected item to the centre of its room, collision-checked — handy for a rug, coffee
table or pendant. Verified (off-corner item snaps to the exact room centre).

## [C77] New furniture finish — woven rattan / wicker
Added a `rattan` finish to `getSurfaceMaterial` (`getRattanMaterial` — a coarse plain
over-under basketweave normal, tan, cached/tiled) and offered it on the outdoor chair +
table. Gives a real rattan look (beyond flat teak) for patio furniture/baskets. Verified.

## [C76] New outdoor item — parasol / umbrella
Added an `OutdoorParasol` primitive + catalog entry: weighted base, metal pole, octagonal
fabric canopy (adjustable ⌀) with valance + finial. Completes the balcony collection
(planter / chair / table / parasol). Screenshot-verified shading a table.

## [C75] Report — wall-finish schedule (paint/tile to order)
The printable report gains a **Wall finish schedule** beside the flooring schedule: gross
wall area per wall finish (room perimeter × ceiling height, honouring per-room overrides),
the paint/tile procurement view. Pure tested `wallAreaByFinish` (+3); report test asserts it.

## [C74] GLB designer — accurate saved footprint
A designer-saved asset got a generic 1×1×1 `defaultFootprint` (wrong catalog dimensions +
first-placement collision until the GLB loaded). Now `saveAsset` measures the built
object's bounding box (`Box3`) and passes it as the footprint (new `persistUserGlb`
option). Removed the superseded unused `partsBounds`. Verified: a 0.4 m box saves as a
0.4 m-cube footprint, not 1×1×1.

## [C73] "Select all of type" — bulk-select matching items
Inspector button (shown when 2+ of a type exist) that selects every item sharing the def,
so you can move/rotate/delete/align them together — complements "Apply finish to all".
Verified (selects exactly the 3 chairs, not the nightstand).

## [C72] Test — guard against empty catalog department tabs
Added a catalog-integrity test asserting every `FurnitureCategory` (except the `others`
catch-all) has ≥1 built-in item — codifying the C66–C69 audit so a department tab can't
silently ship empty again.

## [C71] One-click "Balcony set"
Added a **Balcony set** to the Sets list (Arrange menu): a slatted bistro table with two
facing chairs + a planter, dropped pre-arranged. Reuses the C66/C69/C70 outdoor pieces +
the shared set-drop path; validated by the sets test (defIds + structure) and the C70
screenshot of the identical layout.

## [C70] New outdoor item — slatted bistro table
Added an `OutdoorTable` primitive + catalog entry: a square slatted top on four legs with
a lower stretcher (matching the outdoor chair), adjustable size + height (coffee↔bistro),
teak/painted/metal. With the chair + planter, Outdoor is now a full balcony set.
Screenshot-verified (table + 2 chairs + planter form a cohesive bistro setup).

## [C69] New outdoor item — slatted lounge chair
Added an `OutdoorChair` primitive + catalog entry: a slatted patio/balcony lounge chair
(side frames + legs + armrests, slatted seat, reclined slatted back), teak/painted/metal
finishes. Outdoor now has seating + planter to furnish a balcony. Screenshot-verified.

## [C68] Group baby items under the Baby & Kids department
Moved crib / high-chair / changing-table into the **kids** category (they were split across
beds/seating/storage), so the Baby & Kids tab now holds the nursery set (4 items) — matching
IKEA's Children's department. Old category names kept as search keywords; bunk-bed stays in
beds (dual-use). Verified the tab shows 4 cards.

## [C67] Recategorize items so empty department tabs populate
The **Electronics / Textiles / Laundry** category tabs existed but were empty (their items
were mis-filed): moved TV / soundbar / monitor → electronics, rug / curtains → textiles,
washing-machine / drying-rack → laundry. All 14 IKEA-style department tabs now populate;
defId-keyed saves/layouts unaffected. Verified the chips render.

## [C66] New outdoor item — planter trough (fills the empty Outdoor category)
The **Outdoor** category had zero items (its tab never showed). Added a `PlanterTrough`
primitive + catalog entry: a length-adjustable balcony planter box (concrete/terracotta/
wood) with soil + a run of bushy greenery, customizable planter + foliage colour.
Screenshot-verified.

## [C65] Multi-select "Face into room"
The align/distribute multi-select panel gains a **Face into room** button that orients
every selected (unlocked) piece to its own nearest wall (bulk version of C63),
collision-checked per item. Verified (two nightstands → 0 and π toward the room).

## [C64] Security — escape quotes in the printable report (HTML injection)
The report's `esc()` only escaped `&<>`, but user strings (project note, room/material
names, swatches) are embedded in `style="…"`/`title="…"` attributes — a `"` could break
out and inject markup. Now escapes `"` and `'` too (safe for text + attribute contexts).
Added an injection test (a `"><script>` note/name is fully neutralised).

## [C63] "Face into room" — one-click orient against the nearest wall
Inspector button that turns a selected piece's back to the nearest wall (front into
the room) — fast correct orientation for beds/sofas/desks. Pure tested
`layout/faceWall.ts` `rotationFacingRoom` (+4 tests), collision-checked apply. Verified.

## [C62] New wall finish — fluted / reeded panels
Added a `fluted` procedural pattern (close-packed rounded vertical ribs via a half-sine
height profile; seamless) + three feature-wall finishes (oak / walnut / white plaster).
The on-trend reeded panel, distinct from spaced battens. Screenshot-verified.

## [C61] Test — parametric item props survive save/load
Added a schema round-trip test asserting a parametric item's full `props` (cabinet
worktop/handle/sink/columns/colour/finish + rotation) survive serialize → parse →
`applySerialized` verbatim — guarding persistence of every new cabinet/appliance option.

## [C60] New appliance — wine / beverage cooler
Added a `WineCooler` primitive + catalog entry: slim under-counter unit with a tinted
glass door, wire shelves, interior LED glow and a bar handle; width 30–60 cm,
steel/matte/gloss. Screenshot-verified. (Also: prototyped + reverted a full-scene
GLB export — it can't complete in the headless verify env; deferred in TASKS.)

## [C59] K1b — L-shaped corner base cabinet
Added a `CabinetCorner` primitive + catalog entry completing the kitchen cabinet set:
two perpendicular runs sharing the corner, an L countertop, recessed toe-kicks, and a
door on each run's inner face (back faces to the walls, opens to the room). Screenshot-
verified (clean L carcass + L worktop + doors, no artifacts).

## [C58] Shift-drop to keep placing (place a row fast)
Holding **Shift** when committing a catalog placement now keeps the same piece armed
(same orientation) so you can drop several in a row — a plain click or Esc finishes.
Verified: 3 chairs placed with Shift, plain click disarmed.

## [C57] Rotate the placement ghost before dropping (R)
While placing a catalog item you can now press **R** (Shift = 15°) to rotate the ghost
before committing, so a piece lands facing the right way in one step instead of
place-then-rotate. New `placementSlice.ghostRotation`/`rotateGhost`; the ghost preview +
footprint + collision all reflect it; both click + drop commits apply it. Verified.

## [C56] New appliance — built-in oven
Added a **Built-in oven** primitive + catalog entry (the split-kitchen counterpart to the
cabinet hob): stainless body, dark glass door + bar handle, top fascia with control knobs.
Built-under by default with an adjustable **mount height** for an eye-level column oven.
Steel/matte/gloss, priced. Screenshot-verified (built-under + eye-level).

## [C55] New appliance — dishwasher
Added a **Dishwasher** primitive + catalog entry (a real kitchen-appliance gap): base-
cabinet-sized body, proud front door + recessed handle, top control strip with dials/LEDs,
and a **panel-ready / integrated** option (hides controls to match cabinetry). Steel/matte/
gloss finishes, priced. Screenshot-verified (visible-controls + integrated variants).

## [C54] New wall finish — glossy subway / metro tile
Added a `subway` procedural pattern (`subwayFields` — running-bond 2:1 ceramic tiles, thin
grout, soft bevel; seamless) + two wall finishes (white + sage) at metro scale. The classic
kitchen-backsplash/bathroom wall finish, distinct from the matte exposed-brick. Screenshot-verified.

## [C53] New procedural finish — honeycomb hexagon tile
Added a `hexagon` procedural pattern (`generators.ts` `hexagonFields` — Voronoi cells over
an offset triangular lattice, toroidally seamless, recessed grout) + two catalog finishes
(light + charcoal hex tile). A kitchen/bath staple matching Coohom/Planner-5D. Screenshot-verified seamless on a floor.

## [C52] GLB designer — stagger newly-added shapes
Fixed a usability defect: every added shape spawned at the origin and overlapped
invisibly. `addPart` now staggers each new shape 0.5 m along +X so they're distinct
and editable from there. Tested + screenshot-verified (two side-by-side boxes).

## [C51] GLB designer — placement type (floor / wall-mounted / floor-covering)
The designer gains a **Placement** select so a designed piece saves with the right
collision flags — wall-mounted (`mounted`, skips wall-body collision) or a rug-style
floor covering (`noClip`, never blocks). Pure `placementFlags` (tested); verified the
saved def carries `mounted: true` for a wall piece.

## [C50] GLB designer — discoverable "Design" button
Added a Pro-gated **Design** button to the catalog footer (beside Upload) that opens
the asset designer, so it's discoverable without ⌘K. Hidden in Simple mode.

## [C49] GLB designer — full-screen + Pro-gated
The asset designer now fills the whole viewport (100vw×100dvh, overriding the panel's
max-height) for room to work, and is **Pro-only**: the dialog no-ops in Simple mode and
its ⌘K entry is hidden there (new `PRO_ONLY_COMMANDS` gate in the command palette).

## [C48] GLB designer v2 — per-mesh recolour / hide of a source GLB
The designer now lists a source GLB's named meshes ("Recolour parts") with a colour
picker + hide toggle, so you can recolour a cushion or hide a part to make a variant.
Pure `setMeshOverride` + `applyMeshOverrides` (clones materials, no shared mutation),
tested (+8); composed parts are now named so saved assets are re-editable. Verified.

## [C47] GLB Asset Designer — compose / edit custom 3D assets
New in-browser asset designer (⌘K → "Design a 3D asset"): compose an asset from
primitive shapes (box/cylinder/sphere, each with size/position/colour) and/or start
from an uploaded GLB scaled into a custom variant, with a live R3F preview, then
export via GLTFExporter → `persistUserGlb` so it lands in the catalog like any upload.
Pure `editSpec.ts` (tested) + `buildObject.ts` + `saveAsset.ts` + dialog. v2: per-mesh
recolour/hide of a source GLB.

## [C46] Cabinet handle styles (bar / knob / handleless)
Cabinets gain a **Handles** option: `buildCabinet` now reports a `handleStyle` and
omits handle parts when `'none'`; the renderer draws a round knob (cylinder) vs the
bar (box). Model tested (+3); screenshot-verified across all three styles.

## [C45] Extract the array-row math into a tested pure module
The inspector's "Duplicate a row" did its rotation/offset math inline; extracted it
to a pure, unit-tested `furniture/arrayPlacement.ts` (`arrayOffsets` — rotation-aware
linear array, 5 tests) and refactored `duplicateRow` to use it. Same behaviour
(screenshot-verified: 4 evenly-spaced chairs), less duplication, now test-backed.

## [C44] K1b — "Kitchen run" set + wall-cabinet mount fix
Added a one-click **Kitchen run** set (base sink · hob · drawers + wall uppers + tall
pantry) assembling the cabinet engine into a kitchen. Also fixed a C38 bug: the
parametric **wall (upper) cabinet rendered on the floor** — it now lifts to its
`mountHeight` (default 1.45 m, new inspector field). Screenshot-verified.

## [C43] K1b — hob/cooktop worktop fitting
Generalised the base cabinet's `sinkCutout` to a typed `worktopCutout`
(`kind: 'sink' | 'hob'`) and added a **hob** option: same worktop-frame cut, with
the renderer dropping a black glass-ceramic panel + four burner rings into it. One
**Worktop** select (Plain / Sink / Hob). Model tested (16); screenshot-verified.

## [C42] K1b — sink basin in the base cabinet
The parametric base cabinet gains a **Sink** option: `buildCabinet` cuts the worktop
into a 4-strip frame around a centred opening and exposes a `sinkCutout`; the renderer
drops a recessed stainless basin + faucet into it. Pure model tested (+4 cases);
screenshot-verified. Coohom-parity kitchen sink unit.

## [C41] B34 — plan-aware sun-shadow frustum
`Lighting.tsx` no longer hardcodes the apartment-centred shadow box; new pure tested
`scene/lighting/shadowFrustum.ts` fits the ortho frustum centre + half-extent to the
**active floor plan** (walls + rooms, offset-aware, clamped 9.5–40 m), so shadows reach
a large or origin-offset custom plan instead of being aimed at empty space. Default flat
unchanged (verified at Medium tier).

## [C40] Modularize CLAUDE.md (entry point + ARCHITECTURE + path-scoped rules)
Split the 1000-line CLAUDE.md: root `CLAUDE.md` is now a lean ≤60-line entry point
(hard rules + conventions + pointers); the full code map moved to `docs/ARCHITECTURE.md`;
and each major `src/` area (state/furniture/scene/ui/materials) gets its own path-scoped
`CLAUDE.md` that loads only when working there. README pointers updated.

## [C39] Q31 (part 1) — drag a finish onto a furniture item
Finish-picker swatches are now draggable; dropping one onto a piece in the
Objects (Layers) list applies that finish (dashed drop-highlight + toast). New
pure, tested `materials/finishDrop.ts` (payload encode/decode + `resolveFinishDrop`
routing floor/wall/item) is the shared core for the 3D-surface drop next.

## [C38] K1 — parametric cabinet engine (base / wall / tall)
New `furniture/cabinet/` engine: pure, unit-tested `buildCabinet` geometry model
(toe-kick / carcass / countertop / cornice / slab·shaker·drawers·glass·open
fronts, mm-customisable W/H/D + columns) + `CabinetModule` primitives and three
catalog entries (Base / Wall upper / Tall pantry). Coohom-parity modular kitchen.

## [C37] Copy finishes to a specific room
The room-editor Finish picker gains a "Copy finishes to…" dropdown beside the
"Apply to all rooms" buttons — copies this room's floor + wall finish to one
chosen room (undoable, with a confirmation toast), complementing the
apply-to-every-room actions. Mirrors the existing "Copy layout to…" select.

## [C36] Clear-room toast + production-build/suite gate
"Clear room" now shows a "Cleared N items" toast (consistent with the other room
actions). Also ran the full commercial-readiness gate: production build clean
(1179 modules) + 1012 tests pass — no regressions across the run's new modules.

## [C35] Confirmation toasts for "Apply finish to all rooms"
The Apply-floor/walls-to-all-rooms buttons applied silently; they now show a
success toast so the bulk action is confirmed. DOM-verified.

## [C34] "Room layout" subheading in the FinishPicker
Grouped the growing room-action cluster (Tidy / Mirror / Copy layout / Swap
layout / Clear) under a "Room layout" subheading, separating it from the
finish-apply actions for scannability. DOM-verified.

## [C33] Accessible names for the budget HUD + favourites/recent chips
The budget HUD button now has a descriptive `aria-label` (spend/target, was
title-only) and the Favourites/Recent catalog chips announce their counts
(badges were visual-only). Small a11y/commercial-readiness pass. DOM-verified.

## [C8] Swap two rooms' layouts
New `layout/swapRooms` (pure, 3 tests) + a "Swap layout with…" picker in the
FinishPicker exchanges two rooms' unlocked furniture (centre-delta translation);
all-or-nothing with a clear "doesn't fit" notice if room sizes differ too much.
Verified: bedroom2↔bedroom3 counts exchanged (8↔9).

## [C32] Consistent chip counts on Favourites/Recent + full-suite gate
Favourites/Recent catalog chips now use the same `.chip-count` styling as the
category chips (Recent gained its count). Also ran the periodic full gate:
1009 tests pass, tsc + lint clean — no regressions. DOM-verified.

## [C31] "B" keyboard shortcut to toggle the Budget panel
Added `B` (orbit views, not while typing, gated on the `budget` feature flag) to
toggle the Budget/shopping panel — quick access to the now-rich spend view.
Registered in KEYBINDINGS + Help modal + keyboard-shortcuts doc. DOM-verified.

## [C30] Item counts in "Spend by room" + Budget panel visual review
Extended `spendByRoom` to carry per-room item counts (test updated) and surfaced
them in the breakdown (e.g. "Living / Dining · 21 · 31%"), matching the category
rows. Also reviewed the full Budget panel — cohesive, no layout issues. Verified.

## [C29] Item count in the Budget "Spend by category" rows
Each category row now shows its item count alongside the % and amount (e.g.
"Appliances · 9 · 26%"), matching the catalog chip counts. DOM-verified.

## [C28] Extract tested buildShoppingGroups helper
Moved the Budget panel's inline category-grouping + total/count computation into a
pure `furniture/shoppingGroups` (`buildShoppingGroups`, `Line`/`ShoppingGroup`),
now unit-tested (grouping, totals, unknown-def skip). BudgetPanel consumes it;
behaviour unchanged. +3 tests; modular.

## [C27] Fix a wrong assertion in angle.test (full-suite gate)
A full `vitest run` + production build pass caught a failing assertion shipped in
C9: `nearestRightAngle(2.0)` correctly snaps to π/2 (nearer than π), but the test
expected π. Fixed the expectation + added a 2.5→π case. Suite now 1006 green;
build clean. (Lesson: confirm the pass *count*, not just that tests ran.)

## [C26] Esc clears/blurs the catalog search
Pressing Esc in the catalog search now clears a non-empty query (keeping focus to
keep typing) or blurs the field when already empty — a quick exit, pairing with
the `/` focus shortcut. DOM-verified ("sofa" → cleared).

## [C25] Extract spendByRoom helper (tested)
Moved the Budget panel's inline per-room spend grouping into a pure
`furniture/spendByRoom` (pointInRoom + itemPrice, "Outside rooms" bucket), now
unit-tested. BudgetPanel consumes it; behaviour unchanged. +2 tests; modular.

## [C24] Heartbeat hardening + theme-metadata guard test
Fixed the autonomous heartbeat: the prior Monitor had hit its 30-min cap and
stopped delivering beats. Re-armed fresh (4-min beat) with a **re-arm-FIRST**
policy so each activation resets the window before doing work (a mid-cycle
failure can't strand it). Added `appearanceSlice` tests asserting every
THEME_NAME has complete metadata (guards half-added themes). 3 tests.

## [C23] Themes user-doc + verify Harbour in the Appearance picker
Updated the themes-and-appearance guide page to list Harbour (5 themes). Verified
the Appearance popover renders all five cards with correct swatches (Harbour =
blue). Closes out C22's UI surface.

## [C22] New "Harbour" theme (cool marina blue)
A 5th theme — estate's exact lightness/chroma hue-shifted to a slate-blue neutral
+ teal-blue accent (so contrast is preserved), light + dark. Registered in
`appearanceSlice` (auto-listed in the Appearance picker). Screenshot-verified L+D;
docs updated (5 themes / 10 palettes).

## [C21] Budget-target quick-set chips
When no budget target is set, the Budget panel shows one-tap $10k/$25k/$50k/$100k
chips so users can start tracking spend instantly (the number field stays for
custom values). DOM-verified.

## [DOCS2] User-guide coverage for the run's features
Documented in the VitePress user guide: budget HUD + per-room/category spend +
budget-in-report (design-tools), Mirror room / Copy layout / per-room lock /
collapse-all (room-editor), and Quick finishes + Apply-finish-to-all (finishes).

## [C20] Price-aware catalog empty state + production-build check
A Max-$ filter that hides every card now shows "Nothing under $N here — raise the
Max $ filter." instead of the misleading "No items in this category yet." Also
verified `npm run build` succeeds with all the run's new modules. DOM-verified.

## [C19] Expand/Collapse-all rooms in the Layers panel
Added a footer toggle (shown with 2+ rooms, not while filtering) that collapses
or expands every room group at once — handy for navigating large designs. Reuses
the existing per-group collapse state. DOM-verified.

## [C6] Category item counts on the catalog chips + visual review
Each catalog category chip now shows its item count (e.g. "Seating 11") — subtle,
tabular. Also did a holistic visual regression review (overview + room-editor
inspector) after the run's UI changes: no artifacts/regressions found.

## [C18] Fix: remove duplicate "/" handler from C17 (it already existed)
C17 wrongly added a second `/` handler — App already had one (my earlier grep
excluded App.tsx). Removed the duplicate and folded the one improvement
(force the Catalog tab, not Layers) into the original. Verified: `/` from Layers
switches to Catalog + focuses search.

## [C17] Implement the "/" focus-catalog-search shortcut
The Help modal advertised "Search catalog · /" but no handler existed. Added it
to the global key handler: in the room editor (not while typing), `/` opens the
catalog and focuses its search box. DOM-verified (catalog opens + search focused).

## [C16] Consolidate item-cost math into one tested helper
New `furniture/itemsCost` (sum a set of items' prices, variant-aware) is now the
single source of truth used by the budget HUD, the inspector selection total, and
the room caption (was duplicated three ways). +1 test (3); modular + DRY.

## [C15] Room cost in the per-room editor caption
The room caption now appends the room's estimated furniture cost (e.g. "… · 21
items · ~$6,760"), so spend is visible while editing a room — consistent with the
inspector price + budget HUD + per-room spend. Screenshot-verified.

## [C14] Budget target + over/under in the printable report
`buildReportHtml` now renders the budget target and how far over/under the
estimated total is (when a target is set), beside the existing total + per-m² +
cost-by-room. Threaded from the live store via `openReport`. +1 test (14 total).

## [BUGFIX] BudgetHud no longer floats over the 2D floor-plan editor
The budget pill rendered whenever the orbit camera was active — including the
full-screen floor-plan editor (which hides the rest of the chrome). Now also
gated on `!floorPlanEditing`. DOM-verified (shown in overview, hidden in editor).

## [C13] Budget HUD opens the Shopping panel on click
The always-on budget pill is now a button (was `pointer-events:none`) — tapping
it opens the Budget/Shopping panel for the full breakdown, with a hover affordance.
DOM-verified (click → budgetOpen).

## [C12] Per-room lock toggle in the Layers panel
New `itemsSlice.setItemsLocked(ids, locked)` (one history step) + a lock/unlock
icon in each Layers room-group header (beside the per-room eye), so you can
protect a finished room in one tap. DOM-verified (locks the room's 10 items).

## [C11] Show price on catalog cards
Each catalog card now appends its estimated price (`itemPrice`) after the
dimensions (accent-styled), so the new Price sort + Max-$ filter are visible at a
glance while browsing. Screenshot-verified.

## [C10] Catalog "Price (low→high)" sort
Added a price sort to the catalog browse `SortKey` (`catalogBrowse` `cardPrice`
via `itemPrice`; free CC0 entries lead). UI picks it up automatically; prefs
validation + persistence updated. +1 test (8 total); DOM-verified.

## [DOCS] Sync CLAUDE.md + README with this run's features
Documented the inspector price/selection-total/Quick-finishes/Apply-finish-to-all/
Straighten, the Budget "Spend by room" + always-on budget HUD, and the
Finish-picker Mirror-room / Copy-layout-to actions, so the architecture index +
README match the shipped code.

## [C9] "Straighten" — snap a freely-rotated item to 90°
New `layout/angle` (pure `nearestRightAngle`/`isOffSquare`, 4 tests) + an inspector
"Straighten" button shown only when an item is off a right angle (the gizmo allows
free angles with Shift); one tap squares it, collision-checked. Verified
(0.40→0.00 rad).

## [C7] Copy a room's layout to another room
New `layout/cloneRoom` (pure, 2 tests) + a "Copy layout to…" picker in the
FinishPicker clones a room's unlocked furniture into another room (translated by
the room-centre delta, fresh ids, groups remapped), skipping any clone that
won't fit. Great for repeated bedrooms. Verified (66→73 items, toast).

## [HEALTH] Reliability pass + BudgetHud mobile safe-area
Full suite green (991 passed / 2 skipped), tsc + lint clean across all recent
changes — no regressions. Polished the new BudgetHud to clear the iOS home
indicator on mobile (`env(safe-area-inset-bottom)`).

## [C2] Always-on budget progress HUD
New `ui/BudgetHud` — a bottom-centre pill (shown only once a budget target is set,
orbit views only) with spend / target + over/under bar, so you stay on budget
while arranging without opening the Budget panel. Screenshot-verified.

## [C4] Per-room spend breakdown in the Budget panel
Added a "Spend by room" bar list (estimate-based, `pointInRoom` + `itemPrice`)
beside the existing "Spend by category", so you can see which room the budget
goes into. Additive; screenshot-verified.

## [C3] Mirror room layout
New `layout/mirrorRoom` (pure `mirrorItemX`/`mirrorRoomItems`) + a "Mirror room"
button in the FinishPicker reflects a room's unlocked furniture left↔right across
its centre (position + heading + flipX), skipping any item whose mirror would hit
a wall/neighbour. 4 unit tests; screenshot-verified ("Mirrored 17 items").

## [QOL-total] Selection total cost in the multi-select inspector
The multi-select panel header now appends "~$N total" (sum of `itemPrice` over
the selection) beside the count, so selecting a group/marquee shows its combined
estimated cost. Screenshot-verified; tsc + biome green.

## [QOL-price] Per-item price estimate in the inspector header
The inspector now shows an item's estimated price (`itemPrice`, IKEA variant-
aware) under its dimensions, so cost is visible while designing — not only in the
Budget panel. Hidden when minimized. Screenshot-verified.

## [QOL-styleall] Surface "Apply finish to all of this type" in the inspector
The existing `applyStyleToAll` (copy an item's finish/colour/material to every
same-def piece) was right-click-only — now also a one-tap inspector button
(shown when 2+ of the type exist), reachable on touch where right-click is a
long-press. Screenshot-verified; reuses the tested store action.

## [RE-bound3] Wall-bound keyboard nudge + inspector numeric edits
The arrow-key nudge, paste, and single/group rotate (App) plus the inspector's
numeric move/rotate + duplicate/duplicate-row (which previously called canPlace
with NO walls) now all pass `placementWalls`, so no edit path can push furniture
through a wall — consistent with drag/ghost/rotate. tsc + 44 tests + biome green.

## [RE-bound2] Centralize placement-wall selection (new-item + rotate too)
New `collision/placementWalls` picks the room's solid perimeter inside the editor
(else plan/flat walls); DragController, PlacementGhost (new-item drop) and
RotateGizmo now all route through it, so dropping a fresh catalog item or
rotating a piece can't cross the room walls either. +1 test module; suites green.

## [RE-bound] Bound furniture to room walls in the per-room editor
New `collision/roomEditorWalls.roomEditorPlacementWalls` builds the edited room's
*solid* perimeter (openings treated solid); DragController uses it for both
collision-validity and wall-snap while the room editor is active, so a piece
can't be dragged/dropped past the room's walls into adjacent rooms (default flat
+ custom plans). 3 new tests; collision suite green.

## [T1] Curated one-tap furniture finishes
New `inspector/QuickFinishes` adds a swatch row (oak/walnut/teak/ash/ebony/
marble — bundled procedural, ships in prod) under a furniture piece's wood/
surface finish dropdown, so common finishes are one tap instead of a dropdown
scroll or remote-catalog browse. Encoded as `mat:<id>`. Screenshot-verified.

## [F12a] 3D door leaf for custom-plan doors
New `apartment/PlanDoorLeaf` renders a swinging, clickable, panelled leaf in each
custom-plan door opening (was a plain gap even when closed). Hinge/swing honour
the opening; click toggles via the shared `doors` store so render + walk
collision stay in sync; fades with its wall like `FadeWall`. Screenshot-verified.

## [FG3e] Feature flags — gate packs / online materials / model upload
Catalog Packs tab + model-upload entry now respect `packs`/`modelUpload`; the
FinishPicker "Browse" (online materials) respects `remoteMaterials` — so a
disabled source hides everywhere, not just via dev-gating. tsc + suite green.

## [FG3d] Feature flags — gate mobile-toolbar items
MobileToolbar accordion items now respect their flags (savedViews, floorPlan,
lightingMoods, backdrops, smartStart, budget, checks, measure, history,
versions, share, sunStudy, walkthrough, report) — parity with desktop / ⌘K.
tsc + 38 feature/toolbar tests + lint green.

## [UX1] Toolbar/tour/inspector UX overhaul + room-entry confirm
Combined Camera+View menu; new Edit menu group (edit-room/floor-plan); Graphics
moved to right cluster; redesigned Scene menu (slider checkpoints + lighting
segment + backdrop dropdown); compact Arrange pick→Apply; interactive product
tour (click-through spotlight, only Skip ends it); minimizable + auto-minimizing
inspector; viewport-fit Top/Reset view; "Enter <room>?" confirm on floor-click;
square mobile room-editor logo. tsc + 981 tests + lint green; screenshot-verified.

## [FG3c] Feature flags — gate AI sections + Scene/View menus
Share modal's AI photoreal (aiPhotoreal), floor-plan AI walls (aiWalls), Scene
lighting-moods (lightingMoods) + backdrops (backdrops), View saved-views
(savedViews) now hide when their flag is off. tsc + suite green.

## [FG3b] Feature flags — gate the ⌘K command palette
`COMMAND_FLAGS` map filters palette commands (measure/smart-start/budget/
clearance/versions/history/share/report/floorplan + saved-views) by flag, so a
disabled feature can't be launched from ⌘K either. DOM-probe verified (toggling
`report` removes exactly its command).

## [FG4] Feature flags — dev/admin flags panel (4/4)
`ui/FlagsPanel` lists every flag with a toggle + reset (dev build or signed-in
admin only); opened from the login screen's admin view. Screenshot-verified.

## [FG3a] Feature flags — gate Tools + Arrange menu entries (3a/4)
`useFeature` gates each Tools-menu item (budget/checks/measure/history/versions/
share/sunStudy/walkthrough/report) + Arrange's Smart Start & Floor plan. Hidden
when off. (Menu-open screenshot not captured — portaled-dropdown harness friction;
logic is a trivial conditional over the 16-test flag slice.) ⌘K/mobile next.

## [A3] Accounts — admin unlocks dev-only features (3/3)
`resolveFlags` gains an `isAdmin` param: a signed-in admin (even in a prod build)
unlocks `devOnly` flags + can override; sign-in/out + boot re-resolve the flag
map. Auth feature complete. 3 new tests.

## [A2] Accounts — full login screen + `#/login` route (2/3)
`ui/auth/LoginScreen` (themed full-screen sign-in: password, error, signed-in
state + sign out), opened via `#/login` or a Help "Sign in" entry; `loginOpen`
UI flag. Screenshot-verified. Admin gating next.

## [A1] Accounts — AuthProvider abstraction + admin session (1/3)
`features/auth/` (AuthProvider interface + client-side LocalAdminProvider) +
`authSlice` (signIn/signOut, persisted session, currentUser/role). Architected
for future real user accounts. Client-side gate ≠ security (documented). 9 tests.

## [PS3] Plan sharing — "Copy plan link" in the Share modal (3/n)
Replaced the old can't-carry-the-design "App link" with a real design-bearing
**Copy plan link** (encodes the whole design into a `#/plans/<code>` URL). Share
modal screenshot-verified.

## [PS2] Plan sharing — hash routing + load-on-boot (2/n)
`#/plans/<code>` links: `parsePlanRoute`/`planShareHash`/`buildPlanShareUrl` +
a boot step that decodes + loads a shared design (overriding the seed), then
clears the hash. 5 tests incl. an end-to-end load. Share UI next.

## [PS1] Plan sharing — backend-less encode/decode core (1/n)
`features/planShare.ts`: deflate (fflate) + base64url-encode a design into a
self-contained code for `#/plans/<code>` links (loads on any instance, no
server). Schema-validated/migrated decode. 6 tests incl. a live round-trip.
Routing + load-on-boot + share UI next.

## [FG2] Feature flags — reactive store slice + useFeature hook (2/4)
`featureFlagsSlice` mirrors the resolved flags reactively (seeded at boot, kept
in sync with the `isFeatureEnabled` snapshot); `setFeatureFlag`/`resetFeatureFlags`
are dev-only. `useFeature(flag)` hook for components. 3 tests.

## [FG1] Feature-flag core — central registry + resolver (1/4)
`features/featureFlags.ts`: a single-source registry (21 flags w/ prod defaults +
`devOnly`), pure `resolveFlags` (prod locked to registry, dev/QA overrides via
localStorage + `?ff=` URL param), `isFeatureEnabled`. 7 tests. UI/wiring next.

## [F25] Room areas labelled on the report's plan diagram
Each room on the plan now shows its name + area (e.g. "Living / Dining · 24.3
m²") so the plan reads standalone, like an architectural drawing. Test +
standalone render verified.

## [F24] Flooring schedule in the report (area per finish)
`floorAreaByFinish` sums floor area per finish across non-external rooms; the
report shows a "Flooring schedule" (finish + swatch + m²) — the procurement
"how much to order" view. 3 tests + standalone render verified.

## [F23] Colour swatches in the report's "Finishes by room" table
Each floor/wall finish now shows a colour chip beside its name (custom colour →
itself, builtin → its swatch, unknown → none) so the table reads at a glance like
the palette. Test + standalone render verified.

## [F22] Room W×D dimensions in the report's rooms table
Rectangular rooms now list their width × depth alongside the area (a room-schedule
detail); L-shape/polygon rooms show area only (a bbox would mislead). Test +
standalone render verified.

## [R15] Extract + test the share summary (DRY cost, fix "1 items")
Pulled ShareModal's inline one-liner into a pure `buildShareSummary` reusing
`reportData.lineEach` (cost now matches the report exactly) + pluralised the
item count. 3 unit tests.

## [R14] Unify "editable rooms" enumeration (5 call sites → 1 helper)
Added `editableRooms`/`firstEditableRoomId` to `state/rooms.ts`; refactored the
desktop+mobile toolbars, RoomSwitcher, CommandPalette (×2) and Onboarding off
their duplicated `isDefaultPlan ? ROOMS : plan.rooms` branches. 7 tests.

## [B44] "Apply finish to every room" works on custom plans
`setAllFloorFinish`/`setAllWallFinish` iterated the fixed `ROOMS` table, so on a
custom plan they applied to non-existent rooms and left the real ones unchanged.
Now iterate the active plan's rooms (skipping default external ledges). Test added.

## [B43] Custom-plan per-room finishes now persist across reload
`applySerialized` filtered finish keys against the fixed `ROOMS` table, so a
custom plan's floor/wall finishes (keyed by custom room ids) were stripped on
load/restore/import. Now validated against the loaded plan's rooms. Round-trip test.

## [F21] Version Compare now shows finish changes
Extends Compare beyond furniture: `diffVersionFinishes` lists per-room floor/wall
finish changes (e.g. "Kitchen floor: Oak → Marble"). 5 tests; empty-state now
"Identical to the current design". (Live panel not screenshottable headless.)

## [B42] Floor-plan numeric fields can't push NaN into the geometry
Clearing/partial-typing a PlanInspector field (wall/room/opening dims) fed NaN
into the plan (degenerate room, broken area/render, NaN→null on save). `Num` now
holds raw text while focused and commits only finite values. Render-verified.

## [B41] Wall-accent picker shows the room name on custom plans
Was showing the raw room id (e.g. "studio-main") since it only knew the built-in
`ROOMS` table. Added a shared `roomDisplayName(id, plan)` helper (plan-aware). 3 tests.

## [B40] Per-room finish/tidy/clear works on custom plans
FinishPicker bailed for custom-plan rooms (`ROOMS[id]` undefined) and "Tidy" would
crash (arrangeRoom is RoomId-keyed). Added `arrangePlanRoom` + sourced name/area
from `plan.rooms`, completing RE6's plan-aware editor. 2 tests; 933 green.

## [F20] Explicit prices for 22 under/over-priced budget items
22 builtin items fell back to the category base — wildly off (standing-fan/
drying-rack at the $700 appliance base; piano/fireplace at the $60 decor base).
Added real SGD prices + a coverage test that no builtin silently falls back.

## [F19] Search synonyms for 40 catalog items
Added keyword aliases to builtin defs (stove→oven/hob, aircon→air conditioner,
nightstand→bedside table, rug→carpet, tv→television…) so common alternate terms
find the right item. 14-case test through the real fuzzy search.

## [F18] Name-based room-kind for custom-plan auto-arrange
`roomKindFromName` classifies a custom room by its name (kitchen/bath/bedroom/
living), so "Tidy" routes named kitchens+baths to the work-triangle/fixtures
arrangers — item-inference only knew bed/seating. 12 tests.

## [F17] Door/window width labels in the 2D editor
The "Dims" toggle now also labels each opening's width (accent-coloured, placed
clear of a door's swing arc), not just wall lengths. Visually verified.

## [F16] Print/PDF page-break control in the report
`break-inside: avoid` on report sections/tables/chips (+ `break-after: avoid` on
headings) so "save as PDF" no longer splits a section mid-page. 1 test; PDF-verified.

## [R13] Polygon/L-shape-aware room label placement (shared helper)
Extracted `floorplan/roomCentroid.ts` `roomLabelPoint` (polygon area centroid /
larger-rect of an L / rect centre), used by minimap + editor + report so labels
sit inside non-rectangular rooms instead of the bbox centre. 4 tests.

## [F15] Clearance & fit section in the printable report
Surfaces `blockedDoorItems` as a report section: lists furniture sitting in a
doorway path (grouped + counted) or confirms all doorways clear. 3 unit tests.

## [F14] Door swing arcs + window breaks in the report plan
`openingsSvg` cuts each opening (white gap) + draws door leaf/swing-arc (shared
`doorSwingGeometry`) and window pane lines, so the report plan reads architecturally.

## [F13] Auto-orient a new door to swing into the room it serves
`defaultDoorSwing` probes both wall sides; the editor's door-drop opens into the
served room (convention), still flippable in the inspector. 4 unit tests.

## [F12] Editable door swing direction + hinge placement (custom plans)
Added `hinge`/`swing` to `PlanOpening` + pure `doorSwing.ts` helper; inspector
controls, 2D arc redraw, side-correct clearance, schema + default-plan seed. 8 tests.

## [R12] Unify the furniture-category colour palette (report + minimap)
Extracted `furniture/categoryColors.ts` (`CATEGORY_COLORS`, all 15 categories),
shared by the report plan/legend + walk minimap (was two drifting maps). Test added.

## [R8] Remove the `noAssignInExpressions` lint errors in `catalog.ts`

`useCatalogByCategory` built its grouped buckets with
`(out[def.category] ??= []).push(def)` four times — a valid pattern but flagged
by Biome's `noAssignInExpressions` (assignment buried inside a method-call
expression, the kind that hides bugs like `if (a = b)`). Extracted a small
`bucket(cat)` helper that lazily creates the category array (still guarding
against an unknown category from an imported def) without an in-expression
assignment — clearer intent, same output. Catalog tests (100) + tsc green; lint
errors for the rule cleared.

## [R10] Clear `scripts/` lint errors + make CI lint blocking

With `src/` clean, three lint **errors** remained in `scripts/`:
`noAssignInExpressions` in `progress.mjs` (the `while ((idx = …) !== -1)`
line-splitter → hoisted the `indexOf` out of the condition), and
`useIterableCallbackReturn` in `optimizePool.mjs` + its test (`.forEach(r => r())`
/ `.forEach(f => pool.submit(f))` returning a value → plain `for…of` loops), plus
an unused `copyFileSync` import in the asset-pipeline integration test. Also
suppressed a `noTemplateCurlyInString` *warning* in `index-assets.test.ts` that's
a false positive (the test asserts the generated code contains that exact
`${import.meta.env.BASE_URL}` literal). With the **entire repo** now at 0 lint
errors (`npm run lint` exits 0), flipped CI's Lint step from
`continue-on-error: true` to **blocking** so regressions can't reland. Scraper +
asset-pipeline tests (15) green.

## [R9] Clear the final lint error — `biome check` now exits 0

Removed the last `noUselessSwitchCase` error in `furnitureMaterials.ts`
(`applianceFinish`): `case 'matte':` fell through to a `default` returning the
same props, so the explicit case was redundant — folded its comment into
`default` (`'matte' and any unknown finish`). With this, **the entire lint
**error** backlog is cleared**: `biome check src/` now exits 0 (only 6
`noExplicitAny` *warnings* remain, all in test files using `any` for mocks — the
rule is intentionally `warn`). This retires the CLAUDE.md caveat that "lint is
reported non-blocking until the ~26-finding backlog clears." Material tests +
tsc green.

## [Q39] Report: itemised furniture-by-room breakdown

The report's by-room section showed only a count + total per room; for this
room-centric app, the room-by-room *itemised* furnishing list is the standard
client/installer handoff ("what goes in the bedroom"). New pure
`reportData.furnitureItemsByRoom` groups each room's pieces by def (+ IKEA
variant) with quantity + line cost, priciest first, with per-room totals that
match `furnitureCostByRoom`. The report's "Cost by room" section is now
"Furniture by room", rendering each room's items indented under a room header
(reusing the category-breakdown table styles). Unit-tested (grouping, totals
match, Unassigned bucket) + the HTML section test updated. 882 tests; tsc + lint clean.

## [D1] Sync the user guide with recent features

The deployed user guide had drifted behind a run of features. Updated it (and
fixed two now-stale instructions): **keyboard-shortcuts** — added cycle-selection
`[`/`]`, previous/next room `,`/`.`, catalog search `/`, and "exit room" on Esc;
**room-editor** — the room dropdown's per-room furniture counts, `,`/`.` room
cycling, the empty-room catalog prompt, and the finish picker's **Clear room**;
**finishes-and-materials** — corrected "in orbit view" → inside the room editor,
documented the finish **search** + **Recently used** row + apply-to-all-rooms;
**design-tools** — described the report's furnished plan + by-room itemization;
**floor-plan-editor** — the new custom-plan **Wall colour** control. Docs build
clean (`docs:build`). No code change.

## [RE6] Wall colour for custom floor plans

Custom-plan walls were a hardcoded off-white with no way to change them (the
built-in apartment has per-room procedural wall finishes; custom plans had
nothing). Added a **plan-wide wall colour**: `FloorPlan.wallColor` (optional,
defaults to `#ede9e2` via `DEFAULT_PLAN_WALL_COLOR`), a colour picker (+ Reset)
in the floor-plan editor's plan inspector (`updateFloorPlanMeta`), and `PlanShell`'s
`FadeWall` paints with it. Caught + fixed a save/load gap in the same change:
`FloorPlanZ` would have stripped the new field, so added `wallColor` to the zod
schema (round-trip unit-tested). Verified in-app: a custom plan's walls render
the chosen colour. (Per-room procedural wall finishes on custom plans remain a
larger future item.) 891 tests; tsc + lint clean.

## [R11] Regression guards for the view/edit core helpers

The view/edit split's two core pure helpers were untested, despite gating
*every* editing interaction + the room switcher/cycle. Added unit tests:
`canEditScene` (true only in the room editor + orbit; false in the overview and
in editor-walk) and `editableRoomIds` (default apartment rooms minus the
external AC ledge; a custom plan's own rooms in order). Cheap insurance against
a silent regression that would break editing or pollute the room switcher. 890
tests; tsc + lint clean.

## [Q44] Cycle rooms with `,` / `.` in the editor

A keyboard speedup for the room-by-room workflow: in the per-room editor, `,`
and `.` jump to the previous / next editable room (wrapping), complementing the
dropdown switcher. Room-editor-only (gated on `canEditScene`), skipped while
typing. Shares a new `editableRoomIds(plan)` helper with the switcher so the
order matches. Listed in Help. Verified: `.` mainBedroom→bedroom2, `,` back; no
effect in the view-only overview. 885 tests; tsc + lint clean.

## [Q43] "Recently used" finishes in the FinishPicker

Re-applying a finish across rooms (e.g. the same wood floor in three bedrooms)
meant re-finding it in the grid each time. The FinishPicker now tracks
recently-applied finish materials (`uiSlice.recentFinishes`, deduped/capped 8,
pushed by the picker on any material selection) and shows a compact **"Recently
used"** swatch row per surface — filtered to the group's category so a recent
floor finish only surfaces under Floor, not Walls. Reuses the `.swatch` chip +
existing material previews. Verified: applying Walnut/Oak-herringbone floors
shows them under Floor only (not Walls). 885 tests; tsc + lint clean.

## [Q42] Report: room area in the Furniture-by-room headers

Each room header in the report's "Furniture by room" section now shows the
room's floor **area** alongside its item count + total — e.g. "Main Bedroom ·
10 items · 15.4 m² … $X" — giving cost-per-space context inline. `RoomItems`
gained an `area` field (via `planRoomArea`; 0 for the Unassigned bucket).
Unit-tested. 885 tests; tsc + lint clean.

## [Q41b] Colour-key the report's furnished plan by category + legend

Built on Q41: the report plan's furniture footprints are now **tinted by
furniture category** (low-opacity, print-friendly, mirroring the walk-minimap
palette) with a compact **legend** beneath the plan listing the categories
present. Makes the furnished plan a properly keyed diagram (tell beds from
seating from storage at a glance). `reportPlanSvg` footprints param became
`{ corners, fill }[]`; `report.ts` maps category → fill (`CATEGORY_FILL`) and
builds the legend from the categories actually placed. Unit-tested (tinted
polygon + legend + category label in the HTML). 885 tests; tsc + lint clean.

## [Q41] Report floor plan now shows the furnished layout

The report's 2D plan diagram drew only walls + room labels. It now also renders
**furniture footprints** (top-down OBB corner polygons, muted architectural fill,
drawn under the walls) so the report plan reads as a furnished layout — "where
everything goes", complementing the itemised by-room list. `reportPlanSvg` takes
an optional precomputed `footprints` array (stays a pure string builder);
`report.ts` derives them via `itemFootprint` + `obbCorners` (guarded against a
malformed def so it can't crash the report) and computes the SVG once.
Unit-tested (polygons present + drawn before walls). 884 tests; tsc + lint clean.

## [Q40] Search box in the FinishPicker

The finish picker lists ~35 built-in finishes plus any uploaded/DLC materials,
which is tedious to scan. Added a **search field** at the top of the swatch view
that filters both the Floor and Wall swatch groups (desktop grid + mobile
dropdown) by material name via a pure `filterFinishes(mats, query)` — consistent
with the catalog's search. Empty query passes everything; the custom-colour tile
+ recent row stay. Verified: typing "marble" narrows both grids to just Marble.
883 tests; tsc + lint clean.

## [B39] Fix onboarding for the view/edit split

The first-run onboarding still assumed the old model: its **"Browse the
catalog"** start choice did `setCatalogOpen(true)` in the view-only overview,
where the catalog no longer mounts — so the choice did nothing visible. It now
dives into a room (first non-external) with the catalog open
(`enterRoomEditor` + `leftMode:'catalog'` + open), so furnishing starts
immediately. Also refreshed the step-2 mini-tour cards (which described
dragging/refinishing in the overview) to lead with **"Edit a room"** then
furnish/refinish *inside* the room. Verified the catalog choice lands in the
editor (room=mainBedroom, catalogOpen, leftMode=catalog). 883 tests; tsc + lint clean.

## [B38] Update the product tour for the view/edit split

The guided tour still described the pre-revamp model: its "layout"/"furniture"
steps spotlighted `[aria-label="Arrange"]` / `[aria-label="Catalog"]` and the
"customise"/"finishes" steps said "click an item / click a wall" — but those are
all **room-editor-only** now, so in the view-only overview (where the tour runs)
the spotlights pointed at nothing and the instructions were wrong. Rewrote the
9 steps to match: layout → **Floor plan**, a new **"Step into a room"** step
spotlighting the **Edit a room** CTA (introducing the editor), then
furniture/customise/finishes as centred in-editor guidance, walk → the **Camera
mode** control, plus Scene + Appearance. Verified all spotlight targets resolve
in the overview (Floor plan, Edit a room, Camera mode, Scene, Appearance) + the
Edit-a-room spotlight renders. 883 tests; tsc + lint clean.

## [B37] shot.mjs: guard the output path (prevents stray junk files)

Follow-up to deleting the committed `--help` PNG: `scripts/shot.mjs` now
validates its first arg and **exits 2 (before launching the browser)** if the
output path is flag-like (starts with `-`) or doesn't end in `.png`, with a
usage hint — so a mistyped/redirected `--help` can no longer silently write a
screenshot to a junk file. Verified: `--help` → error + exit 2 + no file; a
valid `.png` path renders as before (exit 0).

## [B36] Fix finish swatches collapsing to thin strips (root cause)

The desktop FinishPicker grid showed each swatch as a thin vertical strip beside
the name, not a thumbnail tile. Root cause: `.swatch-lg` is rendered on a
`<span>` (inline) with `width: 100%` + `aspect-ratio` — both **ignored on inline
elements**, so the swatch collapsed to content width (with no `.finish-cell`
display rule to blockify it). Added `display: block` so the width + aspect-ratio
apply, and squared the ratio (`1/1`) for proper square thumbnails per the report.
Fixes the desktop grid; the mobile dropdown preview/custom tiles (explicit sizes)
are unaffected. Verified desktop (square Concrete/Oak/Walnut/Marble/… tiles) +
mobile (dropdown + square preview). 883 tests; tsc + lint clean.

## [B35] Mobile Finish picker — dropdown instead of squished swatch strips

On mobile the FinishPicker's 3-column swatch grid squeezed each `aspect-ratio:
1.6/1` thumbnail into a thin strip in the narrow panel. Per the user, the mobile
layout is now a **dropdown** per surface: a proper square **preview** of the
current finish + a `<select>` of all finishes (with provider tags) + the
custom-colour tile, plus the recent-colours row. Desktop keeps the swatch grid
unchanged (extracted a shared `RecentColors` row used by both). Gated on
`useIsMobile()`. Verified: mobile shows Floor/Walls dropdowns with square
previews (no strips); desktop grid unchanged. 880 tests; tsc + lint clean.

## [Q38] Room switcher shows per-room furniture counts

The per-room editor's room dropdown (desktop + mobile) now shows a furniture
count per room — e.g. "Main Bedroom (10)", "Living / Dining (21)", "Corridor
(0)" — so you can see furnishing progress and spot empty rooms at a glance while
working room-by-room. Extracted a shared `toolbar/RoomSwitcher` that subscribes
to `items` **locally** (counts via the polygon/extension-aware `pointInRoom`) so
the parent toolbars don't re-render on every edit — it's just a tiny `<select>`
(keeps the P2a perf posture). Used in both `Toolbar` and `MobileToolbar`
(removing their inline selects + now-unused `roomEditorRoomId` reads). Verified
the option labels carry live counts. 880 tests; tsc + lint clean.

## [Q37] Empty-room hint in the per-room editor

Now that the room editor is the furnishing surface, an empty room (a fresh
custom-plan room, or one just cleared via Q35) gave no cue what to do. Added
`ui/EmptyRoomHint` — a centred card ("This room is empty · Add furniture from the
catalog…") with an **Open catalog** accent button, shown only when the room
editor is active (orbit), the room has zero items (`pointInRoom`), and the
catalog isn't already open. Pure DOM overlay; only the button is interactive so
it never blocks orbiting. Verified all states (furnished → hidden, empty →
shown, catalog open → hidden) + a clean render over the empty Main Bedroom. 880
tests; tsc + lint clean.

## [Q36] Cross-room paste lands in the room you're editing

`pasteClipboard` always anchored the paste near the **copied item's original
position**, so "copy in room A → switch to room B → paste" dropped the new item
back in room A — off-screen in the room-B editor (effectively lost). Now, when
the room editor is active and the clipboard's source falls **outside** the
current room, the paste anchors to that room's centre (then spiral-searches for
a free spot) so it lands where you're looking. Same-room paste / duplicate is
unchanged (source is inside ⇒ near-source as before). Verified: a clipboard
sourced at bedroom3 `[7.5, 2.0]` pasted into the main-bedroom editor landed at
`[1.93, 2.60]`, inside the main bedroom. 880 tests; tsc + lint clean.

## [Q35] "Clear this room" action in the FinishPicker

Added a per-room **Clear room (N)** button beside "Tidy up room" in the
FinishPicker (the room panel opened by clicking a floor in the editor). It
removes every **unlocked** item whose centre is in the room — the same
`pointInRoom` set the VE2 caption counts — behind a themed danger
`confirmAction`, and is undoable (`pushHistory`). Only shown when the room has
items. Useful for restarting a room's design. Verified end-to-end via the
confirm modal: 66 → 56 items (the main bedroom's 10 unlocked pieces removed).
Default-apartment rooms (FinishPicker's existing scope). 880 tests; tsc + lint clean.

## [VE5] Close the ⌘K placement bypass of the view-only overview

The Command Palette's "Add furniture" commands armed placement
(`setActiveDefId`) from anywhere — so you could place furniture in the
**view-only overview** via ⌘K, bypassing the room-editor-only rule. Two fixes:
the add-furniture commands now **dive into a room first** when invoked outside
the editor (first non-external room, mirroring the "Edit a room" command), then
arm; and `PlacementGhost` is gated on `canEditScene`, so no ghost renders in the
overview and the commit handler reads a null `ghostWorld` and swallows the click
(defence covering every arm path). Verified: arming placement in the overview
leaves `ghostWorld` null (no commit possible); the gate is a no-op inside the
editor (placement behaves exactly as before). 880 tests; tsc + lint clean.

## [VE4] Fix the global keyboard shortcuts for the view/edit split

Three shortcuts in the global key handler still gated on the pre-revamp model
and broke after VE1:
- **Ctrl/⌘+A** (select all) fired in the *view-only overview* (where selection
  isn't rendered or editable) and was *blocked in the room editor* — backwards.
- **`[` / `]`** (cycle selection) cycled through **all** items in both the
  overview and editor, rather than the room's.
- **`/`** (focus catalog search) opened the catalog from the overview, where it
  no longer mounts (no-op).

All three are now gated on `canEditScene` (room editor + orbit) and select/cycle
only the **current room's** items via a new `roomScopedItemIds` helper (the same
set the editor renders + the VE2 caption counts). Verified: overview Ctrl+A
selects 0; room-editor Ctrl+A selects exactly the room's items (10/66 for the
main bedroom). 880 tests; tsc + lint clean.

## [VE3] Click-a-room-to-edit + hover affordance on custom plans too

VE1/VE1c wired "click a room's floor to enter its editor" and the hover
highlight only for the **default apartment** (`RoomFloor`); on a custom floor
plan the only way in was the toolbar CTA. Closed the gap: `PlanRoomFloor` now
takes a `roomId` and carries the same overview click-to-enter + pointer-cursor
hover (`useOverviewRoomEntry`), threaded from `PlanShell` (main rect, polygon,
and L-extension floors). Generalized `RoomHoverHighlight` to read
`floorPlan.rooms` and triangulate the room outline via `roomPolygon` (rect /
L-extension / free-polygon — one path), so it highlights any plan's rooms; now
mounted unconditionally (was default-plan-only). Verified the highlight renders
on both the default apartment (regression) and a custom oneBed template; 880
tests; tsc + lint clean.

## [VE2] Show the furniture count in the room-editor caption

The room-editor caption (name · size · area) now also shows **how many pieces
are in the room** — e.g. "Main Bedroom · 2.85 × 3.40 m · 15.4 m² · 10 items" —
so you can see at a glance how furnished it is. Counted with the polygon/
extension-aware `pointInRoom`, so it matches the room's true footprint (and the
set of items the editor actually renders, incl. L-shape extensions). Mobile
shows it after the size (name is in the bar). Caption + measurement tests green.

## [VE1d] Make "Edit a room" a prominent accent CTA in the overview

The overview is now view-only, so entering a room to edit is its headline
action — but it was a plain icon button indistinguishable from the rest. Gave
`IconButton` optional `showLabel` (render the label inline, not just as the
tooltip) and `cta` (filled-accent `.tool-btn.cta` styling — `--accent` /
`--on-accent`, themed light+dark) props, and applied both to the overview's
**Edit a room** button so it reads as a filled orange pill with a visible label.
Added `white-space: nowrap` to `.tool-btn .cap` so the 3-word label stays on one
line. Verified the CTA renders distinctly in the toolbar; 880 tests; tsc + lint clean.

## [VE1c] Room-floor hover affordance in the overview ("click to edit")

The new "click a room's floor to edit it" entry (VE1) had no visual cue, so it
wasn't discoverable. Added a hover affordance in the **view-only orbit
overview**: hovering a room floor shows a **pointer cursor** + a soft blue
highlight over that room's footprint, signalling it's a click target. New
`selectionSlice.hoveredRoomId` (+ `setHoveredRoom`), set by `RoomFloor`'s
pointer-over only in the overview (never in the editor/walk); a new
`apartment/floor/RoomHoverHighlight` overlay (mounted in the main scene,
default-apartment plan only — matching where floor-click entry applies) renders
the tint over `roomRects`. A cleanup effect resets the cursor if the overview
unmounts mid-hover (e.g. entering the editor). Verified the highlight renders
over the hovered room and is gated off in the editor; 880 tests; tsc + lint clean.

## [VE1b] Guard the room editor against an unknown/stale room id

Follow-up to VE1: `getRoomEditorShell` documented "returns null for a stale id"
but the default-apartment branch called `roomShell(id)` unconditionally, which
reads `ROOMS[id].origin` and **threw** on an unknown id (crashing the editor
scene into the error boundary). Added the missing `ROOMS[id]` existence check so
it returns `null` (the scene then renders nothing) like the custom-plan branch
already did. Not reachable from the UI today (every entry point passes a valid
id), but removes the latent crash. New `roomEditorShell.test.ts` (valid room
resolves; `'living'`/unknown ids return null, don't throw).

## [VE1] View/edit split — orbit & walk are view-only, editing is room-editor-only

Reworked the core interaction model per request. **Orbit-over-the-whole-flat and
walk are now strictly view-only** (camera rotate/zoom/pan/tilt + first-person
movement); **all** selection, picking, dragging, rotating, context-menu,
placement and floor/wall finishing happen **only inside the per-room editor**.
The old select-vs-rotate **tool toggle is gone** (`editorTool` removed end-to-end).

- **One rule, one helper**: `state/editing.ts` `canEditScene(s) =
  s.roomEditor.active && s.cameraMode === 'orbit'` now gates every interaction —
  `Furniture` (click/drag/hover/double-click/context-menu), `MarqueeSelector`,
  `RotateGizmo` visibility, `GridOverlay`, wall-face + floor clicks, and the
  editing keyboard shortcuts + arrow-nudge in `App` (undo/redo included, per
  request). View/navigation keys (V/O/H/T/M, door interact) still work anywhere.
- **Camera vs. drag**: with no "select mode" to freeze the camera, `OrbitCamera`
  now disables OrbitControls only *during* an item drag or a gizmo gesture
  (`draggingItemId` / new `placementSlice.rotatingGizmo`), so click-drag on
  furniture moves it while click-drag on empty space orbits — both coexist in the
  editor.
- **Entering edit**: a prominent **Edit a room** toolbar button (desktop + mobile
  View accordion), **and clicking a room's floor** in the overview dives into that
  room's editor (navigation, not picking). Leaving the editor clears the
  selection so no stale Inspector lingers in the view-only overview.
- **Toolbars** (desktop `Toolbar` + `MobileToolbar`): three states — **overview**
  (View, Edit-a-room, Floor plan, analysis Tools, graphics/lights/file),
  **room editor** (exit + room switcher, undo/redo, snap/grid, Measure, Catalog,
  Arrange, graphics, file), **walk** (camera + Scene only). The Catalog drawer is
  gated to the room editor too. The 2D floor-plan editor is **unchanged** and
  stays reachable from the overview.

Verified on desktop + mobile (390px): overview is view-only with the catalog
hidden even when forced open; clicking a room / the Edit button opens the editor
with the full editing toolbar + catalog + isolated 3D room; the mobile sheet
shows Edit/Design/Arrange only inside the editor. 878 tests green (toolbar test
updated to the new model); tsc + lint clean.

## [P-aux] Stop closed aux panels doing per-edit work

The `ClearancePanel` and `HistoryPanel` stay mounted (so they can animate
in/out), but their heavy computation sat *above* the `if (!open) return null`
guard, so it ran on **every** render. Because both subscribe to `items`, every
furniture drag re-ran them even with the panel closed:
- **ClearancePanel** called `useCatalog()` (an O(catalog) merge) **and**
  `blockedDoorItems` (O(items·doors) door-swing geometry) per render. Now it
  subscribes to the catalog *inputs* and builds the merged catalog + runs the
  check inside a single `useMemo` gated on `open` — closed ⇒ zero work; open ⇒
  identical result (verified: "2 blocking / 64 clear" with correct item names).
- **HistoryPanel** (added this session) built the full timeline + merged catalog
  in a memo whose deps included `items` but not `open`; now short-circuits when
  closed.

No behaviour change when open; removes a real per-drag cost that scaled with
catalog size. Clearance + history tests (30) + tsc + lint green.

## [T2a] Herringbone wood floor finish (procedural)

Added a **herringbone** procedural floor pattern — the classic premium parquet
where rectangular planks (length = 4× width) interlock at 45° in a diagonal
zigzag — plus two catalog finishes, **Oak herringbone** and **Walnut
herringbone** (`floor-herringbone-{oak,walnut}`, tiling at a 2 m repeat ≈
0.5 m × 0.125 m planks). The generator (`materials/procedural/generators.ts`
`herringboneFields`) classifies each texel via the orientation field
`g = (⌊x⌋+⌊y⌋) mod 2n` (in plank-width units; `g<n` → horizontal plank, else
vertical), then shades it with the existing wood look (latewood bands across the
width, per-plank warmth/value, recessed grooves at the plank joints). Plank IDs
use each run's **canonical start position mod the tile period**, so per-plank
tint *and* grain tile seamlessly — including planks that straddle the tile edge
(validated the orientation lattice in isolation before integrating). Registered
in both `ProceduralPattern` unions + `PATTERN_FN`; catalog thumbnails + the
finish picker pick it up automatically.

Verified in-app: applied to a room floor and framed close top-down — clean
interlocking diagonal planks with realistic grain + grooves, no broken seams or
artifacts. Catalog tests (11) + tsc + lint green.

## [Q30] Undo/redo History panel with jump-to-step

Added a **History** panel (Tools menu, ⌘K "Edit history", + mobile Tools
accordion — all Pro-gated like the rest of Tools): a labelled timeline of every
undoable step, newest-first, with the live state marked **Now**. Clicking any row
**jumps** straight to that state — multi-step undo/redo in one move — so you can
scrub the design's history instead of hammering Ctrl+Z. Also has Undo/Redo
buttons (disabled at the ends) and Clear history.

- `historySlice.jumpHistory(targetIndex)` — a new action that unifies undo/redo:
  it flattens `past + current + (future reversed)` into one chronological
  timeline and re-homes the past/future stacks to land on any index (no-op for
  the current/out-of-range index). Unit-tested (back/forward/no-op).
- `ui/historyTimeline.ts` (pure, unit-tested) — `describeHistoryStep` derives a
  human label from two adjacent snapshots (Added/Removed *name*, Added N items,
  Swapped furniture, Moved furniture, Changed finishes, Toggled a door, Edited
  floor plan), and `buildHistoryTimeline` assembles the labelled flat list with
  the current index. Deriving labels from diffs means **no label has to be
  threaded through the dozens of `pushHistory` callers**.
- `ui/HistoryPanel.tsx` docks in the shared centred-top `.aux` slot (mutually
  exclusive with Budget/Checks/Versions — wired into every opener's close-aux).
  Verified on desktop (1600px) and mobile (390px, auto bottom-sheet): timeline,
  Now marker, disabled Undo/Redo at the latest state — clean, no artifacts.

13 new tests (timeline + slice); full suite 877 green; tsc + lint clean.

## [R7] Clear the last `useExhaustiveDependencies` lint finding

The only `useExhaustiveDependencies` finding left in the codebase was
`useOverlayLifecycle.ts`, whose effect deliberately depends on `active` only
(including `mounted`/`now` would re-run on its own `setMounted` and reset the
min-visible hold timer). It was annotated with an **ESLint** `eslint-disable`
comment — inert under Biome — so the finding still showed. Replaced it with the
correct single-line `// biome-ignore lint/correctness/useExhaustiveDependencies`
directive on the diagnostic line (the prose rationale kept above it).
Comment-only; no behaviour change (overlay-lifecycle tests + tsc green). Lint
errors now down to 4 (`noAssignInExpressions` ×4 in `catalog.ts`) + the
`noExplicitAny` warnings.

## [R6] Enable the `useHookAtTopLevel` lint rule (guard the hooks-bug class)

The Packs-gating bug ([N28e]) — a `useStore` placed after an early return —
slipped past `tsc` and lint because Biome's `correctness/useHookAtTopLevel` rule
wasn't enabled. Turned it on as an **error** in `biome.json`; the codebase passes
it clean across all 593 files (audited the other recent `proMode` hooks too — all
correctly above their early returns), so the pre-commit hook + lint now catch any
future hook-after-return / conditional-hook violation. Doesn't change the
lint exit state (the pre-existing `useExhaustiveDependencies` backlog is
unaffected; CI lint stays non-blocking).

## [N28e] Hide the catalog's Packs tab in Simple mode

The catalog's **Packs** tab (downloadable-content installs — API keys, hosted
archives) is advanced, so Simple mode now shows just **Catalog / Layers**; Pro
keeps Packs. The `uiMode` read is placed with the other hooks (above the
drawer's early return) to respect the rules of hooks. E2E-verified: the catalog
opens cleanly with two tabs in Simple.

## [N30d] Tour spotlights the hamburger on mobile

On mobile the desktop toolbar targets live inside the hamburger sheet, so the
menu-step spotlights had nothing to point at (cards just centred). The tour now
falls back to spotlighting the **hamburger** (`aria-label="Menu"`) when a step's
target is hidden, so mobile users see *where* the menus are; no-target steps
(welcome/customise/finishes) still centre. E2E-verified: the layout step rings
the ☰ at 390px.

## [N30c] Tour scrolls its target into view (narrow-desktop fix)

On a narrower desktop the toolbar scrolls horizontally, so a tour target like
Scene/View could sit off-screen — the spotlight would land off-frame. The tour
now `scrollIntoView`s the target once per step (done outside the measure loop so
the scroll it triggers can't re-fire the listeners). Verified the Scene step is
in view + spotlighted at 980px.

## [N30b] Auto-start the tour on first visit

The guided product tour now **auto-starts on a first visit** (gated on
`localStorage` `hdb_tour_done`), over the already-furnished default flat — it
supersedes the old onboarding carousel (first run also marks onboarded so the
carousel never double-shows). Returning users get nothing. **Replay** stays one
tap away from the **Help** modal ("Replay the guided tour") and **⌘K** ("Guided
product tour"). E2E-verified: a fresh load opens the welcome card unprompted.

## [N30] Guided product tour for new users

A spotlight **product tour** (`ui/tour/`) that walks a newcomer through building a
design in the order they'd actually work — an 8-step path: welcome → shape the
space (Floor plan: walls/rooms/doors/windows) → add furniture → move & customise →
paint walls & floors → walk through → set time-of-day & backdrop → wrap-up (Pro +
replay). Each step dims the scene and **spotlights the real UI element** (targeted
by `aria-label`) with an explanatory card (Step N/M, progress dots, Back/Next/
Skip; Esc/←/→ keys); steps whose target is hidden (e.g. behind the mobile
hamburger) fall back to a centred card, so it reads on every viewport. State in
`featuresSlice` (`tourOpen`/`tourStep` + `startTour`/`tourNext`/`tourPrev`/
`endTour`, completion in `localStorage` `hdb_tour_done`). Launchable from the
onboarding ("Take the guided tour", the first start option, which loads the demo
flat first), the Help modal ("Replay the guided tour"), and ⌘K. E2E-verified:
welcome card centres; the layout step rings the Arrange menu with its card below.

## [N28d] Floor-plan editor available in Simple mode

Shaping the space (walls, rooms, **doors & windows**) is crucial interior-design
functionality + a core tour step, so the floor-plan editor is no longer gated out
of Simple mode (it was over-gated in [N28c]). The genuinely-advanced gates (Tools,
numeric transforms, graphics internals, sun direction, saved views, record, per-
room editor) stay.

## [N29] Collapsible inspector sections (collapsed by default in Simple)

The inspector's multi-field sections are now **expandable** via a clickable
header (chevron + title), so a selected item doesn't dump a wall of controls.
New reusable `InspectorSection` wraps the parametric **Properties** section (with
the Reset button moved to the header) and the **Transform** section. In **Simple**
mode they start **collapsed** (`defaultOpen={uiMode === 'pro'}`) — tap to expand
what you need; in **Pro** they're open by default. E2E-verified: Simple shows
"› Properties" collapsed, clicking it reveals the fields; Pro opens it.

## [N28c] Simple mode also gates advanced options + fields

Beyond hiding the Tools menu + floor-plan editor, Simple mode now hides advanced
**options and fields** scattered across the menus, inspector, and graphics so the
workspace reads calmly for casual users (all restored in Pro):
- **Scene menu** → Sun direction (orientation compass).
- **View menu** → Saved camera views + "Edit a room".
- **File menu** → Record clip (keeps Save/Load/Export PNG).
- **Inspector** → the numeric X/Z/Rotation Transform fields + "Duplicate a row of
  N" (casual users move via the gizmo/drag; design properties + Rotate/Flip/
  Duplicate/Lock/Delete/Swap stay).
- **Graphics** → Asset quality + all per-effect overrides (shadows/IBL/post/
  contact-shadows/FPS/fixture-lights/resolution); Simple keeps just the render
  quality preset + measurement units.
Each is a `uiMode === 'pro'` gate at the surface. E2E-verified: Simple inspector
drops the Transform section + array-duplicate; Pro restores them.

## [N28b] Default to Simple interface

The interface now **defaults to Simple** (was Pro) so new users land in the
friendlier, decluttered workspace; only an explicit choice opts into Pro (and
persists). `uiSlice` initial + `editorPrefs` fallback updated, tests adjusted.
Verified: a fresh load shows the lean toolbar (no Tools menu).

## [T5] Test for useDisposeOnUnmount (locks in the backdrop leak fix)

Unit test for the `useDisposeOnUnmount` hook from [B35]: disposes every object
exactly once on unmount, never on re-render, and tolerates null/undefined
entries. Regression guard so the backdrop (and any future prop-attached GPU
object) disposal can't silently break.

## [B35] Dispose backdrop GPU objects on unmount (no leak on backdrop switch)

The scene backdrops create geometries + materials (and, for City, façade
textures) with `new` and attach them via `geometry=`/`material=` props — which
R3F does **not** own, so switching backdrops leaked them. Added a shared
`useDisposeOnUnmount()` (in `scene/geometryUtil.ts`) and wired it into the City,
Park, Hills, and Studio backdrops (City also disposes its shared albedo + the
per-variant emissive maps). Disposal runs only on unmount, so the active backdrop
is untouched. Verified all backdrops still mount/render and switching redraws
correctly.

## [Q55] Frame the design after loading / restoring / importing

Loading a saved layout, restoring a version, or importing a `.sofa.json` now
reframes the camera to the dollhouse overview (`requestHomeView`, which is
plan-aware since [B31]) — so the loaded design is centred and in view, instead of
leaving the camera wherever it happened to be (which could be off-screen for a
custom plan of a different size/position). Added after the existing
history-clear in all four load paths (desktop File→Load, mobile Load, version
restore, file import); boot autosave-restore uses a different path and is
unaffected. 860 tests green.

## [T4] editorPrefs persistence test (regression guard for new prefs)

Added the first unit test for `storage/editorPrefs` — covers the snap/grid/units
**+ the new backdrop + uiMode** round-trip: load applies persisted values,
invalid `backdrop`/`uiMode` fall back to safe defaults (`city`/`pro`), a corrupt
blob is ignored without throwing, and store changes persist back to localStorage.
Locks in the [N27]/[N28] persistence so a future prefs change can't silently
break it. 4 tests, 860 total green.

## [Q54] Backdrop options in the command palette

The four scene backdrops (City/Park/Hills/Studio) are now also reachable from ⌘K
(a "Backdrop" group), consistent with how lighting moods + time presets are
surfaced — discoverable even in Simple mode. tsc-clean; palette renders.

## [N28] Simple / Pro interface mode

A **Simple / Pro** interface toggle (the app has a lot of features now). Persisted
per-device via `editorPrefs`, switched from the **Appearance** popover (shared
desktop + mobile, with a one-line explanation). **Simple** hides the advanced /
technical clusters for a friendlier first experience — the analysis **Tools**
menu (Budget / Checks / Sun study / Walkthrough / Report / Measure) and the
**Floor-plan editor** entry (toolbar + Arrange menu + mobile accordion). **Pro**
(the default, so nothing changes for existing users) shows everything. Gating is
a single `uiMode === 'pro'` check at each surface, so it's trivial to extend.
E2E-verified: Simple drops the Tools menu from the toolbar, Pro restores it; the
Appearance toggle reflects + sets the mode.

## [N27] Selectable 3D scene backdrops (City / Park / Hills / Studio)

The surroundings outside the flat are now a **choice**, not just the (cluttered)
HDB skyline. Four backdrops, switchable from the Scene menu (desktop) + the
mobile Scene accordion, persisted per-device via `editorPrefs`:
- **City** — the existing HDB estate blocks (default, unchanged).
- **Park** — a calm ring of low-poly trees on a green common.
- **Hills** — distant rolling green hills, a minimal horizon.
- **Studio** — a clean neutral ground, no surroundings (focus on the design).

Implemented as `scene/SceneBackdrop.tsx` (a dispatcher over the existing
`CityBackdrop` + new procedural Park/Hills/Studio backdrops), all sharing a
`useBackdropOffset()` hook so they centre on the active plan (refactored out of
`CityBackdrop`). State + persistence in `uiSlice`/`editorPrefs`. E2E-verified:
all four render cleanly (trees, hills, clean studio), the Scene-menu picker shows
the active one, 856 tests green.

## [B33] City backdrop rings the active plan (not just the default flat)

The neighbouring-HDB-block backdrop + estate ground were laid out around the
**built-in** apartment's centre, so a custom floor plan sat off to one side of
the estate ring. The backdrop group is now translated by the active plan's
centre-delta, so the city rings whatever plan is loaded. The delta is exactly
(0,0) for the built-in flat (verified: `planBounds(default)` == the apartment
extent), so its view is unchanged; custom plans render cleanly with the city
around them.

## [B32] Walk-mode spawn inside custom plans (was the default flat's coords)

Entering **walk mode on a custom floor plan** spawned the player at the built-in
flat's hard-coded living/dining position (11, 6) — which lands *outside* an
arbitrary custom plan (e.g. a 8×5 loft), so you started in the void looking at
the building's exterior. Now a custom plan spawns the player in its **largest
room**, standing in the back third looking across the space; the built-in flat
keeps its exact tuned spawn. E2E-verified (custom 8×5 plan: spawn inside, room +
sofa in view).

## [B31] Plan-aware camera framing + fix camera-reset-on-plan-edit regression

Two fixes to `OrbitCamera`/`FirstPersonCamera`:
- **Plan-aware framing**: "Reset view", "Top view", and exiting the room editor
  now frame the **active plan's** bounds, so a custom floor plan lands centred +
  correctly sized (before, they used the built-in apartment's extent — a custom
  plan framed the wrong place). The built-in flat keeps its exact hand-tuned pose
  (`dollhouseFraming`/`topFraming` return the original constants for it).
- **Regression fix**: RE6.3 had added `floorPlan` to the framing/spawn effect
  deps, so *any* plan edit snapped the orbit camera back to the overview (and
  could re-spawn the walker). The plan is now read fresh inside those effects
  (deps back to `[camera, roomEditorId]`); the walk-collision effect still
  depends on `floorPlan` (correct — collision walls track the plan).
E2E-verified: a custom 8×5 plan frames correctly on Reset view; default flat
framing unchanged; 856 tests green.

## [Q53b] Share "Copy summary" includes the room count

For consistency with the richer report header ([Q53]), the Share modal's one-line
summary now leads with the room count: "<name> — N rooms · <area> · M items · ~$cost".

## [Q53] Richer report header (room count + total area)

The printable report's subheader now summarises the design at a glance —
"… · N rooms · <total area> · M furniture pieces" (was just the piece count).
Reuses the already-computed total area + unit formatting. Verified by rendering
the report.

## [P8] Room-editor caption: drop the redundant name on mobile

Responsive refinement of [Q52]: on mobile the room **name** already shows in the
collapsed top bar's room dropdown, so the caption there shows only the **size**
(e.g. "2.85 × 3.40 m · 15.4 m²") instead of repeating the name; desktop keeps the
full "name · size". Verified on a 390px viewport (no redundancy, no collision).

## [Q52] Room name + size caption in the per-room editor

A small top-centre caption while the per-room editor is active, naming the
isolated room and its size (e.g. "Main Bedroom · 2.85 × 3.40 m · 15.4 m²") so you
always know which room you're planning and its dimensions. Reads the room from
the active plan, so it works for the built-in apartment and custom plans alike;
pure DOM overlay, safe-area positioned, hidden otherwise. E2E-verified.

## [Q51] "Edit in 3D" from a selected room in the 2D plan editor

The 2D floor-plan editor's room inspector now has an **Edit in 3D** button that
closes the plan editor and opens the **per-room editor** for that room — a direct
2D→3D workflow connection, made possible now that the per-room editor works on
any plan (RE6). E2E-verified (button renders for a selected room; enters the
editor via the same store actions used elsewhere).

## [Q50] Command palette: "Edit a room"

Now that the per-room editor works on every plan (RE6), added an **Edit a room
(isolate)** action to ⌘K (Go to group). It enters the editor for the active
plan's first editable room (default apartment → first non-external room; custom
plan → its first room). Mirrors the existing palette commands.

## [RE6.3] Per-room editor now works on custom floor plans (RE6 complete)

The final wiring: the per-room ("Edit a room") editor — previously gated to the
built-in apartment ([B24]) — now works on **any custom floor plan**. A shared
`scene/roomEditorShell.ts` selector returns the default-apartment `roomShell` or
the plan-derived `planRoomShell` (RE6.1) as a discriminated union; `RoomEditorScene`
renders `RoomShell` or the new `PlanRoomShell` (RE6.2) accordingly; `OrbitCamera`
and `FirstPersonCamera` frame/spawn through the selector (no more `roomShell`
crash on a custom room id); walk-mode collision uses a new
`buildPlanRoomCollisionWalls` (clipped plan walls, doors as gaps). `enterRoomEditor`
is ungated and `roomEditor.roomId` widened to `string`; the View menu entry +
desktop/mobile room-switchers now iterate the active plan's rooms. **E2E-verified
on a custom plan** (clean room: oak floor, clipped plaster walls with
camera-facing reveal, door panel, furniture, framed camera, working inspector)
**and the default plan** (Main Bedroom renders unchanged). 856 tests green.

## [RE6.2] Plan-aware per-room renderer (`PlanRoomShell.tsx`)

The renderer half of the plan-aware per-room editor: `apartment/PlanRoomShell.tsx`
draws one isolated room of a **custom floor plan** — per-rect (or polygon) floors
with the room's own floor finish (`PlanRoomFloor`), walls clipped to the room
footprint with the same camera-facing reveal as the default `RoomShell`, and
door/window panels placed from the shell's resolved opening centres. To support
that, `planRoomShell` now returns **placed openings** (`PlanRoomOpening` =
opening + world centre + host-wall angle) so the renderer needs no source-wall
access. Component compiles + lints clean and is not yet mounted (zero render risk
until the RE6.3 wiring lands); builder remains fully unit-tested (now asserting
resolved opening placement).

## [RE6.1b] Decouple the furniture room-filter from the concrete shell

`FurnitureLayer` / `isItemInRoom` depended on the default-apartment `RoomShell`
type. Introduced a minimal `RoomContainment` interface (`{ contains(x,z) }`) that
both the default `RoomShell` and the new `PlanRoomShell` satisfy, so the per-room
furniture filter works in either editor without a concrete-type dependency —
unblocking the plan-aware `RoomEditorScene` (RE6.3). No behaviour change; tests
green.

## [RE6.1] Plan-aware per-room shell builder (foundation)

First step toward a per-room editor that works on **custom floor plans** (today
it's gated to the default apartment because `apartment/roomShell` is built from
the built-in constants). New pure `floorplan/planRoomShell.ts`: `planRoomShell(plan,
roomId)` derives a room's footprint rects, its walls **clipped** to that footprint
(shared long walls trimmed to the room's span), and the doors/windows attributed
to those walls — the plan-data analogue of `roomShell`, renderer-agnostic so a
plan-aware `RoomEditorScene` can consume it. Handles rect, L-extension, and
polygon rooms (bbox for framing, true polygon for containment). Fully unit-tested
(every default-plan room frames + is ≥3-walled; shared-wall clipping; opening
attribution; polygon cut-out containment). Wiring the renderer + ungating the
editor for custom plans follows as RE6.2/.3 (see TASKS.md).

## [P7] DRY the floor-plan editor's typing guards

The editor had three hand-rolled "is the user typing?" checks (the `P` toggle, and
the Delete handler from [B30]) duplicating logic that already lives in
`controls/useKeyboard`'s `isEditableTarget`. Routed both through the shared helper
— less duplication and it also hardens the `P` guard, which previously missed
`<select>`. Behaviour-identical; app-load verified.

## [B30] 2D editor: delete furniture with Delete; don't hijack field edits

Two fixes to the 2D floor-plan editor's Delete/Backspace handler:
- You can now **delete a selected furniture item** with Delete/Backspace (parity
  with the 3D scene) — before, only plan elements (walls/rooms/openings) were
  deletable there, so furniture could be moved in 2D but not removed.
- Added a **typing guard**: the global handler no longer fires while focus is in
  an input/textarea/select (e.g. the inspector's room-name or dimension fields),
  so Backspace-to-edit can't silently delete the selected wall/room.
E2E-verified (selecting a bed + Delete drops the item count 66→65 and clears the
selection).

## [B29] Clear undo history on every design load (not just import)

Loading a whole design replaces the world, so any prior undo steps reference a
different design — pressing Ctrl/⌘+Z afterwards crossed the load boundary into
incoherent state. Only the file-**import** path cleared history; **version
restore**, desktop **File → Load**, and mobile **Load** did not. All four load
paths now `clearHistory()` after `applySerialized` (which resets `past`/`future`
*and* the coalesce keys), so undo never bridges two designs. Consistent across
desktop + mobile.

## [B28] Layout preset / Smart Start is a single undo step

`applyLayoutPreset` snapshotted history once but then called `setFloorFinish` /
`setWallFinish` in a per-room loop — and each of those pushes its own history
entry, so applying a Smart Start preset stacked ~9 undo steps and reverting it
took many Ctrl/⌘+Z presses. It now applies the furniture + the whole coordinated
palette in a single `set`, so a preset is one clean undo. Unit-tested (one
history entry; one undo restores the prior layout) and visually verified.

## [B27] Loading a saved plan is now undoable

`loadSavedPlan` swapped in a saved plan without a history snapshot, so loading a
plan from the library over your current work couldn't be undone. It now pushes
history first (only when the plan is found). Unit-tested (load → undo restores the
working plan). Sister fix to [B26].

## [B26] "Reset to HDB" is now undoable (was silent data loss)

`resetFloorPlan` replaced the active plan with the default **without snapshotting
history**, so the 2D editor's "Reset to HDB" irreversibly destroyed a hand-built
custom plan — Ctrl/⌘+Z couldn't bring it back. It now pushes history first, so a
reset is undoable like every other plan edit (the editor's "New" was already
wrapped in a snapshot). Unit-tested (reset → undo restores the custom plan).

## [Q49] Name label for the selected item in the 2D editor

The 2D floor-plan editor draws furniture as category-coloured footprints; with
dozens of similar shapes it was hard to tell what you'd clicked. The **selected**
item now shows its name (custom label or catalog name) centred on its footprint,
with a halo so it reads over anything. Only the selected item is labelled, so the
plan stays uncluttered. E2E-verified.

## [B25] Reject degenerate dimension annotations

`addAnnotation` now ignores non-finite or degenerate spans (a zero-length line, a
rect missing an extent), so a stray pin can't write unrenderable garbage into the
saved design. Unit-tested.

## [Q48] Command palette: Design report + Floor plan editor

Two top-level features were missing from ⌘K (which is meant to launch
everything): added **Design report (printable)** and **Floor plan editor** to the
Tools & panels group. E2E-verified (both appear with icons in the palette).

## [N26] Pinned dimensions in the 2D floor-plan editor (+ overlay-leak fix)

Pinned dimension annotations now render in the **2D floor-plan editor** too —
teal dashed line/rect callouts with distance/area labels, the same as the 3D
overlay and the report — so a dimension traced in any view shows everywhere.
While here, fixed a layering leak: the 3D scene stays mounted behind the editor,
and drei's `<Html>` (used by `AnnotationsOverlay` + `MeasurementOverlay`) sits at
a very high z-index, so those labels floated *over* the editor (a doubled
annotation). Both overlays now hide while `floorPlanEditing`. E2E-verified
(single clean teal callout in the editor, no leaked HTML label).

## [B24] Gate the per-room editor to the default plan

The per-room ("Edit a room") editor isolates a room using geometry derived from
the built-in apartment constants (`roomShell` → `ROOMS`), so on a **custom floor
plan** entering it showed a default room over a mismatched shell. Added a central
guard in `enterRoomEditor` (declines with an explanatory toast when the active
plan isn't the default) and hid the entry points (toolbar **View → Edit a room**
and the mobile action sheet) on custom plans. The default apartment is unaffected
(`isDefaultPlan` true for the boot plan — verified the entry still shows + works).
Making the room editor fully plan-aware is tracked as a larger follow-up.

## [B23] Measurement overlay follows the active plan (custom-plan fix)

The 3D measurement overlay (room name + size + ceiling per room) iterated the
**default apartment's** `ROOMS` at default centroids, so on a **custom floor
plan** it drew the wrong rooms at the wrong places. It now iterates the **active
plan's rooms**, anchoring each label at the room's centroid (polygon centroid for
free-form rooms, rect centre otherwise — identical to the old `roomCentroid` for
seeded default rooms) and using `planRoomArea` for the area (respects L-shape /
polygon). Default output is unchanged (verified — every room labelled in place);
custom plans now measure correctly.

## [B22] Layers/Objects tree groups by the active plan (custom-plan fix)

The Objects/Layers tree grouped items using the **default apartment's** room
shells, so on a **custom floor plan** every item fell into "Unassigned" instead
of the plan's rooms. It now groups by the **active plan's rooms** via
`pointInRoom` (handling rect / L-shape / polygon rooms), skipping only the
default plan's external ledges. The default plan is unchanged (verified — items
still group under Main Bedroom / Bedroom 2 / …, not Unassigned), and custom plans
now group correctly. Also dropped the now-unused per-default-room shell
precompute. Recomputes on plan change too (was items-only).

## [N25] Scale bar on the report's floor plan

The printable report's floor-plan SVG now carries a **scale bar** (bottom-left,
end ticks + label) — standard on architectural plans, and the thing that makes a
plan measurable on paper. A new pure, unit-tested `scaleBarChoice(width, units)`
picks a round length (~¼ of the plan width): metric 0.5/1/2/5/10 m (sub-metre
labelled in cm), imperial 1/2/5/10/20 ft drawn at true metre length. Because the
SVG scales as one, the bar always represents its labelled real length at the
printed size. Verified by rendering the real report.

## [B21] Report finishes-by-room follows the active plan (custom-plan fix)

The report's **Finishes by room** table iterated the default `ROOMS` constant, so
on a **custom floor plan** it listed the wrong rooms (the default HDB rooms, all
"—") and omitted the user's actual rooms — finishes are keyed by room id, and a
custom plan's ids aren't the defaults. Now it iterates the **active plan's
rooms**, resolving each room's floor/wall finish by id and skipping only the
default plan's external (non-finishable) ledges. The default plan's output is
unchanged (verified — same rooms, ledge still filtered); custom plans now show
their real rooms + finishes. Unit-tested.

## [N24] Material palette ("style board") in the design report

The printable report now ends with a **Material palette** — colour chips for the
distinct floor + wall finishes in use, ordered by how many surfaces use each, so
a client can read the scheme at a glance (an at-a-glance "style board", a staple
of Coohom/Homestyler). Driven by a new pure, unit-tested `designPalette(finishes)`
(`ui/reportData.ts`): custom `#rrggbb` finishes are their own chip, builtin
materials resolve to a friendly name + swatch colour via the catalog, and unknown
DLC/remote ids still list with a neutral chip so the palette is complete.
Verified by rendering the real report HTML.

## [P6] Minimap room label legibility

The current-room name on the walk minimap was near-illegible (`--text-3`, 5px, no
contrast against the room fill + furniture dots). Gave `.mm-label` a halo
(`paint-order: stroke` in the surface colour), stronger fill (`--text`) and
weight, and centred it on the room centroid (`dominant-baseline: central`) so it
reads cleanly over anything beneath it. CSS + one attribute; verified in walk.

## [N23] Walk minimap shows doorways + windows

The walk-mode `Minimap` now draws wall **openings**: doors as a gap that "cuts"
the wall (panel-bg line over it) and windows as a thin accent tick — so you can
read at a glance where rooms connect and where the daylight comes in while
walking. Driven by a new pure, unit-tested `openingSegments(plan)` helper
(`ui/walk/minimapGeometry.ts`) that resolves each opening's span along its host
wall and clamps it to the wall ends (malformed offsets can't draw past the wall;
unknown/zero-length walls are skipped). E2E-verified in walk mode.

## [B20] Fix duplicate walk-mode minimaps + wire the current-room highlight

Walk mode was rendering **two overlapping minimaps** bottom-right: the
long-standing `NavCluster` `Minimap` (rooms + walls + category-coloured furniture
dots + camera arrow) and the redundant `WalkMinimap` added in [N22]. Removed the
duplicate `WalkMinimap` (and its App mount) and folded its only unique value into
the real `Minimap`, which the original design had already anticipated but never
wired (`.mm-room.lit` + `.mm-label` styles existed unused): the room the player
is standing in is now **highlighted** and **named** live from the camera pose
(cheap attribute/class writes in the existing rAF — no React re-render). Room
fills now use the shared, unit-tested `roomPathD` (`ui/walk/minimapGeometry.ts`)
placed by a world→svg transform, so **L-shaped / polygon rooms** render and
highlight accurately (the old code drew bounding-box rects only). E2E-verified in
walk mode (single panel, correct room lit + labelled, no overlap).

## [Q47] Copy a one-line design summary (Share modal)

A "Copy summary" button copies a one-line text summary — name · interior area ·
item count · ~estimated cost (unit-aware) — to the clipboard for quick sharing
in a chat/email, distinct from the full report and the portable `.sofa.json`.

## [N22] Walk-mode minimap (first-person orientation aid)

Walk mode now shows a small **top-down minimap** (bottom-right, clear of the
joystick) — the plan outline plus a live player marker (position + facing) so you
can orient yourself while walking the flat. Pure DOM/SVG overlay; a lightweight
rAF writes only the marker transform from the camera singletons (`cameraPosXZ` /
`cameraForwardXZ`), and it unmounts (zero cost) outside walk. Works for the
default flat and custom plans; safe-area-inset positioned for mobile. Verified
the marker tracks the player.

## [Q46] Saved camera views capture the lighting (a "shot" = angle + ambiance)

Saved views now snapshot the **time of day + fixture-lights mode** alongside the
camera pose, and restore them on apply — so a bookmarked "shot" reproduces the
full look (e.g. a golden-hour lounge angle stays golden-hour). Optional fields,
back-compat: older saved views have no lighting and leave it untouched.
Unit-tested (capture + restore).

## [N21] Persistent dimension annotations (pin a measurement)

A completed tape measurement now shows a **📌 Pin** button; pinning saves it as a
persistent dimension callout (`AnnotationsOverlay`) that stays in the scene
(orbit + walk), renders in a calm slate (distinct from the live amber tape) with
a distance/area label and an **×** to remove it, and **saves with the design**
(round-tripped in `schema.ts`, optional/back-compat). A pro-tool capability
(RoomSketcher/magicplan) built in clean slices: data model + CRUD + persistence
(`measurementsSlice`, unit-tested incl. schema round-trip), render overlay, and
the pin/remove UI. Verified end-to-end: pin → annotation persists + tape clears;
both line + rect callouts render with labels.

## [U1] Metric / imperial measurement units

Commercial-parity feature: a **metric ⇄ imperial** units toggle in the Graphics
(settings) panel (mobile-parity via the accordion), persisted per-device in
`editorPrefs`. Metric stays the canonical/editing unit (Singapore HDB context);
imperial reformats all read-outs — feet-and-inches lengths (`8′ 6″`, carrying
12″ up to the next foot) and square feet. `utils/measurement.ts` is now the
single formatting source (`formatLength`/`formatArea`/`formatDims`/
`formatRoomSize`, each taking an optional `UnitSystem` that defaults to metric
for back-compat), routed through every read-only display: the room-measurement
overlay, tape measure, drag clearance HUD, catalog-card footprints, finish-picker
room area, and the floor-plan editor's area/length/draft labels + inspector. The
plan editor's numeric input fields stay in metres (precise drafting unit).
Formatters unit-tested (metric + imperial, incl. inch-carry + non-finite).
Verified: imperial overlay renders `17′ 9″ · 262 ft²` / `Ceiling 8′ 6″` cleanly
and the panel toggle reflects state.

## [RE5] Ceilings for custom floor plans

Custom (non-default) plans rendered by `PlanShell` previously had **no
ceiling** — looking up in walk mode showed a void. Added `PlanRoomCeiling`: a
per-room downward-facing white plane (rect + L-extension + arbitrary polygon,
reusing `PlanRoomFloor`'s placement helpers) at the room's ceiling height,
honouring the per-room override from N4b. Rendered `BackSide` so — exactly like
the default flat's `Ceiling` — it's visible from below (walk) and culled from
the orbit/dollhouse view above. One shared material instance. Verified: the
orbit dollhouse still sees into every room (no regression), and walk mode now
shows a properly-lit ceiling with fixtures mounted on it.

## [Q25] Rename objects (custom per-item labels)

Items can now be given a **custom name** in the inspector (a Name field;
placeholder = the catalog def name). The label overrides the def name in the
inspector title, the Layers/Objects tree (and its name filter), and falls back
cleanly when blank. Stored as an optional `FurnitureItem.label`, mutated via the
new `itemsSlice.renameItem` (trims whitespace; blank clears it) and round-tripped
through `schema.ts` as an optional field (no migration — older saves just have
no label). renameItem + schema round-trip unit-tested; verified the name shows
in the inspector title, field, and Layers tree.

## [B7] Resets / presets didn't clear the hidden set

Same stale-id class as B6: `resetToEmpty`, `resetToDefault`, and
`applyLayoutPreset` replaced all items + cleared the selection but left
`hiddenItemIds` populated, so the new layout could start with a wrong
"(N hidden)" count (and the per-room eye reading hidden). They now clear
`hiddenItemIds` too. Unit-tested.

## [Q28b] One-tap clear for the catalog Max-$ filter

Follow-up polish: a small ✕ appears beside the Max-$ field when a cap is set,
clearing it in one tap (handy on mobile where emptying a number input is fiddly).
Verified the ✕ shows when a value is present.

## [B12] Finish native-dialog removal (mobile File + style)

A grep audit found the mobile toolbar's File handlers still used `prompt`/`alert`
(save layout name, save/load errors) and the mobile "Save style" used
`window.prompt` — missed in B9–B11. Routed them through `promptText` + the
`notify` toasts too. Confirmed **zero** `window.prompt/alert/confirm` remain in
app code (only doc comments reference them).

## [Q37] "Finishes by room" section in the report

The printable design report now lists each room's **floor + wall finish** (a
spec a contractor/renovator needs). Material ids resolve to friendly names via
the builtin catalog (DLC/custom ids fall back to the id); the section is omitted
when finishes aren't supplied (back-compat). `buildReportHtml` gained an optional
`finishes` arg, passed from the desktop Tools menu + mobile toolbar. Unit-tested.

## [Q36] Cost-per-area in the printable report

The design report now shows a **"Furnishing per m²/ft²"** figure (estimated
furniture total ÷ interior area) under the budget total — a standard
property/renovation metric. Unit-aware (m²/ft²), omitted when there's no
furniture or area. Unit-tested.

## [Q35] Time-of-day scrub slider

The Scene menu gains a continuous time slider (0–24 h, 15-min steps) under the
presets/custom-time row — drag to sweep the day and watch the sun, shadows, sky,
fixture lights, and the new RE1 window-glass tint change live. Bound to the
clamped `setManualHour`; closes-safe (stops propagation). Verified it renders +
scrubs.

## [Q45] Scene menu (time / lighting moods / sun) available in Walk mode

The Scene controls were hidden in Walk mode (grouped with the orbit-only editing
clusters), so you couldn't change the time of day or lighting mood while walking
through — exactly when immersive lighting matters most. The Scene menu now shows
in both orbit and walk (still hidden only in the room editor), so you can
experience the flat at golden hour / a cosy evening from eye level. Verified the
"Scene" control appears in the walk toolbar. (Mobile already had it via the
hamburger sheet.)

## [Q44] Spend-by-category breakdown in the Budget panel

The Shopping panel now shows a **"Spend by category"** breakdown — each category
with a proportional bar + its share (%) and amount, sorted high-to-low — so you
can see at a glance where the budget goes (e.g. "Appliances · 30%"). Computed
from the same live/estimate prices as the total (consistent), shown only when
≥2 categories are present. Verified.

## [B18] Save/restore the fixture-lights mode with the design

`timeMode`/`manualHour` were saved with a design but `lightsMode` wasn't — so a
saved lighting mood's on/off fixture state was lost on reload (lights reverted to
auto). Added `lightsMode` to the save schema (optional, defaults to 'auto' for
legacy saves) so the full lighting state round-trips. Unit-tested.

## [B19] Autosave flushes on page hide (no edit lost on quick reload)

The autosave debounces writes (~600ms) and only force-flushed on React unmount
(which never happens on a real reload/close), so an edit made within the debounce
window before reloading/closing was lost. Added pagehide + visibilitychange→hidden
flush handlers that synchronously write the pending save (localStorage.setItem is
sync, so it persists even as the page unloads). Covers desktop close/reload and
mobile backgrounding. Unit-tested.

## [N20c] Time-of-day presets in the command palette

Added jump-to time presets (Morning/Noon/Dusk/Night) to the ⌘K palette
alongside the moods, so a specific time is reachable by search, not just the
cycle key. Mirrors the moods entries.

## [N20b] Lighting moods in the command palette

The four lighting moods are now also reachable from ⌘K (a "Lighting moods"
group), so they're keyboard-accessible and fuzzy-searchable (e.g. ⌘K → "cosy").
Verified.

## [N20] One-click lighting mood presets

A new **Lighting moods** section in the Scene menu (desktop + mobile parity)
sets the sun time **and** the fixture-lights mode together for an instant
ambiance — **Daylight** (1 PM, lights off), **Golden hour** (6 PM, auto), **Cosy
evening** (8:30 PM, lamps on), **Night** (11 PM, lamps on). Bundling the two
controls users would otherwise set separately makes previewing a room across the
day a single tap — a core interior-design capability. Modular
`scene/lighting/lightingScenes.ts` (`LIGHTING_SCENES` + pure `lightingSceneState`
/ `isLightingSceneActive` + `applyLightingScene`), unit-tested; the active mood
highlights. Non-asset, non-perf-impacting (reuses the existing sun + lights-mode
systems).

## [Q43b] Multi-duplicate: shared helper + discoverable button

Refactored the multi-select duplicate logic out of App into a pure, unit-tested
`furniture/duplicatePlacement.ts` `planDuplicates` (shared-offset-then-spiral,
group-aware) and reused it for a new **"Duplicate selection"** button in the
multi-select inspector panel — so the feature is discoverable, not just the
Ctrl/⌘+D shortcut. Helper unit-tested (offset/ids/group/empty); button verified
in the panel.

## [Q43] Ctrl/⌘+D duplicates a whole multi-selection

Duplicate (Ctrl/⌘+D) only copied the single active item; a multi-selection now
duplicates **every** selected piece in one undo step. It first tries a shared
offset (preserving the arrangement) and uses the first that frees all copies;
if the layout's too tight, it falls back to a per-item spiral so copies always
land. Copies inherit a fresh shared group only when all sources shared one, and
the new copies become the selection. Verified: ⌘+D on a 2-item selection adds 2
(66→68) and selects them.

## [B17] Onboarding "start empty" uses resetToEmpty (undoable + clears hidden)

The first-run "empty flat" choice called `setItems([])` directly, so it wasn't
undoable and left any hidden-id set stale. Switched to `resetToEmpty()` (pushes
history + clears the hidden set), consistent with the File-menu clear.

## [B16] Copy/paste/duplicate preserves mirror flips

A flipped piece (mirrored left↔right or front↔back) pasted or duplicated came
out un-flipped — the clipboard carried defId/rotation/props but not `flipX`/
`flipZ`. The clipboard entry now carries the flips and paste applies them (to
both the collision probe and the placed item), so a duplicated mirrored item
keeps its orientation.

## [B15] Floor-plan edits are now undoable

Real gap: the undo/redo history snapshot excluded `floorPlan` and the plan
actions never pushed history, so drawing/moving/deleting walls, rooms and
openings in the 2D editor couldn't be undone (Ctrl+Z silently did nothing for
plan edits). Added `floorPlan` to the `HistorySnapshot` and wired `pushHistory`
into every granular plan mutation — discrete ops (add/remove wall·room·opening,
split) push a step; drag/typing streams (move-vertex, update wall·room·opening,
ceiling height) coalesce into one. The existing global Ctrl+Z/Ctrl+Y now restore
the shell too. Snapshots hold the plan by reference (immutably replaced, so no
clone cost). Unit-tested (add-wall undo/redo, remove-room undo).

## [V1] Version compare — per-version diff vs the current design

Each saved version now has a **Compare** toggle showing exactly how it differs
from the live design: the item types it has more of ("+ 2 Dining chair") and
fewer of ("− 1 Sofa"), resolved to friendly names. Backed by a pure, unit-tested
`diffVersionItems` (defId multiset diff, catalog name resolution); the panel
loads the version's items on demand and gracefully no-ops if the slot is
corrupt. Restores the now-real "compare" to the Versions label. Verified: a
3-item-fewer version shows "− 1 Ceiling light / − 1 Basin / − 1 Mirror".

## [Q42] Versions show their item-count delta vs the current design

Each saved version in the Versions panel now shows how it differs from the live
design at a glance — e.g. "12 items (+3 vs current)" — a lightweight compare so
you can tell versions apart without restoring them. Pure render addition from
the already-computed per-slot count + the current item count.

## [Q41] 2D floor-plan diagram in the printable report

The design report now includes an inline **SVG floor-plan diagram** (walls as
strokes — thicker for external — + room name labels at their centres), generated
purely from the plan geometry in a new modular `reportPlanSvg.ts` (no canvas/DOM,
prints crisply, scales via viewBox). Makes the report a complete deliverable
(plan + areas + budget + cost-by-room + finishes + notes + hero render). SVG
generator unit-tested (walls/labels/escaping/degenerate); report-HTML inclusion
verified.

## [Q40] Export the design file from the Share modal

Added an **Export file** button (the portable `.sofa.json` via `exportDesignToFile`)
to the Share modal's export row, alongside Snapshot PNG + Shoppable PDF — so the
real way to share a design (send the file, recipient imports it) is right where
the App-link note points, not buried in the Versions panel. With B13/B14 the
Share modal is now an entirely functional export hub (PNG, PDF, file) + an honest
app link.

## [B14] Honest "App link" instead of a dead share URL

The Share modal's "Shareable link" copied a fake `hdb.design/s/…` URL (dead
domain, no backend) — a broken promise. Replaced it with the **real app URL**
(opens the editor) under an honest "App link" heading + a note pointing users to
the Versions panel's file export for sharing the actual design. No more
copy-a-link-that-goes-nowhere.

## [B13] "Shoppable PDF" now actually opens the report

The Share modal's **Shoppable PDF** button was a stub — it only fired a success
toast and produced nothing (a button that lied). It now opens the real printable
design report (areas, budget, cost-by-room, finishes, notes — save-as-PDF from
the print dialog). Extracted the report-open into a shared `ui/openReport.ts`
`openDesignReport()` so the Tools menu, mobile toolbar, and Share modal all use
one implementation (removed two duplicated copies). Verified the suite + tsc.

## [Q39] Lock all / Unlock all

The Layers panel footer gains a **Lock all / Unlock all** toggle — protect a
finished layout from accidental moves/edits (or release it) in one tap. Backed
by a new `itemsSlice.setAllLocked(locked)` (single undo step). Unit-tested;
footer button verified.

## [Q38] Project / design notes

A free-text **project note** that travels with the design (a brief, client
preferences, a to-do…): edited in a "Project notes" textarea in the Share modal,
**saved with the design** (new `projectSlice.designNote`, round-tripped through
`schema.ts` as an optional `note`), and surfaced (HTML-escaped) at the top of the
printable **report**. Round-trip + report rendering unit-tested; verified the
textarea renders + persists.

## [Q7a] Empty-state hint for saved camera views

Small inline-help polish: the View menu's Saved-views section showed nothing when
empty. It now shows "No saved views yet — frame an angle, then 'Save current
view'." so the feature is discoverable. Verified it renders in the View menu.

## [RE1] Window glass responds to time of day

Realism: window panes were a static light-blue. They now tint with daylight —
a clear cool pane by day → a dark, more-opaque reflective pane at night — so
windows read as real glass (bright in daytime, near-black after dark). Driven in
`WindowPane`'s existing `useFrame` from the shared `fixtureGlow` darkness signal
(allocation-free `Color.lerpColors` + opacity lerp; no new lights/shadows, no
re-renders). A safe slice of the deferred lighting-realism work.

## [Q34] Remember the catalog's last category + sort

Small returning-user QOL (matches how Coohom/Planner 5D retain context): the
catalog drawer now persists the active browse **category** and **sort** per
device (`hdb_catalog_browse` localStorage, validated with a safe fallback to
seating/Featured) and reopens there instead of always resetting to "seating".
Self-contained in `CatalogDrawer` (lazy init + best-effort write). Verified the
drawer still opens cleanly.

## [Q28] Catalog max-price filter

A **Max $** filter beside the catalog Sort control: items priced above the cap
are hidden while browsing a category. Un-downloaded CC0 entries are free
downloads, so they always pass — sidestepping the remote-entry price gap.
Guarded the controls row so it shows based on the **unfiltered** category size,
not the filtered result — otherwise emptying the list would hide the very
control needed to clear the filter (caught + fixed during verification).
Verified Max $120 keeps the cheaper seating, Max $1 empties it with the filter
still adjustable.

## [A3] Cycle the selection with `[` / `]`

Keyboard access to placed objects without a mouse: **`]`** selects the next
item and **`[`** the previous (wrapping; from nothing, `]` starts at the first
and `[` at the last). Orbit-mode only, skipped while typing or in the 2D plan
editor. Listed in Help & shortcuts. Verified the inspector follows the cycling.

## [Q32] Saved-view thumbnails

Each saved camera bookmark now shows a small **preview thumbnail** of the angle.
`saveCurrentView(name, thumb?)` stores an optional JPEG data-URL (`SavedView.thumb`,
persisted in the existing localStorage list); `SavedViewsSection` captures it via
`captureThumb()` at save time — before the prompt modal paints over the canvas —
and renders it in both the desktop View menu and the mobile View accordion
(shared `.saved-view-thumb`). Also fixed a `window.prompt` for naming a view
that had been missed in B10 (mobile toolbar) → now the themed `promptText`.
Verified thumbnails render in the View menu.

## [Q33] Area (rectangle) measure mode

The tape measure gains an **Area** mode alongside point-to-point **Distance**: a
themed bottom-centre Distance/Area toggle (DOM overlay, desktop + touch) switches
`measurementsSlice.tapeShape`; in Area mode the two clicks become opposite
corners of a rectangle, drawn as a translucent amber fill with a `W × D · area`
label in the active unit system. Switching mode clears the in-progress points.
Slice unit-tested; verified the rect renders "3.00 × 2.00 m · 6.0 m²" with the
toggle reflecting state.

## [Q29] Press `/` to jump to catalog search

A quick-find shortcut: pressing **`/`** (orbit mode, not while typing) opens the
left drawer if closed and focuses + selects its search field — the catalog
search or the Layers name filter, whichever view is active (both reuse
`.cat-search`). Added to the Help & shortcuts list for discoverability. Verified
the drawer opens with the search focused.

## [B11] Themed confirm modal replaces blocking window.confirm

Completes the native-dialog cleanup: an async **`confirmAction`** store action +
a focus-trapped **`ConfirmModal`** (Cancel focused as the safe default, Enter
confirms, optional red `danger` button) now back the destructive "Reset to
default" and "Clear all furniture" actions in both the desktop File menu and the
mobile toolbar — no more unstyleable/iframe-blocked `window.confirm`. Resolve/
supersede logic unit-tested; verified the modal renders themed with the danger
button.

## [B10] Themed prompt modal replaces blocking window.prompt

Finishes the native-dialog cleanup (B9): a reusable async **`promptText`** store
action + a focus-trapped, on-brand **`PromptModal`** (mounted once in App) now
back every name-entry that used `window.prompt` — Save layout (File menu), Save
version (Versions), Save camera view, Save style, the floor-plan **Scale**
calibration (numeric), and the AI vision-key entry. `promptText(opts)` returns a
`Promise<string|null>` so call sites just `await` it; the resolver is held
outside the store (transient callback) and a superseding prompt cancels the
prior one. Removes the last unstyleable/iframe-blocked blocking dialogs from the
core flows. Verified the modal renders themed with label, placeholder, and
Cancel/Save.

## [B9] Replace blocking native alerts with themed toasts

Three error paths used `window.alert(...)` — unstyleable, blocking, and silently
broken in sandboxed embeds (a real commercial-deploy hazard). The save-failure
and load-failure errors (File menu) and the AI floor-plan-recognition failure
now surface through the existing themed `notify` toast system (`kind: 'error'`)
instead. Verified the error toast renders bottom-docked and on-brand. (The
remaining `prompt()` name-entry dialogs are a separate, larger follow-up.)

## [P4] Layers panel: stop recomputing room shells on every drag

The Objects tree grouped items by room by recomputing all per-room wall-clipped
`roomShell`s inside an `items`-keyed memo — so every furniture drag (which mutates
`items`) re-derived the clip geometry for all rooms while the panel was open.
Room shells depend only on the static apartment constants, so they're now a
module-level constant computed once. Pure refactor — identical grouping output
(verified), no behaviour change.

## [Q27] Ctrl/⌘-click multi-select in the Layers panel

Layers/Objects rows now honour **Ctrl/⌘-click to toggle** an item in the
selection (plain click still selects one), matching the 3D scene's multi-select.
Building a multi-selection from the tree now lights up the align/distribute/
group panel just like marquee + shift-click in the viewport. Verified: ⌘-clicking
a second row yields "2 items selected".

## [B8] Loading a design left stale selection + hidden ids

Completing B6/B7: `applySerialized` (used by version restore, `.sofa.json`
import, and boot hydration) now resets `selectedItemId`/`selectedItemIds` and
`hiddenItemIds` as part of the patch, so a loaded/restored design never carries
over a selection or hidden-count that points at items from the previous one.
Single-point fix covering all five consumers. Unit-tested.

## [B6] Deleting a hidden item left a stale id in the hidden set

`deleteItem` cleaned the selection but not `hiddenItemIds`, so deleting a hidden
piece left a dangling id — the Layers footer's "Show all (N hidden)" then
over-counted. `deleteItem` now drops the deleted id from `hiddenItemIds` too.
Unit-tested.

## [Q26b] "Hide" in the right-click context menu

The context menu gained a plain **Hide** action (it already had "Isolate (hide
others)" + "Show all"), so a piece can be hidden straight from the 3D scene
without opening the Layers panel. Hides the whole current selection when the
right-clicked item is part of it, else just that item (via `setItemsHidden`).
Verified in the rendered menu.

## [Q26] Per-room hide/show in the Layers panel

Each room group in the Objects/Layers tree gets an **eye toggle in its header**
that hides or reveals the whole room's items at once (a new bulk
`selectionSlice.setItemsHidden(ids, hidden)` — dedupe-safe). Hover-revealed like
the per-item actions; shows a solid accent EyeOff when the room is fully hidden.
Complements the per-item hide (Q15) and the name filter (Q24). Bulk action
unit-tested; verified the room's furniture disappears from the scene and the
header shows the hidden state.

## [Q24] Layers (Objects) panel name filter

The Objects/Layers tree gains a **name filter** at the top — type to keep only
matching items, with empty room groups dropped and remaining groups
force-expanded so matches are always visible regardless of collapsed state. The
footer shows "N of M objects" while filtering. Helps manage large scenes.
Verified: filtering "lamp" leaves only the Table/Floor lamps grouped by room.

## [Q23] Catalog sort control

The catalog grid gains a browse-time **Sort** dropdown — **Featured** (the
curated built-ins-then-CC0 order), **Name (A–Z)**, and **Size (small→large)**
(by footprint area; un-downloaded CC0 entries, which carry no footprint, sort
last). `sortCards` is pure and never mutates the source list; it's applied only
to real-category browsing — fuzzy search keeps its relevance ranking, and the
favourites/recent pseudo-categories keep their meaningful order. Changing the
sort resets to page 1. Verified: seating sorts 2-seat → 3-seat → Armchair →
Bar stool → Bench → Chaise lounge under A–Z.

## [Q22] Budget target with over/under indicator

The Shopping panel gains an optional **budget target** (SGD): type a goal and a
progress bar fills toward it, with a live read-out — "$X left · Y% of $target"
under budget (accent), or "Over by $X" over budget (red). State lives in
`featuresSlice.budgetTarget` and is persisted per-device via a new
`storage/budgetPrefs.ts` (wired into the bootstrap, fail-soft); it's not part of
a saved design. Clearing the field removes the target. Verified: a $3,000 target
against the $23k default flat shows "Over by $20,080" with a full red bar.

## [U1b] Units: cover the inspector + printable report

Follow-up to U1 so no surface shows mixed units. Added `formatDimsShort`
(compact furniture dimensions — centimetres in metric "60 × 45 cm", whole
inches in imperial "24″ × 18″") and routed it through the inspector's
footprint read-outs (parametric W×D×H + GLB/IKEA scale dimensions). The
printable report's per-room + total areas now respect the unit preference
(`buildReportHtml` takes an optional `UnitSystem`, passed from both the
desktop Tools menu and the mobile toolbar) — as does the Swap-with-similar
modal (current-item dimensions + the footprint-fit "+N cm/in" overflow badge).
The snap-grid size label stays metric (an editing-grid setting, not a
measurement read-out). Formatter unit-tested; the catalog-sort + budget-target
panels were also verified on a 390 px mobile viewport.

## [N4b] Per-room ceiling height

Architectural realism: the floor-plan editor's room inspector now has a
**per-room ceiling height** control (clamped 2.2–4 m) with a **"Match home"**
reset that drops the override. It models a dropped/false ceiling — walls stay
full height, exactly like the built-in 2.4 m bathrooms. `Ceiling.tsx` and
`MeasurementOverlay.tsx` now read the **live** per-room override from the
editable `floorPlan.rooms` (falling back to the `ROOMS` constant, then the
global height) instead of only the static `ROOMS` constants, so an edit takes
effect on the default flat immediately; the measurement overlay also surfaces
each room's height as a third label line. Verified: setting Living/Dining to
4.00 m renders that height in the overlay with no artifacts.

## [Q15c] No gizmo/outline over a hidden+selected item

Polish for the hide feature: a piece that's both selected and hidden no longer
shows its rotate gizmo or selection outline floating over the empty spot —
`RotateGizmo` and `SelectionOutline` now skip hidden items. Verified.

## [Q21b] Floor-plan editor: middle-drag panning

Completes canvas navigation on the open grid: **middle-mouse drag pans** the
canvas (alongside scroll + Ctrl/⌘-wheel zoom). The SVG pointer handler now also
ignores right-click (only the left button draws/selects), fixing a stray
right-click-draws quirk. Verified: a middle-drag scrolls the canvas by the drag
delta.

## [Q21] Floor-plan editor zoom

Completes the open-canvas rework: the editor now **zooms** via **− / +** buttons
(with a clickable % reset) and **Ctrl/⌘ + wheel** (zooms around the cursor, plain
wheel still pans). Zoom is a single `PX = basePX × zoom` multiplier, so every
coordinate (toPx + its inverse) stays consistent. Verified: + scales the canvas
3100→3720px at 120% with the plan intact.

## [Q20c] Reliable plan centring on editor open

The scroll-centre ran on a single rAF which could fire before the SVG laid out at
full size, leaving the plan scrolled off to the top-left. Now it retries each
frame until the canvas content exceeds the viewport, then centres — so the plan
is dependably centred when the editor opens. Verified (scroll lands on the plan
centre, not 0,0).

## [Q20b] Floor-plan editor: mobile canvas + bottom-sheet inspector

Follow-up to the open canvas (Q20): on mobile the inspector had an inline
`position: static` that defeated the responsive bottom-sheet CSS, so it sat as a
fixed 256px column squeezing the (now-large) canvas to a sliver. Made that inline
position **desktop-only** (`useIsMobile`) so on mobile the inspector becomes the
bottom sheet and the canvas spans full width with the plan visible/pannable.
Desktop column layout unchanged. Verified on a 390px viewport.

## [Q20] Open pannable grid canvas + cropped plan export

Two fixes from feedback: (1) the floor-plan editor was a tight square sized to
the plan, clipping anything drawn outside the current bounds — it's now an
**open, pannable grid canvas** (the plan sits centred with a large grid margin
on every side; `.plan-canvas` scrolls from top-left and the editor scroll-centres
the plan on open, with the SVG forced to its full size so CSS can't shrink it).
(2) **Export PNG** now crops to the plan's **bounding box + ~1 m padding** (a
viewBox window into the open canvas) so the image is just the plan, not the empty
grid. Verified: the full plan (incl. the previously-clipped Living/Dining) is
centred + reachable, and the export is a tight, styled plan image.

## [Q19] Export the 2D floor plan as a PNG

**Export PNG** in the floor-plan editor downloads the plan (walls, rooms, areas,
dimension labels) as an image to share/print. The SVG styles fills/strokes with
CSS custom properties that don't resolve in an `<img>`-rendered SVG, so
`exportPlanPng.ts` serializes the SVG, substitutes each `var(--…)` with its
resolved value, strips the trace backdrop, and rasterises to a 2× PNG on a
paper-filled canvas. Verified the full pipeline (serialize → vars resolved →
rasterise 820×620 → 178 KB PNG); fail-soft with a notification.

## [Q18] "Centre in room" context action

Right-click → **Centre in room** moves the piece to the centre of the room it's
in (handy for rugs, ceiling lights, dining tables) — using the active plan's
rooms (polygon centroid for free-form rooms, rect centre otherwise),
collision-checked (declines with a notice if the centre is occupied), shown only
when the piece is inside a room. Verified: a bedroom rug snaps to the room centre.

## [Q17] Resizable imports with real-world dimensions

GLB / uploaded / IKEA items' inspector **Scale** control now shows the resulting
footprint in **centimetres** (via `itemFootprint`, not a bare multiplier) and its
range is widened to **0.25×–3×** so a badly-scaled upload or IKEA import can be
corrected (was capped at ±50%). Verified: a 7ft pool table reads "≈ 213 × 118 cm".

## [Q16] Export the shopping list as CSV

Commercial procurement aid: the Budget panel gains an **Export CSV** button that
downloads the shopping list (Category, Item, Quantity, Unit price SGD, Line total
SGD + a grand-total footer) for a spreadsheet or to send to a supplier — honouring
the live-price toggle when on. The CSV builder is a pure, RFC-4180-escaping
module (`shoppingCsv.ts`, unit-tested incl. comma/quote escaping + SGD rounding);
verified in the harness (the default flat exports a 45-line CSV).

## [Q3] Drag-and-drop placement from the catalog (desktop)

Catalog cards are now **draggable straight into the 3D scene** (the headline
placement interaction in Planner5D/Coohom/Roomstyler). `onDragStart` arms
placement, `dragover` drives the live ghost (the same preview + red/green
validity the tap-to-place flow uses), and the drop commits at the ghost position
— declining + disarming on an invalid spot or a drop outside the canvas. It
**reuses the entire existing placement pipeline** (no parallel commit path);
the tap-to-place flow stays as the touch/fallback path (HTML5 drag is desktop
only). Verified end-to-end: a valid drop adds the item (66→67), an invalid one
declines.

## [Q15b] "Isolate" (hide others) context action

Builds on the hide feature (Q15): right-click → **Isolate (hide others)** hides
every item except the current selection so you can focus on one piece/area in a
busy flat; a **Show all (N hidden)** entry appears in the same menu (and the
Layers footer) to restore. New `isolateItems(keepIds)` action in `selectionSlice`.
Verified: isolating the sofa hides the other 65 items (shell intact).

## [Q15] Per-item hide/show (declutter) in the Layers panel

A working-view convenience competitors offer: each row in the **Layers** (Objects)
panel now has an **eye toggle** to hide/show that piece, plus a **"Show all (N
hidden)"** affordance in the footer. Hidden items are skipped by `FurnitureLayer`
but stay placed (still in the data, collision and selectable from the list), so
it's a visual declutter — not a delete. State is `hiddenItemIds` in
`selectionSlice` (session-only, not persisted — it's a transient working view).
Verified end-to-end: hiding the sofa removes it from the scene while the rug /
table / chairs stay and the item count holds at 66.

## [B5] Isolate CC0 texture-load failures across floors / walls / materials

Same class of bug as B4 but for **textured (CC0 DLC) finishes**: floor, wall, and
furniture-material sub-trees loaded textures via bare `<Suspense>`, so a 404/CORS
texture failure threw to the app-level boundary and blanked the scene. Added a
reusable `scene/SilentErrorBoundary` (renders nothing — or an optional fallback —
on error, retries when its `resetKey` changes) and wrapped every textured-finish
loader: `FurnitureMaterialLoader`, `RoomFloor`, `PlanRoomFloor`, `RoomShell`
walls, and both `WallSegment` faces. A failed finish now simply doesn't apply
(furniture keeps its procedural fallback; a surface stays untextured) instead of
crashing. Unit-tested (pass-through, fallback-on-error, resetKey recovery); full
suite green and the default flat still boots all 66 items with floors/walls
rendered.

## [B4] Isolate GLB load failures (one bad model no longer blanks the app)

Each GLB item was wrapped only in `<Suspense>`, which catches the *loading*
promise but not a *rejected* one — so a corrupt user upload or a 404'd remote
model threw past Suspense to the app-level error boundary and **blanked the
whole app**. Added a per-item `GltfErrorBoundary` (R3F class boundary) around
each model: on failure it renders a neutral placeholder box at the item's
footprint (still selectable/movable) while the rest of the scene stays live, and
it retries when the item's model url changes. Unit-tested (throwing child →
placeholder, not a crash; passes children through when fine); full suite green
and the default flat still boots all 66 items.

## [B3] Marquee selection: lasso-style overlap (not centre-only)

Marquee selection tested only each item's projected **centre** against the rect,
so dragging a box over most of a large piece missed it unless the box caught its
exact centre (TODO "Marquee strictness"). Now it projects the footprint's 4
corners + centre and selects when that screen **bounding box intersects** the
marquee — the intuitive lasso behaviour. The hit test is extracted to a pure
`selection/marqueeHit.ts` (`marqueeHitsScreenPoints`) and unit-tested (5 cases:
centre-cover, edge-overlap-with-centre-outside, marquee-inside-big-item,
fully-outside, empty). Full suite green.

## [Q13b] Tape measure: corner snapping + clicks over furniture

Two improvements to the tape tool: (1) **fix** — the floor click-plane sat below
furniture/walls, so clicks over a piece hit the piece instead of registering a
measurement point; it now uses the shared **priority raycast** (extracted to
`scene/raycastPriority.ts`, also used by the rotate gizmo) so a click anywhere
drops a floor point. (2) **corner snapping** — a clicked point snaps to the
nearest furniture footprint corner or wall endpoint within 30 cm
(`scene/tapeSnap.ts` `snapToNearest`, candidates from `obbCorners`/collision
walls), so you can measure exact furniture-to-wall gaps. Both pure helpers
unit-tested; clicks-over-furniture confirmed firing in the harness.

## [N8] Code-split the floor-plan editor out of the initial bundle

The `FloorPlanEditor` (with its AI/template/room-detect deps) was statically
imported and always mounted (rendering null until opened), so its code shipped
in the initial bundle. Switched it to `React.lazy` + `Suspense`, mounted only
while `floorPlanEditing` — the production build now emits a separate
`FloorPlanEditor` chunk (~31 kB / 10.5 kB gzip) and the main entry chunk drops
by ~30 kB, loaded on demand when the user opens the editor. Conditional mounting
is safe (the backdrop rehydrate is gated on `editing` and re-reads IDB per open).
Verified: build splits the chunk, and the editor still opens + renders fully
(plan + ceiling-height control) on first open.

## [Q14] "Select all of this type" context action

Complements the existing "Apply style to all of this type": right-clicking a
piece now offers **Select all of this type (N)** (shown when more than one
exists), selecting every item sharing the def so you can move/rotate/delete or
bulk-edit them together via the multi-select panel. Verified in the harness
(selecting one of three nightstands → all 3 selected).

## [Q13] Point-to-point tape measure tool

A staple of pro planners that was missing (the app only labelled room sizes).
New **Measure** mode (`scene/TapeMeasure.tsx` + `measurementsSlice`
`tapeMode`/`tapePoints`): toggled from the Tools menu (desktop + mobile parity),
it mounts a transparent floor plane that captures two clicks/taps and draws an
always-on-top amber ruler line with a live **distance label** and endpoint
markers; a rubber-band line follows the cursor after the first click, and a third
click starts a fresh measurement. Amber to stay distinct from the blue selection
UI. **Esc backs out of the tool** (before it falls through to deselect). Slice
logic unit-tested (toggle-clears, two-then-reset, clearTape); verified end-to-end
(a [2,2]→[5,6] measurement renders "5.00 m" on the ruler). Floor-plane only for
now (surface-snapping is a possible follow-up).

## [R5] Notify on a blocked report pop-up (no more silent failure)

Opening the printable report uses `window.open`; if a pop-up blocker intercepts
it, the call returned null and the action **failed silently** — the user clicked
Report and nothing happened. Both the desktop (`ToolsMenu`) and mobile
(`MobileToolbar`) report actions now surface an error notification ("Allow
pop-ups for this site, then open the report again.") instead.

## [N4] Adjustable ceiling height

`FloorPlan` already carried a persisted `ceilingHeight` (schema + custom-plan
`PlanShell` honoured it), but the **default flat** rendered from a fixed
`FLAT.ceilingHeight` constant, so the value was effectively unchangeable. Wired
the store's `floorPlan.ceilingHeight` into the default-flat render path —
`WallSegment` (wall extrusion), `Ceiling` (plane Y), `RoomShell` (room-editor
walls), and the `MeasurementOverlay` label height — and added a **Ceiling
height** control to the floor-plan editor's inspector (`updateFloorPlanMeta`,
clamped 2.2–4 m so glazing never clips). Per-room overrides (the dropped 2.4 m
bathroom ceilings) still win; the value persists with the design. Memoised
`WallSegment` re-renders correctly because its internal store subscription isn't
gated by the prop comparator. Verified end-to-end: default (2.6 m) unchanged,
raised to 3.2 m shows visibly taller walls meeting a risen ceiling with no gaps
or floating windows, and the inspector field round-trips the value.

## [N7b] Roving arrow-key navigation in the catalog grid

Completes catalog keyboard access (after N7a made cards focusable + activatable):
the grid now handles **arrow keys to move focus between cards** — ←/→ by one,
↑/↓ by a row. The column count is read from the live layout (cards sharing the
first row's `offsetTop`), so it adapts to the responsive 1/2/3-column
breakpoints rather than hard-coding 2. Only acts when a card itself holds focus,
leaving the nested heart/delete buttons' Tab order intact. Verified in the
harness (0 →→ 1 →↓ 3 →← 2 →↑ 0 with a 2-column layout).

## [Q12] "Straighten" context-menu action

A natural complement to the rotate gizmo's free (Shift-drag) rotation: the
right-click menu now offers **Straighten**, snapping a freely-turned piece to the
nearest right angle (square to the walls). It appears **only when the item is
off-axis** (rotation not a multiple of 90°) to avoid clutter, and is
collision-checked like the Rotate 90° action (a straighten that would overlap is
rejected). Verified in the harness (a rug at 0.5 rad snaps to 0; an off-axis
sofa whose straighten would collide is correctly left untouched).

## [Q11] Flush-to-wall snapping while dragging

A hallmark of pro planners (Planner5D/Coohom): furniture dragged near a wall now
**snaps flush** to it. New pure `collision/wallSnap.ts` (`wallSnapOffset`)
computes the per-axis offset to seat a footprint AABB against the nearest wall
face within ~12 cm — independently on X and Z, so dragging into a corner snaps to
both walls at once. Wired into `DragController`'s single-item drag after the
existing item-alignment snap, gated off when grid-snap is on (a deliberate
precise mode) and skipped for group drags. Uses the same door-aware collision
walls (won't snap across a doorway). Unit-tested (5 cases: face sides, radius
cutoff, corner, out-of-span, nearest-of-many) + verified end-to-end (a nightstand
dragged toward the bedroom wall lands flush, left edge on the wall face).

## [Q10] Per-room cost breakdown in the design report

The printable report grouped furniture only by category, so a client couldn't
see where the budget goes spatially. Added a **"Cost by room"** section: each
placed item is attributed to the plan room containing its footprint centre
(`pointInRoom`), summing item count + estimated cost per room, with an
"Unassigned" bucket for anything outside every room. The aggregation lives in a
pure, unit-tested `reportData.ts` (`furnitureCostByRoom`) and renders into the
existing report table styles; the section is omitted when nothing is placed.
Verified: 6 unit tests (attribution, Unassigned ordering, unknown-def skip, empty
layout, + a `buildReportHtml` integration assertion) and a live report render in
the harness.

## [N7a] Keyboard-accessible catalog cards

Catalog cards were `<div onClick>` — invisible to keyboard + screen-reader users
(no focus, no role, no key activation). Both `CatalogCard` and `RemoteCard` now
carry `role="button"`, `tabIndex={0}`, an `aria-label` ("Place …" / "Add …"),
and Enter/Space activation (arming placement / downloading), plus a
`:focus-visible` accent ring. `usePlacementDrag` accepts an optional event so a
keyboard activation (no cursor) arms the ghost at the viewport centre to follow
the next move. Mouse behaviour unchanged; verified in the harness (Tab focus →
Enter arms placement; focus ring renders).

## [N5] Persist the floor-plan trace backdrop

The reference photo/scan you trace walls over lived only in a session object URL
— lost on closing the editor *or* reloading. Now the **blob + calibration**
(scale `mPerPx`, opacity, world offset) persist to IDB (`backdropPersist.ts`, one
fixed slot via the existing `IdbAssetStore`) and **rehydrate when the editor
opens**, so a traced backdrop survives both. Loading a new image replaces the
slot; the ✕ button clears it; calibration edits are debounced before write; all
storage calls are fail-soft (never break the editor). The rehydrate effect is
gated on `editing` (the editor is always-mounted) and only loads when no
backdrop is present, avoiding duplicate object URLs. Persistence unit-tested (5
cases, fake-indexeddb); verified end-to-end in the harness (a backdrop written
as a "prior session" rehydrates on open — scale/opacity/clear controls appear).

## [B2] Dispose audit — fix leaked overlay geometries

Several scene overlays built three.js geometries with `new` inside `useMemo`
without disposing the replaced buffer. Unlike JSX `<boxGeometry/>` (which R3F
auto-disposes), these leak GPU memory every time their dependencies change —
**hot paths**: `SelectionOutline` (per selected item, on every resize/rotate),
`HoverHighlight` (every hover target), `AlignmentGuides` (every frame mid-drag),
the `DragController` snap highlight, and `GridOverlay` (on grid/plan change).
Each `EdgesGeometry(new BoxGeometry(...))` also leaked the throw-away source box
immediately. Added a shared `scene/geometryUtil.ts` (`boxEdges` — builds edges +
disposes the source box; `useDisposeGeometry` — disposes on dep-change/unmount)
and wired it through all five components. Visually verified the outline, hover,
rotate ring, and snap grid still render with no artifacts.

## [S4] Size cap on `.sofa.json` design import (DoS guard)

`importDesignFromFile` validated content (JSON parse → migrate → zod) but read
any file fully into memory first — a multi-GB or pathological file would block
the tab before validation. Added a **50 MB cap** (`MAX_DESIGN_FILE_BYTES`,
generously above any real design) checked **before** `file.text()`, throwing the
same friendly `DesignFileError`. Unit-tested (rejects oversized without reading).

## [N3+] Rotate gizmo extended to multi-selection (group rotate)

Generalised the rotate gizmo into one unified gesture over a *target set*: a
single item still spins about its own axis (snapping to absolute 15° marks),
while a **multi-selection** now shows one ring enclosing the whole group and
rotates every member **rigidly about the group centroid** — positions orbit the
pivot (`rotatePointAround`, mirrors the store's `groupRotate`) and each piece's
heading advances by the same snapped delta, with a signed degree readout. The
collision check ignores intra-selection pairs (rigid rotation preserves their
spacing) and tests against the rest + walls; an invalid release reverts the
whole set. Three new pure helpers (`rotatePointAround`, `snapDelta`,
`enclosingRadius`) are unit-tested (14 cases total). Verified end-to-end via
synthetic pointer drags: a single rug spins in place (0°→45°, position fixed),
and a two-item group orbits its centroid (both → 45°, positions rotated about
the pivot) and commits.

## [N3] Touch-friendly drag-to-rotate gizmo

Rotating a piece previously meant the keyboard-only <kbd>R</kbd> key (90° /
Shift+R 15°) — unusable on touch and coarse for fine angles. Added a
`RotateGizmo` drawn on the floor around the single selected item (orbit camera +
**select** tool, unlocked): a blue ring + front knob you **drag to spin** the
piece about its vertical axis, snapping to **15°** steps (hold Shift for free).
A live degree read-out follows the knob, the ring tints green/red via the same
`canPlace` check the item-drag uses, and an invalid release reverts to the
pre-gesture angle. The ring/knob meshes patch their `raycast` so the
always-on-top handle wins the pointer pick over taller furniture. Pure rotation
math (`rotateGizmoMath.ts`: relative-angle + snap, radius, degree wrap) is
extracted and unit-tested (8 cases); mounted in both the main and room-editor
scenes. Verified end-to-end in the harness by driving synthetic pointer events
(grab → live `MID 45` → committed `AFTER 45` on a noClip rug; collision revert
on a wall-blocked sofa) plus a clean idle 3/4 render.

## [R3] "Auto-saved …" indicator

Users had no signal their work was being persisted. Added `lastSavedAt` to the UI
slice, set on every successful auto-save (`autosave.ts`), and surfaced as a
reassuring **"Auto-saved just now / Xm ago"** line on the Versions panel's
current-layout card (with a compact relative-time formatter). Visually verified.

## [N9b] Board-and-batten panelling wall finishes

A popular modern wall treatment. Added a `batten` procedural pattern (flat
painted panel + evenly-spaced vertical raised battens with bevelled edges in the
height map; seamless) and three finishes — **Board & batten white / sage /
navy**. Wired into both `ProceduralPattern` unions + `PATTERN_FN`. Visually
verified (clear raised battens catching light, seamless across walls).

## [N2] Duplicate-in-array (row of copies)

A pro "array/clone" tool: the single-item inspector now has a **"Duplicate a row
of N"** control that places N−1 copies to the item's right (local +X), spaced by
its width, each collision-checked (stops at the first blocked slot). The original
+ copies share one groupId and commit in a single undo step. Verified
end-to-end (66→68 placing a row of 3 with two open slots).

## [N9] Microcement / concrete accent wall finishes

Polished-concrete (microcement) walls are a staple of modern interiors. Added
three wall finishes — **Microcement light / grey / charcoal** — reusing the
existing `concrete` procedural generator at a large (3 m) wall tiling scale.
Pure catalog data (no new generator). Visually verified.

## [N10] Inspector "Reset" props to defaults

Customised a parametric item (size/form/finish/colour) and want it back to
stock? The Properties section header now shows a **Reset** pill (only when the
item's props differ from the def's defaults) that restores
`defaultParamProps(def)` in one undoable step. Visually verified.

## [N1] Apply finish to all rooms

Re-finishing every room one-by-one is tedious. Added `setAllFloorFinish(id)` /
`setAllWallFinish(id)` store actions (apply one finish to every interior room,
skipping external spaces like the AC ledge, one undo step) and two
**"Apply floor/walls to all rooms"** buttons in the FinishPicker that propagate
the current room's finish. Unit-tested + visually verified.

## [Q9] Ctrl/⌘+A select-all

A basic editor expectation that was missing. A global Ctrl/⌘+A now selects every
placed item (orbit mode only, skipped while typing or in the room editor),
surfacing the multi-select align/distribute/group/delete panel. Added to the Help
modal shortcut list. Verified (selects 66/66 default items).

## [A2] Modal focus trap

Completes the Modal accessibility story (A1): Tab / Shift+Tab now cycle within
the dialog instead of escaping to the inert background, wrapping at the first/last
focusable element (and falling back to the panel when there are none). Esc-close
and the dialog role/focus behaviour are unchanged. Unit-tested.

## [RE4] Exposed-brick accent wall finishes

Exposed brick is a staple of interior-design tools and was missing. Added a
`brick` procedural pattern (`generators.ts`): running-bond rows offset by half a
brick, recessed mortar joints, per-brick value/warmth variation + fine speckle —
seamless (column count divides the tile, even row count so the half-offset
wraps). Three wall finishes: **Exposed brick** (red), **White-washed brick**,
**Charcoal brick**. Added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified — convincing brick with clean mortar joints, no seams.

## [A1] Modal accessibility — dialog role + focus management

The shared `Modal` primitive (used by Help, Share, Swap, Compass, Credits, …)
had ESC + backdrop close but no ARIA semantics or focus management. Added
`role="dialog"` + `aria-modal="true"` + `aria-label` (the title), and on open it
moves focus into the dialog, restoring it to the previously-focused element on
close — so keyboard/screen-reader users aren't stranded behind the modal. One
change improves every modal. Unit-tested.

## [B1] Fix misleading "cannot be undone" reset confirms

The File menu's "Empty" / "Default" reset confirmations warned the action
"cannot be undone" / "will be lost", but both `resetToEmpty` and `resetToDefault`
call `pushHistory()` first — they're fully undoable with Ctrl/⌘+Z. Corrected the
confirm copy in both the desktop FileMenu and the mobile toolbar to say so, so
users aren't scared off a reversible action.

## [C1] PWA manifest + theme-color + social/Apple meta

Commercial-readiness polish for `index.html`:
- A base-agnostic `public/manifest.webmanifest` (relative `start_url`/icon URLs so
  it works under the `/sofa-so-good/` deploy base) → the app is installable
  ("Add to Home Screen") with name, description, standalone display, and theme
  colour. No service worker (avoids offline-caching complexity/risk).
- `theme-color` meta (light/dark via `prefers-color-scheme`) tints the mobile
  browser/OS chrome to the Clay palette.
- Apple `mobile-web-app` meta (capable, title, status-bar) for iOS home-screen.
- Open Graph + Twitter `summary` meta so shared links (the app has a Share
  feature) get a proper title/description preview.
- Verified via `npm run build`: Vite rewrites the manifest/icon links to the base
  path and copies the manifest into `dist/`.

## [Q8] "Apply style to all of this type" (bulk restyle)

Styling each of N identical chairs by hand is tedious; pro tools (Coohom, Foyr)
let you propagate a material. Added an `applyStyleToAll(id)` store action that
copies one item's props (finish / colour / material / form) to every other
placed item of the same `defId` (skipping locked ones, one undo step, returns the
count). Surfaced as an **"Apply style to all of this type"** context-menu row
(shown only when ≥2 of that type exist) with a success toast. Unit-tested +
visually verified.

## [R4] Drop non-finite item transforms on load

`z.number()` admits `NaN`/`Infinity`, so a corrupt or hand-edited save (or any
future bug that wrote a bad transform) could feed `NaN` straight into the
Three.js matrices — broken/disappearing geometry, potentially a crash-loop on
reload. `applySerialized` now filters out items whose `position`/`rotation` isn't
finite (fixing the layout rather than discarding it wholesale). Unit-tested.

## [F1] Export / import a design as a file (portability + backup)

localStorage save slots are device- and browser-bound, so a design could never
leave the machine it was made on. Added **Export file** / **Import file** to the
Versions panel:

- `state/storage/designFile.ts` — `exportDesignToFile` serializes the current
  state and downloads a pretty-printed `.sofa.json` (filename-sanitized);
  `importDesignFromFile` reads + `migrate`s + `SerializedStateZ`-validates the
  file, throwing a typed `DesignFileError` with friendly messages (bad JSON,
  unsupported version, not-a-design). Same serialized shape as save slots, so it
  round-trips and older files migrate.
- Wired two buttons + a hidden file input in `VersionsPanel`; import applies the
  state, clears history, and toasts success/failure. Re-selecting the same file
  works (input value reset).
- Unit-tested (round-trip, error cases, download filename) + visually verified.

## [Q5] Wall-length labels on the 2D floor plan

Every pro floor planner annotates walls with their length; the editor only had
room-area labels + a transient draw readout. Added persistent per-wall length
labels (metres, at each wall midpoint nudged to its outward side, hidden for
sub-0.4 m stubs, accent-coloured when the wall is selected) plus a **Dims**
toggle in the editor header (default on). Visually verified — every wall now
shows its length alongside the room areas.

## [S1] BYO-key security audit + AI key-exfiltration guard

Audited bring-your-own-key storage (AI keys, Poly Pizza pack key). Findings:
keys live only in `localStorage`, are sent only to their configured provider via
request headers, are never logged to the console, and never enter the save
schema / autosave / export — clean. One defense-in-depth gap fixed: the Replicate
poll loop attached the API key to a URL taken from the provider response
(`pred.urls.get`); a tampered response could have sent the key to an arbitrary
host. Added `safePollUrl`, which only trusts a poll URL whose origin matches
`api.replicate.com` and otherwise falls back to the canonical URL. Unit-tested.

## [Q4] Wire the `?` keyboard shortcut to open Help

The Help & shortcuts modal advertised `?` as its open binding, but no global
handler existed — pressing `?` did nothing. Added a global `?` (Shift+/) handler
in `App.tsx` alongside the ⌘K one: toggles the Help modal, guarded by
`isEditableTarget` so it never hijacks a literal "?" typed into an input, and
ignores modifier combos. Visually verified (pressing `?` opens the modal).

## [RE3] Basketweave parquet floor finish

A premium floor look common in interior-design tools, missing here (only straight
planks existed). Added a `parquet` procedural pattern
(`materials/procedural/generators.ts`): a seamless grid of square blocks each
holding 4 parallel wood planks, with block orientation alternating like a
checkerboard — the classic basketweave parquet. Reuses the wood shading (warped
latewood bands, per-board tint, recessed plank/block grooves), oriented per
block. Two catalog finishes — **Oak parquet** + **Walnut parquet** (`floor-parquet-*`,
tiling at 0.5 m). Pattern added to both `ProceduralPattern` unions + `PATTERN_FN`.
Visually verified (renders as a convincing basketweave, seamless across rooms).
Also cleaned a pre-existing `noAssignInExpressions` lint finding in the same file.

## [Q6] Saved camera views (bookmarks)

A flagship navigation QOL feature from pro tools (SketchUp scenes, Coohom
viewpoints): bookmark a favourite angle of the flat and fly back to it.

- `state/slices/cameraViewsSlice.ts` — named `SavedView` (pos + look-at target),
  capped (12), persisted to `localStorage` (`hdb_camera_views`, device-global,
  out of the save schema). `saveCurrentView` snapshots the live pose; `applyView`
  bumps `applyViewNonce`/`pendingViewPose` and forces orbit mode; plus
  delete/rename.
- The live orbit pose is published each frame into a `cameraPose` singleton
  (`scene/cameras/cameraForward.ts`) by `<OrbitCamera>`, which also consumes
  `applyViewNonce` to **smoothly fly** (0.6 s smoothstep) to a saved pose.
- UI: a modular `SavedViewsSection` in the desktop **View** menu (Save current
  view + per-view go/delete rows) and full **mobile** parity in the View
  accordion (44px touch targets, delete buttons). Themed via new
  `.saved-view-*` / `.m-saved-view-*` CSS.
- Unit-tested (slice) + visually verified: saved two views, snapped to top-down,
  applied a saved view and watched the camera fly back to the 3/4 overview.

## [Q2] "Recent" catalog row for fast re-placement

A staple of every mainstream interior-design app (Planner5D, Coohom, IKEA
Kreativ) — quick access to the items you just used. Added:

- `state/slices/recentSlice.ts` — an ordered, deduped, capped (24) list of
  recently-placed catalog ids, persisted to `localStorage` (`hdb_recent_items`),
  kept out of the save schema/autosave (per-device convenience).
- Hooked from `itemsSlice.addItem`, the single path real user placements,
  duplicates and pastes flow through — the boot seed + set drops use `setItems`,
  so the list stays meaningfully "recently used".
- A **clock "Recent" chip** in `CategoryTabs` (shown only when non-empty, right
  after favourites) and a resolved `recent` list on `useUnifiedCatalog`
  (local-def-only, newest first, orphans dropped). Empty-state copy added.
- Unit-tested; visually verified in the running app (placing an armchair + side
  table surfaces them newest-first under the Recent chip).

## [R2] Surface auto-save failures (localStorage quota)

Auto-save errors were caught but silently swallowed — a user whose browser
storage filled up could keep editing and lose everything on reload with no
warning. Now:

- `startAutosave` gained an `onRecover` hook (fires when a write succeeds after a
  prior failure) alongside the existing `onError`.
- `bootstrap.ts` wires both to a single deduped error notification ("Couldn't
  auto-save", with a quota-specific message) that auto-clears once saving resumes.
- Confirmed the appearance/quality/editor/user-style pref writers already guard
  their `setItem` calls, so no silent throw escapes a store subscriber.
- New `autosave.test.ts` covers the error → recover flow.

## [R1] React error boundary — no more white-screen crashes

A render/lifecycle throw anywhere in the React tree previously blanked the whole
app. Added a modular `src/ui/ErrorBoundary.tsx`:

- **Top-level boundary** (in `main.tsx`) wraps the entire app with a themed
  recovery card (Try again / Reload / Reset layout & reload), collapsible
  technical details, and console diagnostics (no remote telemetry).
- **Scene-scoped boundary** wraps `<Scene>`/`<RoomEditorScene>` so a 3D/WebGL
  render crash keeps the toolbar and panels usable instead of taking the page down.
- The "Reset layout & reload" escape-hatch clears only the boot-restored
  `sofa-so-good:save:autosave` slot (named saves + appearance/onboarding prefs
  are preserved), so a corrupt autosave can't crash-loop the app.
- Supports a custom `fallback` renderer for embedding in other surfaces.
- Unit-tested (`ErrorBoundary.test.tsx`): renders children, catches throws,
  shows scope + details, custom fallback, reset callback.
