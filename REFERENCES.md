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
- **Havenly / Spacejoy** — consumer "AI generate → upsell to human designer" funnel; **style/swipe quiz onboarding** + **press-and-hold local restyle** + deep shop-the-look (2026 pass).
- **DecorMatters** — gamified/social design-game reference: design challenges, Dcoins/EXP/levels/badges/leaderboards, community feed + AR placement + AR Ruler (2026 pass). The gold standard for a social/gamified front-end (backend-dependent).
- **Spacely AI Point-and-Edit / Decor8 Chat-to-Design** — best-in-class local "magic recolor"/conversational restyle UX; **Pinterest-board moodboard import** (Spacely) (2026 pass).
- **Arcadium 3D** — browser SH3D-style planner positioned on **speed + precision editing**: numeric inputs + snapping for millimetre placement, dynamic resizing, fast 2D⇄3D. Study its precision/numeric-entry + snapping UX for our 2D editor (2026-06-19 audit). [app](https://arcadium3d.com) · [comparison](https://arcadium3d.com/articles/arcadium-3d-vs-sweet-home-3d)
- **D5 Render** — real-time GI renderer with a best-in-class **camera panel** (focal length, depth-of-field / aperture, focus object) and a clear "Camera and Views" UX; the model to emulate for our lens/DoF controls (PC2-CAM-DOF-LENS, 2026-06-20 research). Also ships a one-click **"two-point perspective" / keep-verticals-vertical** toggle (as does Enscape's camera panel above) — the model for our `twoPointPerspective` vertical-line-lock camera toggle (FEAT-D, 2026-07-04 research): level the camera + apply a vertical lens-shift so wall corners/door frames stay parallel instead of converging when the view is pitched. [app](https://www.d5render.com) · [docs](https://docs.d5render.com/user-guide/view/camera) · **GarageFarm "Mastering DoF in CGI"** is a good parameter/UX reference for sensible interior DoF defaults: [guide](https://garagefarm.net/blog/mastering-depth-of-field-in-photography-and-cgi).
- **FEATURE_PARITY.md** — the living parity matrix (Coohom + Sweet Home 3D deep-dives) distilling this research into a prioritised, client-side-feasible roadmap.
- **Mattoboard** — real-time 3D **materials & furniture moodboard** ("DesignStream") tool; directly relevant to our existing moodboard-export surface — study its material-forward board UX (2026-07-04 deep-audit pass). [app](https://mattoboard.com/)
- **Home Planner** (homeplannerapp.com) — 2D/3D web+mobile planner with a very large multi-brand **shoppable catalog** (400k+ items / 30k+ brands) + AR. Backend/licensed-asset-led — informs the tracked catalog-expansion / F11 brand-importer work, not a client-doable feature (2026-07-04 round-2 audit).
