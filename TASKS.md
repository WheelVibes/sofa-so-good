# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (see CHANGELOG)

## Reliability / robustness
- [x] R1. React **ErrorBoundary** around app + scene. (CHANGELOG)
- [x] R2. **localStorage quota handling** — autosave failures now surface a deduped notification + auto-clear on recovery; prefs writers already guarded. (CHANGELOG)
- [ ] R3. **Autosave resilience** — debounce + try/catch + last-saved indicator; never lose work on a transient failure.
- [ ] R4. Guard against **NaN/invalid transforms** in placement/drag (defensive clamps).

## Performance / scalability
- [ ] P1. Catalog drawer **virtualization** audit — ensure huge catalogs (thousands of IKEA/imported items) stay smooth (react-virtuoso already a dep).
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders.
- [ ] P3. More **instancing** for repeat-geometry primitives where profiling justifies.

## Bugs / correctness
- [ ] B1. Sweep `TODO/FIXME` in source (4 found) + obvious edge-case bugs.
- [ ] B2. Audit dispose/cleanup of three resources (geometries/materials/textures) for leaks.

## QOL / UX features (competitor parity: Planner5D, Coohom, Foyr, HomeByMe, IKEA Kreativ)
- [x] Q1. **Duplicate (Ctrl/Cmd+D)** — already fully wired (keyboard + context menu + inspector). No work needed.
- [x] Q2. **Recently used / recently placed** catalog row (clock chip, persisted). (CHANGELOG)
- [ ] Q3. **Drag-from-catalog-to-scene** placement (if not present) or improve placement ghost UX.
- [ ] Q4. **Keyboard shortcut cheatsheet** completeness + a `?` overlay.
- [ ] Q5. **Measurement/annotation** persistence + dimension labels on 2D plan.
- [ ] Q6. **Camera bookmarks / saved views** for quick navigation + before/after compare.
- [ ] Q7. **Empty states & inline help** across panels.

## Realism
- [ ] RE1. Window glass tint / curtains affecting light (TODO out-of-scope item).
- [ ] RE2. Inter-room light bleed through open doors (Phase 3 pending).
- [ ] RE3. Herringbone/parquet procedural floor (needs seamless tiler).

## Security
- [ ] S1. Audit BYO-key storage (AI keys, pack keys) — ensure never logged/bundled; document.
- [ ] S2. Validate/​sanitize imported file handling paths (already strong; verify caps + magic-byte checks).
- [ ] S3. Dev-gating audit — confirm no licensed/non-CC0 source leaks into prod build.

## TODO.md clearable
- [ ] T1. Curated "furniture materials" one-tap finish shortlist (oak/walnut/teak/marble).
- [ ] T2. Crown molding revisit / herringbone floor / kitchen-bath templates polish.
- [ ] T3. Per-LOD multi-tier generation for uploads (deferred).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.
