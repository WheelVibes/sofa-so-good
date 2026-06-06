# TASKS — autonomous improvement backlog

Working branch: `claude/codebase-analysis-optimization-QKCK6`.
Each task = its own commit; log every shipped task in `CHANGELOG.md`.
Licensed/non-redistributable additions are dev-gated; unlicensed ship in prod too.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (see CHANGELOG)

## Reliability / robustness
- [x] R1. React **ErrorBoundary** around app + scene. (CHANGELOG)
- [x] R2. **localStorage quota handling** — autosave failures now surface a deduped notification + auto-clear on recovery; prefs writers already guarded. (CHANGELOG)
- [x] R3. **"Auto-saved …" indicator** — lastSavedAt set on every successful save, shown in the Versions panel. (CHANGELOG)
- [x] R4. Guard against **non-finite transforms** on load (applySerialized filters NaN/Infinity). (CHANGELOG)

## Performance / scalability
- [ ] P1. Catalog drawer **virtualization** audit — ensure huge catalogs (thousands of IKEA/imported items) stay smooth (react-virtuoso already a dep).
- [ ] P2. **Memoization audit** of hot R3F components / selectors to avoid re-renders.
- [ ] P3. More **instancing** for repeat-geometry primitives where profiling justifies.

## Bugs / correctness
- [x] B1. Swept TODO/FIXME (all doc pointers, no bugs); fixed misleading "cannot be undone" reset confirms (resets are undoable). (CHANGELOG)
- [ ] B2. Audit dispose/cleanup of three resources (geometries/materials/textures) for leaks.

## QOL / UX features (competitor parity: Planner5D, Coohom, Foyr, HomeByMe, IKEA Kreativ)
- [x] Q1. **Duplicate (Ctrl/Cmd+D)** — already fully wired (keyboard + context menu + inspector). No work needed.
- [x] Q2. **Recently used / recently placed** catalog row (clock chip, persisted). (CHANGELOG)
- [ ] Q3. **Drag-from-catalog-to-scene** placement (if not present) or improve placement ghost UX.
- [x] Q4. **`?` opens Help & shortcuts** — wired the advertised-but-missing global binding. (CHANGELOG)
- [x] Q5. **Wall-length labels** on the 2D plan (+ Dims toggle). (CHANGELOG)
- [x] Q6. **Camera bookmarks / saved views** — save/apply (smooth fly)/delete, desktop View menu + mobile parity, persisted. (CHANGELOG)
- [ ] Q7. **Empty states & inline help** across panels.

## Realism
- [ ] RE1. Window glass tint / curtains affecting light (TODO out-of-scope item).
- [ ] RE2. Inter-room light bleed through open doors (Phase 3 pending).
- [x] RE3. Basketweave parquet procedural floor (oak + walnut). (CHANGELOG)
- [x] RE4. Exposed-brick wall finishes (red/white-washed/charcoal). (CHANGELOG)

## Security
- [x] S1. BYO-key audit done (keys localStorage-only, not logged/in-schema) + Replicate poll-URL host guard against key exfiltration. (CHANGELOG)
- [x] S2. Verified: GLB upload validation enforces 25MB cap + glTF magic bytes + rejects external-URI glTF (SSRF) — covered by validate.test.ts. No change needed.
- [x] S3. Dev-gating audit — verified: `visiblePacks`/`activeProviderIds`/`PROD_PROVIDER_IDS` gate all licensed/non-CORS sources out of prod; already covered by registry.test.ts + integration.test.tsx. No leak.

## TODO.md clearable
- [ ] T1. Curated "furniture materials" one-tap finish shortlist (oak/walnut/teak/marble).
- [ ] T2. Crown molding revisit / herringbone floor / kitchen-bath templates polish.
- [ ] T3. Per-LOD multi-tier generation for uploads (deferred).

## Process
- Keep CLAUDE.md / README.md / docs current per repo rule after each user-facing change.
- Run `npm test` + `tsc` before each commit; visual-verify app-facing changes.

## File / portability
- [x] F1. Export/import a design as a `.sofa.json` file (Versions panel). (CHANGELOG)

## Bulk editing
- [x] Q8. "Apply style to all of this type" context-menu bulk restyle. (CHANGELOG)
- [x] C1. PWA manifest + theme-color + social/Apple meta tags. (CHANGELOG)

## Accessibility
- [x] A1. Modal dialog role + aria-modal + aria-label + focus-in/restore (shared primitive). (CHANGELOG)
- [x] A2. Modal focus trap (Tab/Shift+Tab cycle within the dialog). (CHANGELOG)
- [x] Q7. Empty states — verified BudgetPanel/LayersPanel/VersionsPanel already have them.

## Bulk editing (cont.)
- [x] Q9. Ctrl/⌘+A select-all. (CHANGELOG)

## Researched backlog (next iterations — competitor parity / polish)
- [x] N1. **Apply finish to all rooms** — setAll{Floor,Wall}Finish + FinishPicker buttons. (CHANGELOG)
- [x] N2. **Duplicate-in-array** — inspector "Duplicate a row of N", collision-checked, grouped. (CHANGELOG)
- [x] N3. **3D rotate handle/gizmo** — touch-friendly floor ring + knob,
  drag-to-rotate with 15° snap (Shift = free), live degree readout, collision
  tint + revert, raycast-priority pick. Pure math unit-tested. (CHANGELOG)
- [ ] N4. **Per-room ceiling height** control (architectural realism).
- [ ] N5. **Persist measurements + photo-trace backdrop** into the save schema
  (currently session-only).
- [ ] N6. **RE1/RE2** — window glass tint + inter-room light bleed (complex
  lighting; needs a focused session).
- [ ] N7. **Toolbar/icon-button aria-labels audit** + catalog keyboard nav (a11y
  beyond modals).
- [ ] N8. **Bundle code-splitting** — lazy-load FloorPlanEditor/AI surfaces if
  initial-load profiling justifies it (three.js dominates, so likely marginal).
- [x] N9. Microcement/concrete accent wall finishes (light/grey/charcoal). (CHANGELOG)
- [x] N9b. Board-and-batten panelling wall finishes (white/sage/navy). (CHANGELOG)
  (procedural, prod-safe).
- [x] N10. Inspector "Reset" props to defaults (parametric items). (CHANGELOG)
