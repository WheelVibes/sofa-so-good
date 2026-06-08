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
- [ ] K1. **Parametric kitchen/bath cabinet engine** — millimetre-customisable cabinets with smart countertop/toe-kick/cornice generation (Coohom parity). Builds on the parametric system + auto-arrange.
- [ ] Q31. **Drag a material swatch onto a surface in 3D** to apply a finish (reuses `getSurfaceMaterial` / finish DLC); today it's picker-only. NOTE: the 3D drop raycast can't be screenshot-verified headless — needs a manual/GPU verify pass, so do the pure resolver + DOM-draggable parts test-first.
- [ ] T3. Per-LOD multi-tier generation for uploads.
- [~] T2. Crown-molding revisit + kitchen/bath template polish (herringbone floor already shipped).

## QOL / commercial polish (small, DOM/unit-verifiable, prod-safe) — research-driven
- [ ] C1. **Export shopping list as CSV** from the Budget panel (name, qty, each, line, buy link) — competitors (Planner5D/Coohom) offer cost export.
- [ ] C2. **Budget target progress in the room editor** (mini over/under pill), not just the Budget panel.
- [ ] C3. **"Mirror room layout"** — reflect a room's furniture across its centre axis (great for symmetric bedrooms); pure transform + canPlace-checked.
- [ ] C4. **Per-room subtotal** line in the Budget panel (group lines by room) — uses `pointInRoom`.
- [ ] C5. **Keyboard: Escape clears selection first, then exits the room editor** (two-stage), so Esc isn't an accidental full exit when something's selected.
- [ ] C6. **Catalog: "Add to room" count badge** / recently-placed surfaced (recentSlice already exists) consistency audit.

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.
- Keep CHANGELOG/TASKS entries to a 2-line max.

Competitor-research sources: capterra.com/compare Planner-5D-vs-Coohom;
coohom.com/article best-online-room-planner-2026; saasworthy.com Planner-5D.
