# Feature parity — gap analysis vs. reference apps

Living competitive-parity matrix for the HDB 3D interior-design sandbox. Maps our
current capabilities against the two benchmark competitors the team prioritised —
**Coohom** (proprietary parity benchmark) and **Sweet Home 3D** (open-source, the
classic 2D-plan→3D-furnish workflow) — and turns the gaps into a prioritised,
**client-side-feasible** roadmap. See `REFERENCES.md` for the full reference list,
`TASKS.md` for the active backlog, and `CHANGELOG.md` for shipped work.

> **Method.** Each competitor's current (2025-2026) feature set was inventoried from
> its live app + help/docs/blog/reviews. Every feature is scored against what we
> already ship (per `docs/ARCHITECTURE.md` + `FEATURE_FLAGS`). This file lists **only
> open gaps** (+ approach + effort) — features we already match are recorded in
> `CHANGELOG.md` / `docs/ARCHITECTURE.md`, not enumerated here.
>
> **Maintenance.** When a gap ships, **delete its row** from the tables below (and from
> the roadmap in §3) — shipped work lives in `CHANGELOG.md` only, so the gap tables stay
> an accurate to-do list and we never re-audit shipped work.

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

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| Day-to-night animated render clip | ◑ | ✅ | Animate the time-of-day slider along the video path (real-GPU final clip). | M |
| AI floor-plan generation (text → plan) | ❌ | 🔑 | BYO-key LLM emits wall/room JSON into the 2D plan schema. | L |
| AI plan recognition: auto-detect doors/windows + scale | ◑ | 🔑 | Extend the existing BYO-key AI wall tracing to openings + scale calibration. | M |
| AI matting / background removal | ❌ | ✅ | WASM segmentation (MODNet/rembg-wasm) for product cutouts. | M |

_(Hosted 60k–1M+ model library · branded/manufacturer catalogs · cloud accounts /
multi-user collab / teams · supplier/e-commerce/CNC integration → see §4 Out of scope.)_

---

## 2. Sweet Home 3D

We meet or exceed SH3D on the big-ticket items (photoreal render, real-sun lighting,
multi-storey, rich import, analysis/deliverables, sharing, Simple/Pro). SH3D's
remaining edge is its **precise-CAD drafting** (curved/slanting walls, sloping
ceilings), its **first-class on-plan annotations** (styled dimension lines, text,
polylines), and its iconic **video flythrough** export.

### Gaps & approach

| Feature | Have | Feasible | Gap & approach (reference our modules) | Effort |
|---|---|---|---|---|
| Import SH3D **`.sh3f` libraries** + legacy archives | ◑ | ✅ | `.sh3d` (Home.xml) walls/rooms/furniture/openings already import; remaining: `.sh3f` furniture libraries, legacy serialized (non-`Home.xml`) archives, exact sill from SH3D `elevation`. | L |
| Multi-language UI (20+) | ❌ | ✅ | i18n framework + translations; large, pure-client, low near-term value for HDB focus. | L |
| Plugin/extension API | ❌ | ✅ | Define a JS extension surface; large architectural effort, low near-term value. | L |

---

## 3. Prioritised roadmap (remaining client-side-feasible gaps, by value ÷ effort)

> Shipped items are removed from this list as they land (see `CHANGELOG.md`); this
> section tracks only what is still open.

**High-value medium efforts (M):**
1. Day-to-night animated render clip (Coohom) — animate time-of-day along the video path.
2. AI plan recognition: auto-detect openings + scale (Coohom, 🔑 BYO-key).
3. AI matting / background removal for product cutouts (WASM segmentation).

_(The former "fast rasterized preview render tier" row was retired 2026-07-10: the capability
substantively ships — one-tap raster render presets (`scene/renderPresets.ts`, F4) + the 2×
SSAA snapshot capture (`ScreenshotController`, PHOTO-SSAA-EXPORT v0.8.0.30) + the render-compare
raster capture (`RenderCompareModal`) together ARE the local analog to Coohom's 10-s preview;
no distinct feature remains to build.)_

**Marquee large efforts (L):**
5. **AI floor-plan generation** (text → plan, Coohom, 🔑 BYO-key).
6. Import SH3D **`.sh3f`** libraries + legacy archives; multi-language UI; plugin/extension API (SH3D) — large, lower near-term value.

**Consumer/styling front-end (context, not Coohom/SH3D):** the remaining consumer front-of-funnel
edge (Spoak/Decor8/Havenly/DecorMatters) is the community/gamification/feed layer, which is ☁️
backend (out of scope).

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
