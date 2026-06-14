# Feature parity — gap analysis vs. reference apps

Living competitive-parity matrix for the HDB 3D interior-design sandbox. Maps our
current capabilities against the two benchmark competitors the team prioritised —
**Coohom** (proprietary parity benchmark) and **Sweet Home 3D** (open-source, the
classic 2D-plan→3D-furnish workflow) — and turns the gaps into a prioritised,
**client-side-feasible** roadmap. See `REFERENCES.md` for the full reference list,
`TASKS.md` for the active backlog, and `CHANGELOG.md` for shipped work.

> **Method.** Each competitor's current (2025-2026) feature set was inventoried from
> its live app + help/docs/blog/reviews. Every feature is scored against what we
> already ship (per `docs/ARCHITECTURE.md` + `FEATURE_FLAGS`). This file is **gaps +
> approach + effort**, not a brag sheet — features we already match are summarised,
> not enumerated row-by-row.
>
> **Maintenance.** When a gap ships, **delete its row** from the tables below and fold
> it into the relevant "Already at parity (✅)" summary (and drop it from the roadmap),
> so the gap tables stay an accurate to-do list and we never re-audit shipped work.

**Legend** — _Have_: ✅ at parity · ◑ partial · ❌ missing. _Feasible_: ✅ pure
client-side · ☁️ needs a backend/cloud or accounts · 🔑 client-side but needs a
BYO-key cloud model · 📜 blocked by licensing. _Effort_: S / M / L.

**Guiding constraint.** The app is deliberately **100% client-side** (no backend, no
accounts, no hosted catalog). Gaps that inherently require server infrastructure,
B2B/enterprise tooling, or licensed proprietary content are listed under
**Out of scope** so we stop chasing them — we win on the client-feasible column.

---

## 1. Coohom

Coohom's moat is **cloud infrastructure** (10-second 4K–16K cloud ray tracing,
60k–1M+ hosted/branded models, accounts/teams/enterprise white-label, e-commerce/CNC
production integration). We already **match or exceed** it on parametric modeling
(cabinets/wardrobes/CSG designer), open import formats, BYO-key AI restyle, and — by a
wide margin — **design analysis** (design score, HDB compliance, accessibility,
daylight, renovation cost; Coohom has none of these). The valuable client-side gaps
are interaction/productivity features, plus the AI auto-layout family.

### Already at parity (✅) — not gaps
Photoreal still render · 360° panorama · 720°/linked panorama tour · 2D plan editor
(walls/rooms/doors/windows) · precise dimensioning · elevations · auto 3D→2D drawing
set · material/finish schedule (FF&E) · PDF export · DXF export · BOM/quotation (BOQ) ·
shoppable buy-list · GLB/OBJ/FBX/STL import · floor-plan image backdrop · texture
upload · mobile/touch · plan templates · parametric kitchen cabinets · parametric
wardrobe/shelving/sideboard · free custom modeling (CSG designer) · pinned comments ·
version history · BYO-key AI photo restyle + style variants · **replace-with-similar
model swap** · **smart/semantic catalog search** · **section/cross-section drawings** ·
**plumbing plan layer** · **render denoiser (HQ path-trace)** · **one-click
render/lighting presets (day/night/mood)** · **BYO-key AI auto-furnish (text brief →
layout)** · **drawing-set sheet/layer toggles (choose which sheets to include)** ·
**on-plan text callouts on the report + drawing-set sheets** ·
**quotation CSV + Excel (.xlsx) export** ·
**all analysis tools (we exceed)**.

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| 8K+ tiled still render | ◑ | ✅ | Add tiled offscreen render at 8K+ to the HQ render presets. | M |
| Fast rasterized "preview render" tier | ◑ | ✅ | A high-quality single-frame raster capture as the local analog to cloud 10-s render. | M |
| IES photometric light import | ❌ | ✅ | Parse `.ies` into spotlight intensity distribution in `scene/lighting`. | M |
| Quotation **editable templates** + price-rule library | ◑ | ✅ | BOQ + CSV + **XLSX** ship; add user-editable quote templates + a configurable price-rule library. | M |
| Walkthrough/flythrough **video** export (keyframed camera path → MP4/WebM) | ✅ | ✅ | **Shipped (PARITY-VIDEO)** — "Record walkthrough video" records the saved-views cinematic tour to .webm with a user-set pace (`recordViewTour` + RecordController). | L |
| Day-to-night animated render clip | ◑ | ✅ | Animate the time-of-day slider along the video path. | M |
| AI floor-plan generation (text → plan) | ❌ | 🔑 | BYO-key LLM emits wall/room JSON into the 2D plan schema. | L |
| AI plan recognition: auto-detect doors/windows + scale | ◑ | 🔑 | Extend the existing BYO-key AI wall tracing to openings + scale calibration. | M |
| AI matting / background removal | ❌ | ✅ | WASM segmentation (MODNet/rembg-wasm) for product cutouts. | M |
| AR "view in your room" | ✅ | ✅ | **Shipped (PARITY-AR)** — Tools → "View in your room (AR)" opens iOS AR Quick Look from USDZ, GLB download elsewhere (`viewInAr`). Android Scene Viewer needs an https-hosted model (backend) — the only remaining gap. | M |
| Massive hosted model library (60k–1M+) | ◑ | ☁️ | Can't match scale without a CDN; lean on procedural + curated CC0 + upload. | L |
| Branded/manufacturer catalogs | ❌ | 📜 | Licensed vendor catalogs need deals + backend. | L |
| Cloud accounts / real-time multi-user collab / teams / white-label | ❌ | ☁️ | Backend/CRDT; out of our client-side scope. | L |
| Supplier/e-commerce/CNC production integration | ❌ | ☁️ | ERP/manufacturing integration; out of scope. | L |

---

## 2. Sweet Home 3D

We meet or exceed SH3D on the big-ticket items (photoreal render, real-sun lighting,
multi-storey, rich import, analysis/deliverables, sharing, Simple/Pro). SH3D's
remaining edge is its **precise-CAD drafting** (curved/slanting walls, sloping
ceilings), its **first-class on-plan annotations** (styled dimension lines, text,
polylines), and its iconic **video flythrough** export.

### Already at parity (✅) — not gaps
Straight-wall draw + chain · per-wall thickness · wall snapping/magnetism · wall edit
dialog (exact dims) · room floor/ceiling finishes · room-area display · multi-level
tabs (per-level elevation/height) · categorized drag-drop catalog · OBJ/FBX/STL import ·
furniture groups · furniture edit dialog · resize/deform · orbit + first-person walk ·
saved cameras · sky/backdrop · path-traced render w/ quality levels · sun by
date/time/geo + North · metric & imperial units · tape/area measure · undo/redo ·
reference backdrop (scale/locate/opacity) · printable plan + 3D + list · raster (PNG)
export · **CSV furniture-list export** · **SVG plan export** · **first-class
dimension-line objects** · **on-plan text notes** · **polyline annotations
(open/closed, dashed, arrow)** · **rotatable North/compass widget** · **walk
FOV/eye-height controls** · **auto-detect room (double-click)** ·
**furniture-as-light-source into render** · **per-furniture lock** · **furniture
name/price labels on the 2D plan** · **wall split/join/reverse** · **all-levels
(dimmed) overlay + duplicate-level** · **turntable video recording (WebM)** · **drag-to-reposition
room-name labels**.

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| **Curved / arc walls** | ✅ | ✅ | **Shipped (PARITY-CURVEDWALL)** — true circular arc + midpoint bulge handle, openings on curves, 2D `A`-path + 3D chord extrusion. | L |
| **Slanting walls** (per-endpoint top heights) | ✅ | ✅ | **Shipped (PARITY-SLOPEWALL)** — `PlanWall.topHeightEnd` prism + inspector start/end height. | M |
| **Sloping ceilings** (per-room ceiling slope) | ✅ | ✅ | **Shipped (PARITY-SLOPECEIL)** — `sloped` `CeilingConfig` pitched plane + per-room picker. | M |
| **Baseboards/skirting on walls** (height/thickness/finish) | ◑ | ✅ | We have skirting; expose per-wall baseboard params + finish. | M |
| On-plan room-name label **rotation / font** | ◑ | ✅ | Name is editable, rendered + **draggable** (placement ships); add optional label rotation + font styling. | S |
| **Batch render** all saved cameras | ✅ | ✅ | **Shipped (PARITY-BATCHRENDER)** — Saved-views "Render all views" flies to each view and downloads a PNG via `captureCanvasPng` (`ui/renderAllViews.ts`, `batchRender` pro flag). | S |
| **Fisheye / DoF** lens options on render | ◑ | ✅ | Add lens-type + DoF controls to the render camera (DoF partly exists in HQ). | M |
| Keyboard wall-length entry while drawing | ◑ | ✅ | Live numeric length/angle entry during wall draw. | M |
| **Video flythrough** export (keyframed camera path → file) | ✅ | ✅ | **Shipped (PARITY-VIDEO)** — saved-views cinematic tour recorded to .webm. | L |
| Export 3D scene to OBJ / glTF / STL | ✅ | ✅ | **glTF/GLB + OBJ + STL shipped** (`sceneExport3d`, Q-3DEXPORT) — `export/sceneGltf.ts` + `convert/toGlb.ts` / `export/sceneObj.ts` / `export/sceneStl.ts`, in Tools/Share/⌘K/mobile. | M |
| Import SH3D / SH3F libraries | ❌ | ✅ | Parse the SH3D/SH3F zip (XML + models) into our model; conversion only. | L |
| Multi-language UI (20+) | ❌ | ✅ | i18n framework + translations; large, pure-client, low near-term value for HDB focus. | L |
| Plugin/extension API | ❌ | ✅ | Define a JS extension surface; large architectural effort, low near-term value. | L |

---

## 3. Prioritised roadmap (remaining client-side-feasible gaps, by value ÷ effort)

> Shipped items are removed from this list as they land (see `CHANGELOG.md`); this
> section tracks only what is still open.

**Quick wins (S):**
1. Room-name label rotation + font styling (SH3D) — drag-to-reposition already ships.

**High-value medium efforts (M):**
4. AR "view in your room" (Coohom/F22) — high "wow"/sales value.
5. 8K tiled still render + fast rasterized preview tier (Coohom) — quality lift.
6. Sloping ceilings + slanting walls + per-wall baseboards (SH3D) — realism/CAD depth.
7. Quote editable templates + price-rule library (Coohom) — CSV/XLSX export already ship.
8. Fisheye / DoF lens options on the render camera (SH3D).
9. Keyboard wall-length / angle entry while drawing (SH3D).
10. IES photometric light import (Coohom).
11. AI plan recognition: auto-detect openings + scale (Coohom, 🔑 BYO-key).

**Marquee large efforts (L):**
12. **Keyframed video flythrough export** (camera path → MP4/WebM) — shared Coohom+SH3D marquee gap (turntable recording already ships); very high marketing value.
13. **Curved / arc walls** (SH3D) — big drafting differentiator.
14. **AI floor-plan generation** (text → plan, Coohom, 🔑 BYO-key).
15. Whole-scene OBJ/glTF/STL export (Q-3DEXPORT).
16. Import SH3D/SH3F libraries; multi-language UI; plugin/extension API (SH3D) — large, lower near-term value.

**Consumer/styling front-end (from the broader cluster research — context, not Coohom/SH3D):**
style/personality **quiz onboarding** (powers Smart Start), **in-engine one-tap style
transfer** (no API key — swap palette/materials/finishes to a named style using our
procedural + CC0 assets), **before/after reveal slider**, shareable **design card**.
These are the consumer apps' (Spoak/Decor8/Havenly/DecorMatters) front-of-funnel edge
and are all client-side feasible; the community/gamification/feed layer is ☁️ backend.

---

## 4. Out of scope (don't chase — conflict with the no-backend design)
- Cloud accounts, project cloud storage, real-time multi-user collaboration, teams/enterprise/white-label (☁️).
- 60k–1M+ hosted model library; branded/manufacturer catalogs (☁️/📜).
- Cloud GPU ray-tracing farm (10-s 4K–16K) — we offer a local progressive path-tracer instead (☁️).
- Supplier / e-commerce / CNC production / ERP integration (☁️ B2B).
- Native iPad/desktop apps — we are a web app / PWA.
- `.max`/`.skp` proprietary-binary import (effectively infeasible client-side).

---

## 5. Reference apps surfaced during this pass (candidates for `REFERENCES.md`)
Decor8 AI (style quiz, paint-color visualizer, sketch-to-3D) · ReimagineHome.ai
(shop-the-look, moodboard-driven staging) · Havenly AI (chat assistant, style quiz,
press-and-hold local edits) · DecorMatters (gamification/community gold standard) ·
Morpholio Board (pro moodboard/collage, palette capture) · Google Mixboard (AI
moodboard, Sept 2025) · Decoratly (2-min browser-local style quiz + palette-from-photo).
