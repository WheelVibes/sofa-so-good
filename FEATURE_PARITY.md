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
version history · BYO-key AI photo restyle + style variants · **all analysis tools (we
exceed)**.

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| Replace-with-similar (one-click model swap, keep transform) | ❌ | ✅ | Add a "Replace model" action in `furniture/` + inspector that keeps position/rotation/scale and opens a similar-items picker. | M |
| Smart / semantic catalog search | ◑ | ✅ | Extend `ui/catalog/useUnifiedCatalog` with tag/embedding fuzzy search over built-ins + CC0 packs. | M |
| Section / cross-section drawings | ❌ | ✅ | New section-cut generator → a sheet in `ui/drawingSet.ts` (reuse elevation projection). | M |
| Drawing layer toggles (arch/electrical/plumbing) + text/material callouts | ◑ | ✅ | Add per-layer visibility + an annotation/text layer to the drawing-set generator. | M |
| Plumbing plan layer | ◑ | ✅ | Mirror the existing `electricalPlan` for plumbing fixtures. | S |
| Render denoiser | ❌ | ✅ | OIDN-wasm or bilateral post-pass on the HQ path-trace output (`scene/pathtrace`). | M |
| 8K+ tiled still render | ◑ | ✅ | Add tiled offscreen render at 8K+ to the HQ render presets. | M |
| Fast rasterized "preview render" tier | ◑ | ✅ | A high-quality single-frame raster capture as the local analog to cloud 10-s render. | M |
| One-click lighting templates (day/night/mood) | ◑ | ✅ | Named one-click presets over the existing lighting/IBL + time-of-day. | S |
| IES photometric light import | ❌ | ✅ | Parse `.ies` into spotlight intensity distribution in `scene/lighting`. | M |
| Quotation Excel/Word export + editable templates + price-rule library | ◑ | ✅ | Extend BOQ (`ui/boq`) with CSV/XLSX export + user-editable templates. | M |
| Walkthrough/flythrough **video** export (camera path → MP4/WebM) | ◑ | ✅ | Keyframed camera path over saved views + `MediaRecorder`/WebCodecs canvas capture. | L |
| Day-to-night animated render clip | ◑ | ✅ | Animate the time-of-day slider along the video path. | M |
| AI auto-layout / auto-furnish (describe → furnished 3D) | ❌ | 🔑 | BYO-key LLM emits placements into `layout/autoArrange.ts` over the live `__store`. | L |
| AI floor-plan generation (text → plan) | ❌ | 🔑 | BYO-key LLM emits wall/room JSON into the 2D plan schema. | L |
| AI plan recognition: auto-detect doors/windows + scale | ◑ | 🔑 | Extend the existing BYO-key AI wall tracing to openings + scale calibration. | M |
| AI matting / background removal | ❌ | ✅ | WASM segmentation (MODNet/rembg-wasm) for product cutouts. | M |
| AR "view in your room" | ❌ | ✅ | `<model-viewer>`/WebXR Quick Look + Scene Viewer on a GLB export (F22 in TASKS). | M |
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
export.

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| Export furniture list to **CSV** | ◑ | ✅ | Plain CSV export off existing FF&E data (`ffe/ffeSchedule.ts`). | S |
| Export 2D plan to **SVG** | ◑ | ✅ | Vector SVG export of the plan (reuse `ui/reportPlanSvg.ts`); we already do DXF. | S |
| First-class **dimension-line** objects (start/end/extension, magnetised, angle/elevation) | ◑ | ✅ | Promote measure/pins to persistent styled dimension objects with extension lines. | S |
| First-class **on-plan text** objects (font/size/color/angle) | ◑ | ✅ | True text annotation objects in the plan editor (beyond pinned comments). | S |
| **Polyline** annotations (dashed/arrows, open/closed) | ❌ | ✅ | New polyline annotation object with stroke/dash/arrow styling. | M |
| **North / compass** widget (rotatable, geo-tied) | ◑ | ✅ | Visible rotatable compass tied to sun azimuth + location (we have `CompassModal`). | S |
| Observer **FOV / eye-height** controls (walk) | ◑ | ✅ | Add FOV + eye-height sliders to `cameras/FirstPersonCamera`. | S |
| **Curved / arc walls** | ❌ | ✅ | Arc geometry + mid-wall curve handle + "arc extent" field; 2D render + 3D extrusion. | L |
| **Slanting walls** (per-endpoint top heights) | ◑ | ✅ | Per-endpoint "height at start/end" fields + sloped 3D extrusion. | M |
| **Sloping ceilings** (per-room ceiling slope) | ❌ | ✅ | Per-room ceiling slope params; angled ceiling plane (extend `apartment/ceiling`). | M |
| **Baseboards/skirting on walls** (height/thickness/finish) | ◑ | ✅ | We have skirting; expose per-wall baseboard params + finish. | M |
| Auto-detect room by double-click inside walls | ◑ | ✅ | "Double-click enclosed area → create room" detection (`floorplan/roomDetect.ts`). | M |
| Editable on-plan **room-name label** (placement/rotation/font) | ◑ | ✅ | Styled, movable room-name labels on the plan. | S |
| Furniture **as light source** params feeding render | ◑ | ✅ | Expose per-furniture emissive light (intensity/color) into the render (`lightEmitters.ts`). | M |
| Per-furniture **lock** / "stays at elevation" flags | ◑ | ✅ | Add lock + fixed-elevation flags to the furniture model + inspector. | S |
| Furniture **name/price labels** on 2D plan (toggle) | ◑ | ✅ | Toggle to show furniture labels in the 2D editor. | S |
| **Batch render** all saved cameras | ◑ | ✅ | "Render all saved views" loop over the render pipeline. | S |
| **Fisheye / DoF** lens options on render | ◑ | ✅ | Add lens-type + DoF controls to the render camera (DoF partly exists in HQ). | M |
| Keyboard wall-length entry while drawing | ◑ | ✅ | Live numeric length/angle entry during wall draw. | M |
| Split / join / reverse wall ops | ◑ | ✅ | Explicit split-at-point / join-endpoints / reverse commands in the 2D editor. | S |
| "Show all levels (dimmed)" overlay + duplicate-level | ◑ | ✅ | All-levels ghost overlay toggle + duplicate-level command on `LevelTabs`. | S |
| **Video flythrough** export (camera path → file) | ❌ | ✅ | Same camera-path + canvas-capture pipeline as the Coohom video gap (shared). | L |
| Export 3D scene to OBJ / glTF / STL | ◑ | ✅ | three.js `OBJExporter`/`GLTFExporter`/`STLExporter` (Q-3DEXPORT in TASKS). | M |
| Import SH3D / SH3F libraries | ❌ | ✅ | Parse the SH3D/SH3F zip (XML + models) into our model; conversion only. | L |
| Multi-language UI (20+) | ❌ | ✅ | i18n framework + translations; large, pure-client, low near-term value for HDB focus. | L |
| Plugin/extension API | ❌ | ✅ | Define a JS extension surface; large architectural effort, low near-term value. | L |

---

## 3. Prioritised roadmap (client-side-feasible gaps, by value ÷ effort)

**Quick wins (S)** — leverage modules we already ship:
1. CSV furniture-list export (SH3D) — trivial off FF&E data.
2. SVG plan export (SH3D) — reuse `reportPlanSvg`.
3. First-class dimension-line + on-plan text objects (SH3D) — ~80% there via measure/pins.
4. North/compass widget + walk FOV/eye-height (SH3D).
5. One-click lighting day/night/mood presets (Coohom).
6. Plumbing plan layer + drawing text callouts (Coohom).
7. Batch-render all saved views; furniture-label toggle on plan (SH3D).
8. Wall split/join/reverse; "show all levels" overlay + duplicate level (SH3D).

**High-value medium efforts (M):**
9. Replace-with-similar model swap (Coohom) — high daily-use value.
10. Smart/semantic catalog search (Coohom).
11. Section-cut drawings + drawing layer toggles (Coohom).
12. AR "view in your room" (Coohom/F22) — high "wow"/sales value.
13. Render denoiser + 8K tiled render (Coohom) — quality lift.
14. Sloping ceilings + slanting walls + baseboards (SH3D) — realism/CAD depth.
15. Furniture-as-light-source into render (SH3D).
16. Quote Excel/Word export + editable templates (Coohom).

**Marquee large efforts (L):**
17. **Video flythrough export** (camera path → MP4/WebM) — shared Coohom+SH3D marquee gap; very high marketing value.
18. **Curved / arc walls** (SH3D) — big drafting differentiator.
19. **AI auto-layout / auto-furnish / text-to-plan** (Coohom, 🔑 BYO-key) — Coohom's fastest-growing area; our biggest functional gap; LLM → `autoArrange`.
20. Whole-scene OBJ/glTF/STL export (Q-3DEXPORT).

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
