# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress. Completed work lives in `CHANGELOG.md`
(not here — this file is the open backlog only).

## Performance / scalability
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders (needs profiling on real hardware to justify).
- [ ] P3. More **instancing** for repeat-geometry primitives where profiling justifies.

## Clearance / validation (panel now: door-swing + item overlaps + wall-clip, C111/C112)
- [ ] CL2. **True walkway-width check** — the panel subtitle promises "HDB 90 cm walkways" but no
  check measures circulation gaps between pieces yet. Needs careful design (corridor sampling) +
  visual tuning to avoid false positives.

## Lighting / GPU-heavy realism (deferred under the "focus on non-GPU" constraint; need a focused real-GPU session)
- [ ] L1/RE2/N6. **Lighting realism** — window-glass tint colouring the sun shaft + inter-room light bleed through open doors. Complex multi-file scene change; conflicts with the deliberate no-shadow fixture-light perf design, so needs a perf-aware approach.
- [ ] R10. **Faster built-in PBR render path** — one-click high-quality still (local accumulation/denoise to match Coohom's "render in seconds"); investigate progressive path-trace via the existing AccumulativeShadows + a higher-sample pass.

## ⭐ MAJOR: Ultra photo-realism (user-requested 2026-06-10) — phased, each its own commit
Goal: showroom-grade fidelity. Stack today: ACESFilmic tone-map (Scene.tsx gl), per-frame
exposure/warmth (`look.ts grade`), IBL probe (`SceneEnvironment`), PCFSoft sun shadows, post stack
(N8AO+Bloom+HueSat+Vignette+SMAA on high/maximum). Verification caveat: subtle GPU effects render
weakly under the headless **software-GL** harness — tone curve / vignette / grain DO show; SSR / DoF
/ TAA do not. Tune-heavy steps need a real-GPU pass (consistent with existing R10/L1 notes).
- [x] PR1. Selectable tone-mapping Look (Filmic/AgX/Neutral) — shipped C114.
- [x] PR2. Cinematic post stack (Maximum: full-res AO + film grain + chromatic aberration) — C117.
  (User verifies subtle grading in prod; DoF/TiltShift deferred to PR4-adjacent.)
- [~] PR3. **Material realism pass**. PR3a (C118): tier-driven IBL probe resolution (sharper
  reflections). PR3b TODO: env-map intensity, clearcoat/sheen where apt, glass transmission,
  sharper normal/roughness in `materials/furnitureMaterials.ts`. ← NEXT
- [ ] PR4. **Soft-shadow upgrade** (PCSS-ish / VSM, contact-shadow refinement).
- [ ] PR5. **Local progressive render** (one-click high-quality still via AccumulativeShadows +
  higher samples) — supersedes/ą merges R10.

## ⭐ MAJOR: GLB editor pro tooling (user-requested 2026-06-10) — phased, each its own commit
Today (`GlbDesignerDialog` + `furniture/glbEdit/`): compose-from-shapes, scale-a-source-GLB,
per-mesh recolour/hide. More verifiable in software-GL than PRx (deterministic geometry/UI).
- [x] GE1. More primitives — cone/pyramid/capsule/torus shipped C115 (wedge/plane deferred).
- [ ] GE1b. **Wedge / plane / tube** primitives (need custom or extra geometry).
- [ ] GE2. **Per-part transform gizmo** (move/rotate/scale) — carried TODO from C47/C48.
- [x] GE3. Per-part PBR — roughness/metalness (C119) + glow/opacity (C120). TODO GE3c: texture pick.
- [ ] GE4. **Save edits back over an existing asset** (vs always-new) — carried TODO.
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
