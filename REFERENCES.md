# References — interior-design / room-planner apps

Competitor and reference applications for this project. **Use these when researching new
features or deciding what good UI/UX should look like** — study how the market solves a
problem before designing our version, and aim to match or surpass them. When research
surfaces a new relevant app or tool, **add it to this list** (keep the same fields).

Open-source ones (Sweet Home 3D, Blender) are the best to study deeply — their source and
docs are public. Proprietary ones are studied via their live apps + help docs.

| App | License | What to learn from it | Links |
| --- | --- | --- | --- |
| **Planner 5D** | Proprietary | 2D/3D dual-mode editing, AI layout + AR room scanning, approachable consumer onboarding. | [app](https://planner5d.com) · [docs](https://planner5d.com/help) |
| **IKEA Room Planner (Kreativ)** | Proprietary | Real branded-catalog integration, AI design, configuring real purchasable furniture — closest analog to our IKEA import. | [app](https://www.ikea.com/us/en/home-design/) · [docs](https://www.ikea.com/us/en/customer-service/) |
| **Homestyler** | Proprietary | Cloud 3D floor planning, photorealistic rendering, virtual staging. | [app](https://www.homestyler.com) · [docs](https://www.homestyler.com/help-center) |
| **Sweet Home 3D** | GPLv2+ | **Open source.** Classic 2D-plan → 3D-furnish workflow, furniture catalog model, walkthroughs. | [app](https://www.sweethome3d.com) · [docs](https://www.sweethome3d.com/documentation.jsp) · [source](https://sourceforge.net/projects/sweethome3d/) |
| **SweetHome3DJS** | GPLv2+ | **Open source — web port of Sweet Home 3D.** Directly studied in `docs/research/sweethome3djs-feature-analysis.md`: synchronized `PlanComponent` (2D) + `HomeComponent3D` (WebGL) off one `Home` model; round/sloping walls; `ObjWriter`/`GLTFExporter` 3D export; `HomeRecorder`/`IncrementalHomeRecorder` persistence; OBJ/DAE/3DS loaders; modernizing to TS+Vite+ESM (7.7 Online branch). **`.sh3d` format = a ZIP whose `Home.xml` holds the plan (cm, screen Y-down): `<wall xStart yStart xEnd yEnd thickness height>`, `<room>`+`<point x y>` polygons, `<pieceOfFurniture name x y angle width depth height>` — the schema our `floorplan/import/sh3d.ts` importer reads (PARITY-SH3D).** | [src (7.7 Online)](https://sourceforge.net/p/sweethome3d/code/HEAD/tree/branches/develop-SweetHome3D-7.7-Online/SweetHome3DJS/) · [API](http://www.sweethome3d.com/jsdoc/) · [mirror](https://github.com/luxvitae-eco/SweetHome3DJS) |
| **Floorplanner** | Proprietary | Fast, intuitive web 2D/3D floor-plan drawing; large furniture + structural library. | [app](https://floorplanner.com) · [docs](https://floorplanner.com/support) |
| **Magicplan** | Proprietary | Mobile AR room-scan → instant 2D/3D plan + cost estimation (mobile-first, our backdrop/AI-walls analog). | [app](https://www.magicplan.app) · [docs](https://help.magicplan.app) |
| **RoomSketcher** | Proprietary | Professional 2D floor plans + interactive 3D + walkthroughs for real estate/renovation. | [app](https://www.roomsketcher.com) · [docs](https://www.roomsketcher.com/support/) |
| **Coohom** | Proprietary | **Parity benchmark.** Lightning-fast 4K/8K photoreal rendering, AI design automation, huge 3D asset library, parametric cabinets. | [app](https://www.coohom.com) · [docs](https://www.coohom.com/help) |
| **Live Home 3D** | Proprietary | Multi-platform (iOS/macOS/Windows) advanced 2D plans + rich 3D interiors. | [app](https://www.livehome3d.com) · [docs](https://www.livehome3d.com/support) |
| **Remodel AI** | Proprietary | AI photo → restyle into alternative aesthetics (our AI-photoreal-export analog). | [app](https://www.remodelai.io) · [docs](https://www.remodelai.io/blog) |
| **Blender (Archipack/Archimesh)** | GPL | **Open source.** Ultra-realistic architectural rendering + custom interiors via plugins — the ceiling for render quality. | [app](https://www.blender.org) · [docs](https://docs.blender.org) · [source](https://projects.blender.org/blender/blender) |
| **Roomstyler** | Proprietary | Web 3D room planner with a design community + large real-world branded furniture catalog. | [app](https://roomstyler.com) · [docs](https://roomstyler.com/faq) |
| **Cedreo** | Proprietary | Pro home-design: fast 2D→3D, photoreal renders, project deliverables; multi-storey + sections. | [app](https://cedreo.com) · [docs](https://cedreo.com/features/) |
| **Foyr Neo** | Proprietary | Browser 4K photoreal rendering + large library + fast designer workflow. | [app](https://foyr.com) · [docs](https://foyr.com/neo) |
| **Spacejoy** | Proprietary | Shoppable, heavily-styled room designs + moodboards (commerce-led). | [app](https://www.spacejoy.com) · [docs](https://www.spacejoy.com/interior-designs-blog) |
| **Roomle** | Proprietary | Parametric product configurators + AR; manufacturer-catalog focus. | [app](https://www.roomle.com) · [docs](https://www.roomle.com/en/configurator) |
| **Enscape (for SketchUp)** | Proprietary | Real-time GI/SSGI live photoreal preview — the real-time-render ceiling. | [app](https://www.chaos.com/enscape) · [docs](https://blog.enscape3d.com) |
| **Spoak** | Proprietary | Consumer moodboard + room-design community; styling-board UX. | [app](https://www.spoak.com) · [docs](https://www.spoak.com) |
| **Qanvast (SG)** | Proprietary | Singapore reno discovery + get-quotes + firm trust — the design→quote handoff we can bridge. | [app](https://qanvast.com) · [docs](https://renovate.qanvast.com/get-quotes/) |

- **Maket.ai** — generative architecture/floor-plan AI; near-zero-learning-curve generative flows (2026 research pass).
- **ReRoom AI / Spacely AI / Decor8 AI** — photo-restyle AI tools; commercial-rights-on-paid-tier packaging worth studying for our BYO-key AI surfaces (2026 research pass).
- **Foyr Neo / Live Home 3D / Floorplanner / RoomSketcher** — pro/cloud planners benchmarked in the 2026 parity pass; study cloud render tiers (4K–16K), credit models, LiDAR/AI scan-to-plan (RoomSketcher FloorCapture + AI Convert), and camera-path video walkthroughs. See `FEATURE_PARITY.md`.
- **Havenly / Spacejoy** — consumer "AI generate → upsell to human designer" funnel; **style/swipe quiz onboarding** + **press-and-hold local restyle** + deep shop-the-look (2026 pass). **Havenly AI** (ai.havenly.com, ~Jan 2026): chat assistant trained on 2.4M proprietary designer renderings → shoppable designs + human-designer handoff — the most "design-expertise"-branded chat product of the field (2026-07 research pass; still generative, NOT grounded in the user's live design model).
- **DecorMatters** — gamified/social design-game reference: design challenges, Dcoins/EXP/levels/badges/leaderboards, community feed + AR placement + AR Ruler (2026 pass). The gold standard for a social/gamified front-end (backend-dependent).
- **Spacely AI Point-and-Edit / Decor8 Chat-to-Design** — best-in-class local "magic recolor"/conversational restyle UX; **Pinterest-board moodboard import** (Spacely) (2026 pass).
- **Arcadium 3D** — browser SH3D-style planner positioned on **speed + precision editing**: numeric inputs + snapping for millimetre placement, dynamic resizing, fast 2D⇄3D. Study its precision/numeric-entry + snapping UX for our 2D editor (2026-06-19 audit). [app](https://arcadium3d.com) · [comparison](https://arcadium3d.com/articles/arcadium-3d-vs-sweet-home-3d)
- **D5 Render** — real-time GI renderer with a best-in-class **camera panel** (focal length, depth-of-field / aperture, focus object) and a clear "Camera and Views" UX; the model to emulate for our lens/DoF controls (PC2-CAM-DOF-LENS, 2026-06-20 research). Also ships a one-click **"two-point perspective" / keep-verticals-vertical** toggle (as does Enscape's camera panel above) — the model for our `twoPointPerspective` vertical-line-lock camera toggle (FEAT-D, 2026-07-04 research): level the camera + apply a vertical lens-shift so wall corners/door frames stay parallel instead of converging when the view is pitched. [app](https://www.d5render.com) · [docs](https://docs.d5render.com/user-guide/view/camera) · **GarageFarm "Mastering DoF in CGI"** is a good parameter/UX reference for sensible interior DoF defaults: [guide](https://garagefarm.net/blog/mastering-depth-of-field-in-photography-and-cgi).
- **FEATURE_PARITY.md** — the living parity matrix (Coohom + Sweet Home 3D deep-dives) distilling this research into a prioritised, client-side-feasible roadmap.
- **Mattoboard** — real-time 3D **materials & furniture moodboard** ("DesignStream") tool; directly relevant to our existing moodboard-export surface — study its material-forward board UX (2026-07-04 deep-audit pass). [app](https://mattoboard.com/)
- **Home Planner** (homeplannerapp.com) — 2D/3D web+mobile planner with a very large multi-brand **shoppable catalog** (400k+ items / 30k+ brands) + AR. Backend/licensed-asset-led — informs the tracked catalog-expansion / F11 brand-importer work, not a client-doable feature (2026-07-04 round-2 audit).
- **Dulux Visualizer** — real-time AR camera wall-colour paint preview; the AR paint-preview benchmark (2026-07-18 round-3 pass). [app](https://play.google.com/store/apps/details?id=com.akzonobel.uk.dulux)
- **Behr Paint Color Visualizer** — manufacturer paint-on-your-photo web tool; precedent for our real-photo finish visualizer candidate (2026-07-18 round-3 pass). [app](https://www.behr.com/consumer/colors/paint/visualizer)
- **DecorViz** — "room photo + product photo → realistic in-room composite" AI; relevant if product-visualization AI is ever revisited (2026-07-18 round-3 pass). [app](https://decorviz.ai)

### Singapore renovation-domain sources (UX research round 4, 2026-07-19)
Not planner apps — the cited knowledge base for the round-4 **SG-authentic advisory**
features (aircon BTU, ceiling clearance, floor loading, OCS starter, socket/DB targets,
reno rules). See `docs/research/2026-07-19-ux-research-round-4.md`.
- **Aircon BTU sizing (SG)** — the ~50-60 BTU/ft² rule + sun/ceiling/open-kitchen modifiers behind R4-1. [silverback](https://silverbackaircon.sg/aircon-btu-calculation-guide/) · [skyblue](https://skyblueaircon.com/blog/what-size-btu-for-hdb-room)
- **HDB ceiling heights** — 2.6 m standard, ≥2.4 m finished clearance, cornices to 2.1 m (R4-2). [Qanvast](https://qanvast.com/sg/articles/standard-hdb-ceiling-heights-what-you-cancannot-do-to-alter-them-3527) · [iFix](https://ifix.sg/hdb-ceiling-height-explained-standard-measurements-and-practical-insights/)
- **HDB Optional Component Scheme (OCS)** — BTO handover finishes/fittings behind R4-3. [Qanvast](https://qanvast.com/sg/articles/hdb-optional-component-scheme-ocs-is-it-worth-opting-in-1873) · [DollarsAndSense](https://dollarsandsense.sg/complete-guide-hdbs-optional-components-scheme-ocs/)
- **HDB electrical / DB planning** — per-room socket counts + DB load (R4-4). [Goldberg](https://goldberg-home.com/blogs/blogs/how-many-electrical-sockets-do-i-need-for-hdb-bto-singapore) · [HomeGenie](https://homegenie.com.sg/blogs/news/hdb-electrical-renovation-guide-singapore)
- **HDB floor loading** — 150 kg/m² slab limit, ≤50 mm concrete raise (R4-5). [Home&Decor](https://www.homeanddecor.com.sg/design/renovation-guidelines-hdb-singapore/) · [FloorRich](https://floorrich.com/an-easy-to-understand-guide-to-hdb-flooring-guidelines/)
- **HDB reno rules** — wall hacking, wet-area 3-yr tile rule, grille compliance, working hours, DRC permits (R4-6/R4-7). [ElementsID](https://elementsid.com.sg/can-you-hack-hdb-walls/) · [DeGrille](https://degrille.com.sg/article/are-invisible-grilles-approved-by-the-hdb/) · [RCS](https://renovationcontractorsingapore.com/blogs/news/hdb-renovation-noise-rules-working-hours-2026) · [HDB official](https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/renovation/important-information)
- **BTO defect / DLP** — 1-yr DLP, 5-yr ceiling-leak / 10-yr spalling warranty windows (R4-8). [HomeMatch](https://homematch.sg/renovation-guides/bto-defect-checklist-defect-liability-period) · [HDB official](https://www.hdb.gov.sg/residential/living-in-an-hdb-flat/moving-in/rectification-work-for-new-flats)

### Singapore renovation-domain sources (blank-slate gap analysis, 2026-07-19)
The cited knowledge base for the blank-slate journey queue (whole-reno budget by trade,
aircon system planning, bare/resale intake). See `docs/research/2026-07-19-blank-slate-gap-analysis.md`.
- **HDB/BTO renovation cost breakdown by trade (2025-26)** — carpentry 25-40%, tiling/wet works ~25%, M&E ~15%, fixtures ~20%; hacking/wiring/plumbing lines for resale (BSJ-1). [HDB Group Reno](https://hdbgroupreno.sg/services/hdb-bto-renovation-cost-timeline-in-singapore-2025-guide/) · [9creation](https://9creation.com.sg/hdb-bto-renovation-cost-breakdown/) · [Qanvast 3/4/5-room 2025](https://qanvast.com/sg/articles/how-much-is-a-3-4-and-5-room-hdb-flat-renovation-in-2025-3384) · [RCS 2026](https://renovationcontractorsingapore.com/blogs/news/hdb-renovation-budget-2026-complete-cost-guide-real-pricing)
- **Aircon SYSTEM planning (SG)** — System N = N indoor units on one condenser (System 3 = 4-room norm, System 4 = 5-room/condo); ~110 kg/panel ledge weight limit (BSJ-2). [VD Aircon](https://www.vdairconservices.com/aircon-system-2-3-4-singapore-guide/) · [aircons.sg](https://aircons.sg/blog/system-3-vs-system-4-vs-system-5-which-aircon-system-fits-your-hdb) · [FC Aircon](https://fcairconservicing.com/guide/aircon-system-1-2-3-4-5/)

## Furniture asset-building / 3D modeling tools (Asset Studio research, 2026-07-16)
References for turning the GLB designer into a professional furniture asset builder —
see `docs/asset-studio-plan.md` for the staged program this research seeds.

- **Tylko** — parametric consumer furniture configurator: size/depth/colour sliders + add-ons
  (doors, drawers, legs), parametric code tied to ergonomics emitting production files. The
  primary UX benchmark for an approachable custom-furniture builder. [app](https://tylko.com)
- **Shapr3D** — history-based parametric solid (B-rep) CAD with true edge fillet/chamfer;
  touch-first approachable UI. [app](https://www.shapr3d.com)
- **Plasticity** — "CAD for artists": Parasolid NURBS kernel with artist UX; the model for
  pro fillets + curves without CAD ceremony. [app](https://www.plasticity.xyz)
- **Womp** — browser SDF/metaball "liquid 3D" sculpt for non-experts; real-time booleans,
  blended materials. [app](https://womp.com)
- **Spline** — browser 3D design tool with direct three.js/React export; designer-friendly
  materials/animation. [app](https://spline.design)
- **TinkerCAD** — browser primitive + "solid/hole" boolean modeling; the approachability
  benchmark for zero-experience users (its group/hole metaphor maps onto three-bvh-csg).
  [app](https://www.tinkercad.com)
- **SketchUp Free** — browser push/pull surface modeling; the most teachable 2D→3D metaphor.
  [app](https://www.sketchup.com/plans-and-pricing/sketchup-free)
- **Polyboard** — parametric board/panel cabinet construction (material thickness, hardware
  placement, cutting optimization). [app](https://wooddesigner.org/polyboard-software-tools/)
- **SWOOD (Eficad)** — the reference for hardware/joinery component libraries (Blum/Hettich/
  Grass) with auto connector insertion on detected panel contact surfaces.
  [app](https://swood.eficad.com)
- **SketchList 3D / Mozaik / Cabinet Vision** — board-based cabinet-CAD complexity ladder
  (cut lists, assembly drawings, CNC). [overview](https://sketchlist.com/blog/best-cabinet-design-software/)
- **Opendesk** — open-source CNC-cut flat-pack furniture; reference for modular,
  manufacturable open designs. [app](https://www.opendesk.cc)
- **Open-source web-CAD to study (dev reference, not competitors):**
  [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) (fast browser booleans) ·
  [chili3d](https://github.com/xiangechen/chili3d) (OCCT→WASM + three.js) ·
  [replicad](https://replicad.xyz) / [opencascade.js](https://ocjs.org) (B-rep in browser;
  ~4–15 MB WASM — ruled out for now in the plan).

## Defect-inspection tools (SG, 2026-07-24 gap-analysis r2 — reference for BSJ2-2 defect pins)

- **Easy Inspection** — SG defect-checking service for BTO/condo; the per-room marked-up
  defect list + joint-inspection workflow is the artifact BSJ2-2 reproduces in-app.
  [site](https://easyinspection.sg/)
- **Defect Check SG / A1 Inspection / PropDefect** — same category; PropDefect publishes the
  per-surface check taxonomy (hollow tiles, paint, doors/windows, ponding, seepage) worth
  mirroring in the defect-pin categories. [site](https://defectcheck.sg/) ·
  [DLP explainer](https://a1inspection.sg/what-is-the-defects-liability-period/) ·
  [taxonomy](https://propdefect.com/what-we-check/)

## UI/UX component & motion libraries (2026-08-19 UI/UX research cycle — reference for polish work)

Pattern sources for the design system (`DESIGN.md`), not runtime dependencies — the app stays
plain CSS/React (no Tailwind, no framer-motion). Steal the *mechanics*, port to tokens.

- **NameThatUI** — visual dictionary of canonical UI-element names (inspector, segmented
  control, disclosure, source list…); the naming vocabulary `DESIGN.md` standardizes on.
  [site](https://namethatui.com) · [methodology](https://namethatui.com/methodology)
- **designmd.ai / DESIGN.md format** — Google Stitch's one-file design-contract format for AI
  coding agents; our root `DESIGN.md` follows it (concrete values, semantic roles, do/don'ts).
  [catalog](https://designmd.ai) · [format](https://designmd.ai/what-is-design-md)
- **Watermelon UI** — open-source registry (~600 micro-interaction components, MIT source on
  GitHub); best-in-class inline feedback patterns: state-morph copy/save buttons, inline
  edit, fluid tabs (sliding highlight), onboarding checklist, scroll-fade, inline toast.
  Spring timings: stiffness 200–400/damping 15–30; reveals `cubic-bezier(.19,1,.22,1)`.
  [site](https://ui.watermelon.sh) · [source](https://github.com/WatermelonCorp/watermellon-registry)
- **Motion-Primitives** — ~33 copy-paste animated React components (MIT); canonical mechanics
  for text shimmer (background-clip moving gradient), border trail (`offset-path` +
  `offset-distance`), progressive blur (stacked masked backdrop-filters), animated number,
  sliding tab highlight, image before/after comparison, morphing dialog.
  [site](https://motion-primitives.com) · [source](https://github.com/ibelick/motion-primitives)
- **Haikei** — free SVG generators (blobs, layered waves, blurry gradients, scatter); one-time
  static asset generation for empty-state/onboarding/share-card backdrops, recolorable via
  CSS variables. Free commercial use, no attribution. [app](https://haikei.app)
- **shadcn/ui + Origin UI** — the token-driven semantic-CSS-variable reference and the best
  plain-markup input/stepper/tree patterns to crib from. [shadcn](https://ui.shadcn.com) ·
  [origin](https://originui.com)
- **Sonner / Vaul (Emil Kowalski)** — gold-standard toast behavior spec (stack-collapse,
  hover-expand, pause-on-hover, promise toasts) and mobile bottom-sheet spec (snap points,
  drag handle, momentum dismissal). [sonner](https://sonner.emilkowal.ski) ·
  [vaul](https://vaul.emilkowal.ski)
- **Motion (motion.dev)** — framer-motion's successor; its documented technique of
  compiling spring physics into native CSS `linear()` easing (plus FLIP layout-animation
  and scroll-triggered/linked guidance) ports to plain CSS/WAAPI with zero dependencies.
  [docs](https://motion.dev/docs/spring) · [CSS springs](https://motion.dev/docs/css)
- **KokonutUI** — MIT React/Tailwind collection (~46 components); productivity-relevant
  mechanics: hold-to-confirm button, expanding-label toolbar, direction-aware tab content,
  smooth bottom-sheet stagger. Most of the rest is marketing-flash (banned here).
  [site](https://kokonutui.com) · [source](https://github.com/kokonut-labs/kokonutui)
- **Bklit UI** — MIT charts/dataviz registry (visx/d3/motion stack — not adoptable as a
  dependency); pattern-level takeaway: animated ring/gauge sweeps paired with animated
  numeric readouts. [site](https://bklit.com) · [source](https://github.com/bklit/bklit-ui)
- **Laws of UX / animations.dev** — UX heuristics checklist (Fitts, Hick, Doherty <400ms
  feedback, goal-gradient) and the authority on productivity-tool motion taste (150–300ms
  ease-out enters, faster ease-in exits, transform/opacity only).
  [lawsofux](https://lawsofux.com) · [animations.dev](https://animations.dev)

## Interior-style grounding references (2026-09-02, G8 theme audit)

Used to verify that the app's theme presets encode what these styles actually
look like, rather than invented palettes. Full audit + verdicts:
`docs/research/2026-09-02-scheme-theme-grounding.md`. Consult these before adding
or editing a `LayoutPreset`'s finishes or description.

- **Japandi palette + materials** — warm-white/ivory/beige base, warm oak, black
  used SPARINGLY for contrast, rattan/bamboo and handmade ceramics for texture.
  [shopjapandi](https://www.shopjapandi.com/blogs/design/japandi-color-palette) ·
  [Trove](https://troveobjectgallery.com/pages/complete-guide-to-japandi-home-decor) ·
  [homeoration](https://homeoration.com/japandi-color-palette/)
- **Scandinavian woods + textiles** — light woods named specifically (white oak,
  ash, birch, pine) in matte/low-sheen, white walls over pale floors, linen /
  wool / cotton.
  [Floor & Decor](https://www.flooranddecor.com/scandinavian-inspired-wood) ·
  [Trove](https://troveobjectgallery.com/blogs/curators-journal/scandinavian-home-decor-guide) ·
  [decosurfaces](https://www.decosurfaces.com/en/blog/article/138-7_ideas-for-scandinavian-floor.html)
- **Industrial without the cold-warehouse problem** — the key source for WHY warm
  industrial uses greige/warm-taupe walls rather than concrete grey, plus
  dark-stained oak / reclaimed timber / walnut and honeyed-tan leather as the
  warm counterpoints.
  [ArchitectureCourses](https://www.architecturecourses.org/home-and-garden/industrial-interior-design) ·
  [awedeco palette](https://awedeco.com/industrial-color-palette/) ·
  [domkapa](https://domkapa.com/en/blog/inspiration/industrial-interior-design-101-essential-tips-to-embrace-this-raw-aesthetic/)
- **Singapore HDB / condo defaults** — confirms white walls + light/warm oak as
  the perennial SG default and the "limit yourself to one or two accent tones
  like deep navy" discipline the `moveIn` preset encodes.
  [Space Factor](https://www.spacefactor.com.sg/top-hdb-living-room-design-ideas-in-singapore/) ·
  [RS Carpentry](https://rscarpentry.com.sg/interior-design-trends/scandinavian-interior-design-singapore-hdb-condo-guide/) ·
  [Swiss Interior](https://www.swissinterior.com.sg/blog/7-best-modern-interior-design-hdb-styles-in-singapore)
