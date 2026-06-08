# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress. Completed work lives in `CHANGELOG.md`
(not here — this file is the open backlog only).

## Performance / scalability
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders (needs profiling on real hardware to justify).
- [ ] P3. More **instancing** for repeat-geometry primitives where profiling justifies.

## Lighting / GPU-heavy realism (deferred under the "focus on non-GPU" constraint; need a focused real-GPU session)
- [ ] L1/RE2/N6. **Lighting realism** — window-glass tint colouring the sun shaft + inter-room light bleed through open doors. Complex multi-file scene change; conflicts with the deliberate no-shadow fixture-light perf design, so needs a perf-aware approach.
- [ ] R10. **Faster built-in PBR render path** — one-click high-quality still (local accumulation/denoise to match Coohom's "render in seconds"); investigate progressive path-trace via the existing AccumulativeShadows + a higher-sample pass.
- [ ] B34. **Plan-aware lighting shadow frustum** — `Lighting.tsx` CENTER + fixed 9.5 m half-extent is default-apartment-centred; a far-offset/oversized custom plan could miss sun shadows (Medium+ tiers). Make it plan-aware; needs a real-GPU shadow-coverage check.

## Feature-flag retrofit (infra shipped: registry + resolver + admin + panel + desktop/⌘K gating)

## Features (larger)
- [ ] K1b. **Cabinet engine — next steps**: auto-arrange a run of base+wall cabinets along a wall; sink/hob cut-outs in a base cabinet; corner/blind units. (Core engine shipped C38.)
- [~] Q31. **Drag a material swatch onto a surface in 3D**. Part 1 shipped (C39): tested `finishDrop` resolver + draggable swatches + drop onto Objects-list rows. TODO part 2: the 3D-canvas raycast drop onto floor/wall/item (needs manual/GPU verify).
- [ ] T3. Per-LOD multi-tier generation for uploads.
- [~] T2. Crown-molding revisit + kitchen/bath template polish (herringbone floor already shipped).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.
- Keep CHANGELOG/TASKS entries to a 2-line max.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
