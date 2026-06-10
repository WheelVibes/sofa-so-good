# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress. Completed work lives in `CHANGELOG.md`
(not here — this file is the open backlog only).

---

## ⭐⭐⭐ COMMERCIAL-READINESS PROGRAM (2026-06-10, ongoing — primary directive)

**Mandate (from the user):** systematically analyze ALL aspects of the codebase and continuously
improve it — performance/optimization, scalability, reliability, realism, bug fixes, security, clearing
`TODO.md`, and new functionality/aesthetic/QOL features informed by researching other interior-design
apps — until the app **surpasses every interior-design app on the market and is commercial-ready**.
Autonomy granted for large features incl. architectural revamps. Loop continuously; when out of ideas,
do more research. **Do not stop until the user says so.**

**Hard rules for every item:** one focused commit per item; log it in `CHANGELOG.md`; keep code modular
+ flexible + extensible (no monolithic files); handle edge cases; no functional bugs or visual artifacts;
viewport-responsive with desktop **and** mobile/touch parity; licensed/non-redistributable additions are
**dev-gated**, CC0/unlicensed ship in prod too; run `npm test` + `tsc` + `biome` before each commit;
visually verify any app (non-docs/test) change via `scripts/shot.mjs` and review the pixels.

**How to resume after a context clear:** read this section + `CHANGELOG.md` (newest first) to see what
shipped, then pick the next unchecked item below (highest priority first). Working branch:
`claude/codebase-analysis-optimization-QKCK6`. Use parallel read-only subagents for audits/research and
worktree subagents for independent build slices (note: worktree agents branch from an older base — prefer
having them produce self-contained new files you integrate, or 3-way merge carefully).

### Shipped in this program so far (see CHANGELOG for detail)
C147 Design Score panel · C148 exhaustive HDB+condo templates (→18 w/ C161) · C149 PR3c material realism
(sheen/clearcoat/tier-gated glass) · C150 instancing (4 primitives) · C151 instanced City backdrop ·
C152 cabinet glass · C153 Smart-Start furnish ANY plan · C154 Design Score in report · C155 score
click-to-select offenders · C156 instanced Park/Hills · C157 Smart-Start palette on custom plans · C158
richer furnish kits (study/dining/powder/balcony) · C159 accessibility check + report · C160 in-app
Accessibility panel · C161 Condo Studio + 4-Bedroom templates · C162 renovation cost estimate · C163
Studio infinity-cove backdrop.

### Backlog — being deepened by a 4-front audit (perf, reliability/bugs, security, competitor research)
Audit findings get appended here as discrete `[ ]` items with `file:line` + fix. Until they land, the
standing themed backlog below + the existing sections further down hold the open work. **Prioritization:**
(1) correctness/security bugs → (2) reliability/edge-cases + mobile parity → (3) performance/memory →
(4) realism + high-value features → (5) QOL/aesthetic polish.

#### Realism & rendering (photorealism — surpass-the-market)
- [ ] R-HDRI. Real HDRI environment lighting option (CC0 Poly Haven .hdr) for High/Maximum — image-based
  lighting + reflections beyond the procedural probe; dev-gate only if the asset isn't CC0 (Poly Haven is CC0 → prod-ok).
- [ ] R-PANO. 360° panorama export (equirectangular render) for VR/▢ sharing — a pro presentation deliverable.
- [ ] R-SSAO/PR4. Soft-shadow (PCSS/VSM) + contact-shadow refinement + grounding AO on all tiers (needs real-GPU verify).
- [ ] R-CURTAIN. Window glass tint colouring the sun shaft + curtains/blinds affecting cast light (TODO.md L1/N6).
- [ ] R-DAYNIGHT. One-click day/golden-hour/night lighting presets (quick mood switch competitors have).

#### Content & catalog (variety — surpass-the-market)
- [x] C-MAT. Curated "Designer picks" one-tap floor/wall finishes row in the finish picker (C202,
  `materials/designerPicks.ts`, `designerPicks` flag).
- [ ] C-PLANTS/DECOR. More CC0 decor/plants/art variety; ensure category coverage is exhaustive.
- [ ] C-WARDROBE. Wardrobe/closet + vanity configurators (parametric, like the cabinet engine) — kitchen done, extend.

#### Productivity / QOL (match + surpass)
- [ ] Q-MULTILEVEL. Multi-storey / multi-level plans (maisonette upper floor, landed 2nd storey, condo loft) — architectural.
- [x] Q-CEILING / F12. Ceiling design — per-room tray/coffered/dropped + cove glow (C203/C204,
  `apartment/ceiling/`, `ceilingDesign` flag). Real-GPU walk-mode appearance pass still TODO.
- [x] Q-COPYSTYLE. Copy-style / paste-appearance between items + bulk recolour by category (C198, F17).
- [x] Q-MOODBOARD (C175). Moodboard / style board export from the design (decor + palette).
- [ ] Q-3DEXPORT. Whole-scene glTF/GLB + USDZ (AR) export (deferred — needs worker-streamed export; verify on real GPU).

#### Commerce / collaboration
- [ ] X-SHOP. Shoppable list polish: per-retailer grouping, live SG prices beyond IKEA (Courts/HipVan/Castlery).
- [ ] X-PRESENT. Client presentation mode / shareable interactive 3D link (planShare exists — extend to full design).

(Competitor-research agent will expand/replace these with cited, prioritized items.)

### AUDIT FINDINGS (2026-06-10) — execute these first, one commit each
**Reliability/bugs (high→low):**
- [x] B1 (C164). `schema.ts` `PlanRoomZ` omits `polygon` → polygon/Auto-room rooms revert to
  their bounding rect on save/load. Add `polygon` to the schema (optional) + round-trip test. `state/schema.ts:145`.
- [x] B2 (C166). ⌘K command palette + MobileToolbar don't fully close the newer `.aux` panels
  (daylight/elevations/designScore/accessibility) → stacked overlapping panels. Extract one shared
  `closeAllAuxPanels(state)` and use it in ToolsMenu, MobileToolbar, CommandPalette. `ui/CommandPalette.tsx:118`, `ui/toolbar/MobileToolbar.tsx:197`.
- [x] B3 (C177). MobileToolbar Tools section is missing Daylight, Design score,
  Accessibility, Drawings — desktop-only. Add them (same feature gates) via the shared closeAux. `ui/toolbar/MobileToolbar.tsx:661`.
- [x] B4 (C172). Guard `Array.isArray` for plan members inside the pure cores so every caller is safe +
  drop duplicated outer guards: `daylight.ts` (walls/openings/rooms), `accessibility.ts` (rooms),
  `planGeometry.ts` (walls/openings).
- [x] B5 (C173). Report's `buildDesignScore` call omits `{walls}` → recomputes with doors-closed, can
  disagree with the panel. Pass `{ walls: clipWalls }`. `ui/report.ts:326`.
- [x] B6 (C174). `roomPolygon` L-shape outline only correct for a south-edge extension; wrong/
  self-intersecting for other offsets → wrong floor render + containment. `floorplan/types.ts:111`.
- [x] B7 (C187). After undo/redo/jump, prune `selectedItemId`/`selectedItemIds` to ids still present. `historySlice.ts`.
- [x] B8 (C188). `.aux` panels use inline `width:360` (mobile override via `!important`) — move to a class.

**Security (no high-sev; defense-in-depth):**
- [x] S1 (C165). SVG builders `elevationSvg.ts`/`reportPlanSvg.ts`/`lightingPlanSvg.ts` `esc` only escapes
  `&<>` not quotes, yet render via `dangerouslySetInnerHTML` — latent XSS if a string ever lands in an
  attribute. Make them the full 5-char esc.
- [x] S2 (C199). `classifyVisionEndpoint` refuses to POST the bearer key over plaintext HTTP to a remote
  host and flags non-allowlisted HTTPS hosts; the editor warns + requires typed confirmation before sending.
- [x] S3 (C183). Validate report finish swatch against a hex/rgb pattern before emitting into `style=`.

**Perf (from prod build):**
- [ ] P-CHUNK. Prod build chunks are large (three 1.16 MB, index 932 KB, vendor 870 KB, EffectsImpl 308 KB).
  Improve code-splitting/manual chunks; lazy-load heavy/rare paths. (Verify with `npm run build` sizes.)

**Perf/scalability/memory (audit, impact-first):**
- [x] PERF1 (C195) (M, big). `useCatalog` now memoised on its input slices (was rebuilding the whole merged
  catalog on every consumer render — incl. FurnitureLayer on every drag pointermove). In-canvas overlays
  (SelectionOutline / HoverHighlight / RotateGizmo / ClearanceOverlay / PlacementGhost) switched to the
  non-reactive `useCatalogGetter` so catalog churn (bulk import) never re-renders the R3F tree.
- [x] PERF2 (C178) (S, big). `DesignScorePanel` (and check `ClearanceOverlay`) rerun O(n²) scans every
  pointermove while open — gate recompute on `!draggingItemId` / debounce 250–400ms. `ui/DesignScorePanel.tsx:44`.
- [x] PERF3 (C193) (S). `Lighting` tween target memoized — no per-frame object/array alloc when settled;
  only the tone-mapping/exposure write stays per-frame. `scene/lighting/Lighting.tsx`.
- [x] PERF4 (C194) (S–M). `FurnitureLights` rebuild+sort gated on camera-move (>0.2 m) / items-change.
  `scene/lighting/FurnitureLights.tsx`.
- [x] PERF5 (C181) (M). Lazy-load rarely-opened modals/panels (ShareModal, VersionsPanel, HistoryPanel,
  ElevationPanel, DesignScorePanel, AccessibilityPanel, DaylightPanel, SwapModal, SmartStartWizard,
  ProductTour) — trims boot bundle. `App.tsx:27`.
- [~] PERF6 (C196 DPR done) (M). Canvas DPR ceiling now driven by `useQuality().dprMax` (Performance → 1).
  Remaining: `antialias` + `preserveDrawingBuffer` are WebGL context-creation attributes — can't toggle
  reactively without recreating the context (flash + real-GPU verify); deferred. `scene/Scene.tsx`.
- [x] PERF7 (C179) (M). Broadphase (spatial grid / sweep-prune) for `findItemOverlaps`/`findNarrowGaps`/
  `findWallClips` (O(n²) today) for 100s-of-items scale; compute scans once + share between report + designScore.
- [x] PERF8 (C192) (M). `DragController.onMove` indexes items into id→item Maps once per move (was repeated
  O(n) `.find` scans, incl. an O(n·m) collision loop). `scene/DragController.tsx`.
- [~] PERF9 (C185 thumbCache LRU done; 256² + worker still TODO) (S). Procedural texture default 512² on main thread — drop to 256² where quality allows / OffscreenCanvas worker; bound `thumbCache` (LRU). `materials/procedural/generators.ts`.
- [x] PERF10 (C182) (S). Reuse a single mutable `PumpInputs` in `RenderPump` rAF instead of allocating per frame. `scene/RenderPump.tsx:60`.

### COMPETITOR-RESEARCH BACKLOG (2026-06-10) — "surpass the market" features
Researched vs Coohom/Planner5D/IKEA Kreativ/Homestyler/RoomSketcher/Cedreo/Live Home 3D/Foyr/Spacejoy/
Modsy/Roomle/Enscape + SG (Qanvast/HomeRenoGuru/Hometrust). [PROD] = CC0/MIT/pure-code; [DEV] = licensed/
BYO-key. Value/Effort S/M/L. (Add Roomstyler + Spoak to REFERENCES.md.)

**Photoreal/render (biggest gap):**
- [ ] F1 [PROD] GPU path-traced "HQ render" still — `three-gpu-pathtracer`, progressive→2-4K, denoise,
  download; High/Max only + raster fallback. Marquee feature. V:L E:M-L. (real-GPU verify deferred)
- [ ] F2 [PROD] 360° panorama render (equirect cube-cam capture) + drag-to-look viewer + export. V:L E:M.
- [ ] F3 [PROD] HDRI environment library (Poly Haven CC0 .hdr) for IBL+backdrop (clear/overcast/golden/
  studio). V:M E:S-M. (sandbox can't fetch — wire + dev-verify; CC0 so prod-ok.)
- [ ] F4 [PROD] Environment-coupled render presets (sun+HDRI+exposure) + A/B compare. V:M E:S.
- [ ] F5 [PROD] DoF + photographic camera (focal length/f-stop) on render path. V:M E:S-M.
- [ ] F6 [PROD] WebGPU SSGI experimental Maximum-only toggle + WebGL fallback. V:M E:L.

**Content/catalog:**
- [ ] F7 [PROD] Curtains/blinds window-treatment system (window-aware parametric). V:M E:M.
- [x] F8 (C171) [PROD] Staircase primitive (straight/L/U/spiral) — needed by maisonette/penthouse/landed. V:M E:M.
- [ ] F9 [PROD] Curated CC0 decor/plant/styling bundles (Poly Haven/Poly Pizza) so designs look styled. V:M E:S.
- [ ] F10 [PROD] Wardrobe/closet configurator (extend cabinet engine: rails/shelves/drawers). V:M E:M.
- [ ] F11 [DEV] Pluggable brand-catalog importer beyond IKEA (licensing → dev-gate). V:L E:L.
- [x] F12 [PROD] Ceiling design — tray/coffered/dropped + cove glow per room (C203/C204, see Q-CEILING).

**Productivity/QOL:**
- [ ] F13 [PROD] Multi-floor / multi-storey levels (schema+camera+stairs) — unblocks existing templates. V:L E:L.
- [x] F14 [PROD] Save selection as a custom Set — `userSetsSlice` (centroid-relative capture, localStorage)
  + `dropUserSet`; "My sets" in Arrange menu (desktop + mobile), `userSets` flag (C200).
- [x] F15 (C169) [PROD] Auto-dimension whole plan (continuous running dimension strings, SVG). V:M E:M.
- [x] F16 [PROD] Magic suggestions — per-room "what to add" hints in Design Score (C190, `suggestions` flag).
- [x] F17 [PROD] Copy/paste appearance (look-only transfer) + recolour-by-category (C198,
  `furniture/appearanceProps.ts` + `state/slices/styleClipboardSlice.ts`, inspector buttons, `copyAppearance` flag).
- [x] F18 [PROD] Standard mount-height presets — one-tap chips under the `mountHeight` slider (C197,
  `furniture/mountHeightPresets.ts` + inspector `MountHeightPresets`, `mountHeights` flag).

**Collaboration/commerce/presentation:**
- [x] F19 (C175) [PROD] Moodboard / style-board builder (images+product tiles+palette, export). V:M E:M.
- [ ] F20 [PROD] Shoppable design export (clickable buy-list, totals by retailer; brand links dev-gated). V:M E:S-M.
- [ ] F21 [PROD] WebXR VR walkthrough (`@react-three/xr` over walk mode). V:M E:M.
- [ ] F22 [PROD] Mobile AR "view in your room" (`<model-viewer>` Quick Look/Scene Viewer). V:L E:M.
- [ ] F23 [PROD] Client presentation mode (saved views + panoramas + notes slideshow). V:M E:M.
- [ ] F24 [PROD-partial] Pinned comments on a shared design (live presence = backend, defer). V:M E:L.

**AI (BYO-key):**
- [ ] F25 [PROD] Text-to-room brief → Smart-Start preset+budget+palette → `furnishPlanItems`. V:L E:M.
- [ ] F26 [DEV] Photo-to-3D room replica (vision/photogrammetry, BYO-key cloud). V:L E:L.
- [ ] F27 [PROD] "Redesign this render" style-variant explorer (extend Share i2i). V:M E:S.
- [x] F28 (C176) [PROD] AI palette/finish recommender from an inspiration image (client-side color extract). V:M E:S-M.

**2D/CAD outputs:**
- [x] F29 [PROD] Electrical/power+data plan + schedule in the drawing set (C191, `electricalPlan` flag).
- [x] F30 (C184) [PROD] Demolition/hacking + new-wall plan (diff vs template) → feeds reno estimate. V:M E:M.
- [x] F31 (C170) [PROD] DXF plan export (client-side DXF writer from plan polygons). V:M E:M.
- [x] F32 (C186) [PROD] Cross-section drawing (reuse elevation core along a cut line). V:M E:M.

**SG renovation workflow (differentiator):**
- [x] F33 (C180) [PROD] Quote-ready BOQ handoff export (FF&E+reno+drawings; carpentry in linear-feet). V:M E:M.
- [x] F34 (C167) [PROD] HDB compliance hints (structural/wet-area/permit advisories on edits). V:M E:S-M.
- [x] F35 (C168) [PROD] Renovation timeline/phase planner (Gantt-ish, pure data/SVG). V:S-M E:S.

## Performance / scalability
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders (needs profiling on real hardware to justify).
- [~] P3. More **instancing** for repeat-geometry primitives. Done: bookshelf + crib (earlier) and
  RoomDivider / CubeShelf / FeatureWall / ToyStorage (C150, via shared `slatLayout.ts`). Remaining:
  rotation-capable instancing for venetian blinds / drying-rack slats (needs a rotation-aware
  `InstancedBoxes` sibling — deferred until a consumer justifies it).

## Clearance / validation (panel now: door-swing + overlaps + wall-clip + walkways, C111/C112/C145)
- [x] CL2. Walkway-width check (`findNarrowGaps`, item↔item + item↔wall, band 0.4–0.9 m) — C145.
- [x] Daylight & ventilation check (`buildDaylightReport`, glazing/openable vs floor area) — C144.

## Lighting / GPU-heavy realism (deferred under the "focus on non-GPU" constraint; need a focused real-GPU session)
- [ ] L1/RE2/N6. **Lighting realism** — window-glass tint colouring the sun shaft + inter-room light bleed through open doors. Complex multi-file scene change; conflicts with the deliberate no-shadow fixture-light perf design, so needs a perf-aware approach.
- [ ] R10. **Faster built-in PBR render path** — one-click high-quality still (local accumulation/denoise to match Coohom's "render in seconds"); investigate progressive path-trace via the existing AccumulativeShadows + a higher-sample pass.

## ⭐⭐ MAJOR (user-prioritised 2026-06-10): LARGE verifiable features via research→plan→build
Prioritise large, verifiable features over small/QOL. Research-grounded (REFERENCES.md + web).

### DESIGN SCORE — shipped C147 (Coohom/Planner-5D-style live feedback)
Pure `analysis/designScore.ts` → weighted 0–100 + A–F grade over clearance/furnishing/circulation/
daylight/lighting, each with actionable fixes; `DesignScorePanel` (`.aux` dial + bars). Reuses every
existing pure check + 2 new heuristics (furnishing coverage, per-room emitter coverage). 9 tests.
- [x] DS2: report-section integration — design score + grade + per-category bars in the printable
  report (C154). Remaining (optional): in-panel per-category drill-down that click-selects the offenders.

### EXHAUSTIVE FLOOR PLANS — shipped C148 (HDB + condominium + landed, 16 templates)
`floorplan/templates.ts` now ships HDB 2/3/4/5-room + Exec/3Gen/Jumbo, condo 1-bed/1+study/2/3-bed/
penthouse, terrace (`docs/research/{hdb,condo}-floor-plans.md`); generalised overlap/bounds/opening
test over all templates.
- [x] FP-furnish: auto-arranger (`arrangeAllRoomsForPlan`) + **Smart Start** now work on custom plans
  — C153 `furnishPlanItems` seeds a per-room kit + arranges it, so every template furnishes in one click.
- [x] FP-palette: Smart Start now applies the preset floor/wall palette to a custom plan too (C157).
- [ ] FP-next: route **interactive** per-room finish editing (the 3D FinishPicker / drag-apply) through
  the active plan — the `finishes` slice is still `RoomId`-keyed, so in-editor finish changes don't
  render for custom-plan rooms (whose floors live on `PlanRoom.floor`, editable in the 2D inspector).
  Smart Start + the 2D inspector cover the common cases, so this is polish.

### LIGHTING PLAN (reflected-ceiling-style) — next large feature (research: Chief Architect/RoomSketcher RCP + lighting schedules)
Derive from the existing `LIGHT_EMITTERS` registry (every placed light's height/intensity/distance/
offset) — no new placement UI. Pure-core + 2D SVG + report, fully verifiable like elevations.
- [x] LP1. Pure `src/lighting2d/lightingPlan.ts` + 5 tests — shipped C135. ← LP2 NEXT
- [x] LP2. Lighting-plan SVG renderer (walls + coverage + glyphs) — shipped C136.
- [x] LP3. Report integration: lighting plan SVG + schedule table — shipped C137.
- [x] LP4. In-app lighting view — unified "Drawings" panel (Elevations | Lighting) — shipped C138.
- [ ] LP5. (optional) 3D coverage overlay on the floor; per-room lux estimate.

### DRAWING SET (paginated plan set) — shipped C141 (cover + plan + elevations + lighting + FF&E sheets).

### Interior WALL ELEVATIONS (a pro deliverable competitors have; we only have a top-down plan)
Why: Chief Architect / Cedreo / RoomSketcher / NKBA — vertical "side-on" drawings per wall showing
cabinet/fixture/backsplash heights + openings; used for permits, installers, client sign-off.
**Fully verifiable here** (pure 2D geometry → SVG; unit-testable + screenshottable; no GPU).
Plan-wall-based so default + custom plans work uniformly. Phases (each its own commit):
- [x] EL1. Pure `src/elevation/projectElevation.ts` + 9 tests — shipped C129. ← EL2 NEXT
- [x] EL2. SVG renderer (C130) + Elevations panel in Tools (C131) — verified desktop + mobile. ← EL3 NEXT
- [x] EL3. Dimensions — overall width/height + opening sill heights — shipped C132. ← EL4 NEXT
- [x] EL4. Report integration — "Wall elevations" section in the printable report — shipped C133.
- [~] EL5. Per-item width dims shipped C140. Remaining polish: door leaf/arc symbol, label
  de-overlap on very narrow adjacent items.

## ⭐ MAJOR: Ultra photo-realism (user-requested 2026-06-10) — phased, each its own commit
Goal: showroom-grade fidelity. Stack today: ACESFilmic tone-map (Scene.tsx gl), per-frame
exposure/warmth (`look.ts grade`), IBL probe (`SceneEnvironment`), PCFSoft sun shadows, post stack
(N8AO+Bloom+HueSat+Vignette+SMAA on high/maximum). Verification caveat: subtle GPU effects render
weakly under the headless **software-GL** harness — tone curve / vignette / grain DO show; SSR / DoF
/ TAA do not. Tune-heavy steps need a real-GPU pass (consistent with existing R10/L1 notes).
- [x] PR1. Selectable tone-mapping Look (Filmic/AgX/Neutral) — C114. PR1b: Exposure slider — C123.
- [x] PR2. Cinematic post stack (Maximum: full-res AO + film grain + chromatic aberration) — C117.
  (User verifies subtle grading in prod; DoF/TiltShift deferred to PR4-adjacent.)
- [x] PR3. **Material realism pass**. PR3a (C118): tier-driven IBL probe resolution. PR3b (C127):
  envMapIntensity boost on glossy finishes (stone/leather/velvet). PR3c (C149): sheen (velvet/satin/
  leather) + clearcoat (gloss/stone) via `MeshPhysicalMaterial` + tier-gated glass transmission
  (`materialRealism.ts` + `getGlassMaterial`/`GlassMaterial.tsx`) + sharper normals. Real-GPU visual
  verify of transmission/clearcoat/sheen still deferred (software-GL harness can't show them).
- [ ] PR4. **Soft-shadow upgrade** (PCSS-ish / VSM, contact-shadow refinement).
- [ ] PR5. **Local progressive render** (one-click high-quality still via AccumulativeShadows +
  higher samples) — supersedes/ą merges R10.

## ⭐ MAJOR: GLB editor pro tooling (user-requested 2026-06-10) — phased, each its own commit
Today (`GlbDesignerDialog` + `furniture/glbEdit/`): compose-from-shapes, scale-a-source-GLB,
per-mesh recolour/hide. More verifiable in software-GL than PRx (deterministic geometry/UI).
- [x] GE1. More primitives — cone/pyramid/capsule/torus shipped C115 (wedge/plane deferred).
- [x] GE1b. Wedge primitive — shipped C124. (Plane = a thin box; tube = a torus — both already covered.)
- [~] GE2. Per-part transform. GE2a (C121): numeric rotation inputs. TODO GE2b: a drag gizmo
  (drei TransformControls) for move/rotate/scale in the preview.
- [x] GE3. Per-part PBR — roughness/metalness (C119) + glow/opacity (C120). TODO GE3c: texture pick.
- [x] GE4. "Update original" — overwrite a source asset in place — shipped C126 (full export
  round-trip pending real-env verification).
- [x] GE6. Duplicate a part (clone transform + material) — shipped C122.
- [x] GE7. Mirror a part across the centre — shipped C125.
- [ ] GE5. **CSG boolean ops** (union/subtract/intersect) via three-bvh-csg or similar.

## Feature-flag retrofit (infra shipped: registry + resolver + admin + panel + desktop/⌘K gating)

## Features (larger)
- [~] K1b. **Cabinet engine — next steps**: sink (C42), hob (C43), "Kitchen run" set + wall-mount fix (C44), handle styles (C46), corner unit (C59), worktop materials — marble/concrete/wood across cabinet-base + KitchenIsland + KitchenCounter (C94/C95), wall-aware "Arrange as run" — flush + butted along the nearest wall (C96) shipped.
- [~] Q31. **Drag a material swatch onto a surface in 3D**. Part 1 shipped (C39): tested `finishDrop` resolver + draggable swatches + drop onto Objects-list rows. TODO part 2: the 3D-canvas raycast drop onto floor/wall/item (needs manual/GPU verify).
- [ ] Export the design as a 3D model (.glb). Prototyped a `GlbExportController` (GLTFExporter over the live scene) but reverted: full-scene export with Draco geometry + dozens of embedded textures doesn't complete in the headless software-GL verify env, so it can't be screenshot-verified here. Needs a real-GPU verify pass + likely a furniture-only/worker-streamed export to bound cost.
- [ ] T3. Per-LOD multi-tier generation for uploads.
- [~] T2. Crown-molding revisit + kitchen/bath template polish (herringbone floor already shipped).
- [~] GLB Asset Designer (C47/C48): compose-from-shapes, scale-a-source-GLB, per-mesh recolour/hide all shipped. TODO: transform/move parts via gizmo; save edits back over an existing asset (vs always new).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.
- Keep CHANGELOG/TASKS entries to a 2-line max.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
