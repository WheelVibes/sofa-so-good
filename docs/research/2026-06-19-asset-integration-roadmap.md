# Asset-Source Integration Roadmap

**Date:** 2026-06-19
**Input:** `research/MODEL_LIBRARIES.html` (111 sources, by render quality + license + programmatic access)
**Purpose:** Turn the catalogue into a prioritized, actionable plan — *which* sources to wire in and *how*, mapped onto the pipeline that already exists in this repo.

> Research/planning only. No code, no version bump.

---

## 0. What the repo already does (so we don't re-propose it)

The asset pipeline is more built-out than the catalogue assumes. Confirmed by reading the source:

### Remote CC0 provider system — `src/catalog/remote/`
- `RemoteProvider` interface (`types.ts`): `id`, `fetchIndex()`, `fetchThumbnail()`, `fetchAsset()`, optional `fetchSize()`.
- Two providers registered in `providers/index.ts`: **`polyhaven`** and **`ambientcg`** (`PROVIDERS` map).
- `PROD_PROVIDER_IDS = ['polyhaven']` (`providers/index.ts:14`); `activeProviderIds(isDev)` returns all in dev, only prod-safe in prod (`providers/index.ts:18`).
- `providers/polyhaven.ts` — fetches **both models and textures** (`/assets?t=models`, `/assets?t=textures`, base `https://api.polyhaven.com`); CORS-friendly → already prod.
- `providers/ambientcg.ts` — materials only; routes through the Vite `/acg` + `/acg-cdn` proxies (no CORS headers upstream) → dev-only today.
- `resolver.ts` — `bundleToFurnitureDef()` / `bundleToMaterialDef()` patch GLTF `images[].uri`/`buffers[].uri` to blob URLs and build `TexturedMaterialDef` (`id: '<provider>:<slug>:<resolution>'`).
- `hooks.ts` — `useRemoteEntries(kind)`, `useThumbnail`, `useAssetSize`, `useResolveStatus`; thumbnails cached in IDB.

### Vite proxies — `vite.config.ts`
`/acg` → ambientcg.com, `/acg-cdn` → acg-media.ambientcg.com, `/kenney` → kenney.nl, `/ikea` → localhost:5174 (scraper sidecar). **All dev-only.**

### Packs — `src/catalog/packs/`
`Pack.kind: 'zip' | 'ikea-live' | 'poly-pizza' | 'manual'` (`types.ts:53`); `devOnly?` flag; `visiblePacks(isDev)` (`registry.ts`) hides dev-only packs in prod.
Already registered (`registry.ts`):
- **`poly-pizza`** — `kind:'poly-pizza'`, **prod-visible**. Programmatic in-browser fetch via `polyPizza.ts` (`https://api.poly.pizza/v1.1`, `x-auth-token` user key, CORS-friendly CDN `static.poly.pizza`). CC0/CC-BY, attribution stored per model.
- **`kenney-furniture-kit`** — `kind:'zip'`, **devOnly** (needs `/kenney` proxy / prod mirror).
- **`ikea-sg-live`** — `kind:'ikea-live'`, **devOnly** (scraper sidecar).
- Manual link-out cards (**devOnly**, hand-download → Upload dialog): `quaternius`, `sketchfab`, `furnimesh`, `open-source-3d-assets`, `free3d`; material link-outs `cgbookcase`, `texturecan`, `3dtextures`, `sharetextures`.

### Model render / import — `src/furniture/`
- `GltfModel.tsx` (drei `useGLTF`, footprint + support-plane caches).
- `gltf/decoders.ts` — Draco (self-hosted `public/draco/`), Meshopt, KTX2/Basis.
- `gltf/lod.ts` — LOD registry (`low`/`medium`, `lodAssetId`, `registerLodVariants`, `resolveLodUrlSync`); `gltf/textureBudget.ts` per-tier texture caps.
- `optimize/optimizeGlb.ts` (gltf-transform: weld/dedup/prune/WebP/Draco), `optimize/lodVariants.ts` (meshopt `simplify`), `optimize/runOptimize.ts` (+ `optimize.worker.ts`).
- Upload: `furniture/upload/` (`readDrop`, `bulkImport`, `runImport`, `validate`, `persist`, `persistLods`) → IDB + `addManyUserFurniture` → `UserGltfDef`. Hydrated on reload.

### IKEA scrape pattern — `scripts/scraper-server.mjs` (+ `scripts/scraper/`, `price-server.mjs`)
Dev-only sidecar on :5174. Crawl product pages → extract `<model-viewer>` GLB src → download per finish → optimize (Draco/meshopt/Basis) + LOD siblings → serve `/ikea/{group}/{file}.glb`. SSE progress; gated by **`ikeaLive`** flag (`devOnly`). `price-server.mjs` (:5175) behind **`livePrices`** (`devOnly`).

### Feature flags — `src/features/flags/registry.ts`
`FlagDef = { label, description, default, devOnly?, tier:'simple'|'pro' }`; `resolveFlags(isDev, overrides, isAdmin, uiMode)` forces `devOnly` off in prod and `pro` off in Simple.
Relevant existing flags: `packs` (pro, default on), `remoteMaterials` (pro, "CC0 material browser"), `modelUpload` (simple), `ikeaLive` (pro/devOnly), `livePrices` (pro/devOnly), `aiPhotoreal` (image-to-image, pro), `aiWalls` (vision, pro). **No remote-furniture flag and no 3D-generation flag exist yet.**

### Materials DLC / `mat:<id>` — `src/materials/`
`FURNITURE_MAT_PREFIX = 'mat:'`; a finish of `mat:<catalogId>` resolves a catalog material (`buildFurnitureMaterial`), falling back to procedural patterns (`procedural/patterns/*`) until the textured material is ready. Textured material ids are `'<provider>:<slug>:<resolution>'`. Remote materials are fetched per-use (no install step); `remoteMaterials` gates the panel.

**Implication for this roadmap:** the highest-value work is (a) *promoting existing dev-only sources to prod* by solving the one shared blocker — a **production CORS proxy/backend** — and (b) *adding programmatic adapters* for sources that are currently manual link-outs but actually expose CORS-friendly APIs/CDNs (Poly Haven models in the catalog, more Poly Pizza, an AI-generation sidecar). We avoid re-proposing Poly Pizza, ambientCG, Poly Haven, Quaternius, Kenney, IKEA — they already exist in some form.

---

## 1. Tier-1 — Prod-ready now (CC0 / CC-BY, CORS/API-friendly)

These can ship in **production** mapped onto existing mechanisms. CC0 → no attribution; CC-BY → store + surface attribution (the inspector + `CREDITS.json` path already exists).

| Source | Quality | Status today | Integration path | License handling | CORS/proxy | Effort |
|---|---|---|---|---|---|---|
| **Poly Haven — models** | high | Provider fetches models already, but only **materials/HDRI** surface in catalog UI; furniture-model browsing is the gap | Surface `kind:'furniture'` Poly Haven entries in the catalog tab behind a new **`remoteFurniture`** flag (mirror of `remoteMaterials`); reuse `useRemoteEntries('furniture')` + `bundleToFurnitureDef`. No new fetch code. | CC0, no attribution | None (CORS-OK, `api.polyhaven.com`) | **S** |
| **Poly Pizza — expand** | medium | Prod pack exists, user-key-gated, search-only | Add curated default queries + "featured" tab; optionally a bundled-key build-time fetch for a small starter set so no key is needed for first run. Reuse `polyPizza.ts`. | CC0/CC-BY (already stored per model) | None | **S** |
| **ambientCG — materials (prod)** | high | Provider exists, **dev-only** via `/acg` proxy | Add `ambientcg` to `PROD_PROVIDER_IDS` *once a prod proxy/edge function exists* (see Blockers). Until then keep dev-only. | CC0 | **Needs prod proxy** | **M** (gated on proxy) |
| **Quaternius — programmatic pack** | medium | Manual link-out (Google-Drive, no CORS) | Convert to a build-time bulk-ingest → bundle a curated CC0 subset as a static `kind:'zip'` pack served same-origin (no Google-Drive at runtime). Reuse pack install + `parseEntries`. | CC0, no attribution | Same-origin (bundled) | **M** |
| **Google Scanned Objects (GSO)** | high | Not present | **CC-BY 4.0, commercially safe.** Offline bulk (Gazebo Fuel), convert OBJ→GLB, optimize, bundle a curated furniture/houseware subset as a static pack. | CC-BY → attribution required | Same-origin (bundled) | **M** |
| **The Base Mesh** | high (geometry) | Not present | CC0 clean furniture geometry → bundle subset, apply `mat:<id>` materials (matches the procedural-over-geometry rule). | CC0 | Same-origin (bundled) | **M** |
| **Smithsonian / Threedscans** (decor/accents) | ultra | Not present | CC0 scanned accent props (busts/vases) → decimate, bundle small curated set for shelf decor. | CC0 (Smithsonian) / PD (Threedscans) | Same-origin (bundled) | **M** |

**Top-3 prod-ready quick wins:** (1) Poly Haven **models** in the catalog (provider already fetches them — pure UI/flag work), (2) Poly Pizza **featured/default queries** (no key needed for first run), (3) **GSO** curated CC-BY pack (the cleanest commercially-safe scanned set in the catalogue).

---

## 2. Tier-2 — Dev-gated (scrape / licensed retailers)

Model these on the existing IKEA sidecar (`scraper-server.mjs`) + `kind:'ikea-live'`/`'manual'` packs + a `devOnly` flag. Legal: retailer/marketplace IP — **never ship the GLBs**; dev/reference only (CLAUDE.md dev-gating rule).

| Source | Quality | Discovery | Extraction | Gate | Legal caveat | Effort |
|---|---|---|---|---|---|---|
| **Wayfair 3D Model API** | high | Official REST API; demo endpoint `api.wayfair.com/v1/3dapi/models_demo` works keyless (~200 models) | Real API returns glTF/GLB — no scraping needed | new `wayfair` provider/pack, `devOnly` flag | Proprietary; visualization-only grant | **M** |
| **3D Cloud by Marxent cluster** (Macy's, Ashley, Lowe's, La-Z-Boy, Joybird, John Lewis, B&Q, Herman Miller…) | medium→high | Per-brand sitemap | One `<model-viewer>`/Scene-Viewer extraction pattern → shared 3D-Cloud CDN GLB; **one adapter unlocks ~a dozen brands** | extend scraper sidecar; `devOnly` | Proprietary per-retailer | **M→L** |
| **Threekit / Emersya / Cylindo cluster** (Burrow, Floyd, BoConcept…) | medium→high | Brand PDPs embed vendor viewer | Extract GLB/USDZ from vendor CDN network calls; **one adapter per vendor** unlocks all its brands | scraper adapter; `devOnly` | Proprietary | **L** |
| **Castlery (SG)** | high | SG/US/AU sitemap | `<model-viewer>` `src` (GLB) + `ios-src` (USDZ) | scraper adapter; `devOnly` | Proprietary; **SG-relevant** | **M** |
| **HipVan (SG)** | medium | Sitemap | model-viewer if present (**verify on live PDP first**) | scraper adapter; `devOnly` | Proprietary; SG-relevant | **M** |
| **Crate&Barrel/CB2, West Elm/Pottery Barn, Target, Article, Houzz, Amazon AR** | medium→high | Sitemaps | Standard AR-tag GLB/USDZ extraction; Amazon heavy anti-bot | scraper adapters; `devOnly` | Proprietary | **M each** |
| **Sketchfab Download API** (programmatic) | high | Data API v3 search (license filter) | Download API returns signed glTF URLs; **OAuth required** | server-side fetch behind `devOnly` (manual link-out card already exists) | Per-model CC; honour CC-BY attribution | **L** (OAuth/server) |
| **CGTrader / Fab APIs** | medium→high | Partner OAuth APIs | Native GLB on many; partner-gated | Track only; needs partner approval | Paid/per-model | **L** (blocked on partner access) |

**Highest-leverage Tier-2:** Wayfair (a real keyless-demo API, no scraping) and the **3D-Cloud cluster** (one extraction pattern → many major retailers). Castlery + HipVan are the SG-relevant picks for this app's HDB/condo audience.

---

## 3. Tier-3 — Datasets (bulk / offline ingest)

Offline pipeline: bulk download → filter by per-object license → convert to GLB → `optimizeGlb` + `generateLodVariants` → bundle a **curated CC-clean subset** as a static pack (or keep as a dev-only authoring corpus). Reuse `optimize/runOptimize.ts` headlessly (Node path already exists for the scraper).

| Dataset | Furniture fit | License | Commercial-safe? | Disposition |
|---|---|---|---|---|
| **Google Scanned Objects** | houseware/decor | CC-BY 4.0 | ✅ Yes (attribution) | **Bundle** curated subset (also Tier-1) |
| **Objaverse 1.0 / -XL** | huge (chairs/sofas/tables) | ODC-By; **per-object CC in metadata** | ✅ only the CC0/CC-BY-filtered slice | Filter per-object → bundle CC-clean curated subset; Python API makes filtering feasible |
| **Redwood 3DScan** | some furniture | **Public domain** | ✅ Yes | Bundle-eligible; raw scans need cleanup (quality trade-off) |
| **ABO (Amazon Berkeley Objects)** | real product GLB (7,953) | CC BY-**NC** 4.0 | ❌ No (non-commercial) | R&D/eval only — never ship |
| **3D-FUTURE** | best furniture fit (9,992) | ToU research-only | ❌ No | R&D/eval only |
| **3D-FRONT** | room **layouts** (18,797) | CC BY-NC | ❌ No | Layout priors for `autoArrange` research only |
| **ShapeNet / Pix3D / OmniObject3D / ScanNet(++) / Matterport3D / HM3D / Replica / CO3D / Toys4K** | shape/scene | research/NC (mostly) | ❌ No (Toys4K = per-asset vet) | R&D/eval; do not ship |

**Net:** only **GSO, Redwood, and the CC-filtered Objaverse slice** are commercially shippable. ABO/3D-FUTURE/3D-FRONT are the best *furniture* data but are non-commercial — use them as a dev-only authoring/eval corpus and for layout priors, not bundled assets.

---

## 4. Recommended sequence — AI-INTEG work items (value ÷ effort)

Ordered by value÷effort. Each lists source, mechanism, files touched, license disposition, and a conflict-group for parallel dispatch.

| ID | Source | Mechanism | Files touched | Disposition | Effort | Conflict group |
|---|---|---|---|---|---|---|
| **AI-INTEG-001** | **Poly Haven models** | New `remoteFurniture` flag + surface `useRemoteEntries('furniture')` in catalog tab (provider already fetches models) | `features/flags/registry.ts`, `ui/catalog/*`, remote `hooks.ts` (read-only) | **Prod** (CC0) | **S** | A (flags+catalog-ui) |
| **AI-INTEG-002** | **Poly Pizza featured/default** | Default queries + optional bundled starter set; no-key first run | `catalog/packs/polyPizza.ts`, `ui/catalog/PacksTab.tsx` | **Prod** (CC0/CC-BY) | **S** | B (packs) |
| **AI-INTEG-003** | **Prod CORS proxy** (edge fn) → unblocks ambientCG + future scrape mirror | Edge/serverless proxy; add `ambientcg` to `PROD_PROVIDER_IDS` | `vite.config.ts` note, deploy config, `providers/index.ts` | **Prod** (CC0) | **M** | C (infra) — *prereq for many* |
| **AI-INTEG-004** | **Google Scanned Objects** | Offline OBJ→GLB → `runOptimize` → bundle curated CC-BY pack (`kind:'zip'`, same-origin) | `scripts/` ingest, `catalog/packs/registry.ts`, parser | **Prod** (CC-BY, attribution) | **M** | D (offline-ingest) |
| **AI-INTEG-005** | **Wayfair 3D API** | New retailer provider/pack using keyless demo endpoint | `catalog/remote/providers/` or scraper adapter, new `devOnly` flag | **Dev-gated** | **M** | E (retailer-adapters) |
| **AI-INTEG-006** | **3D-Cloud (Marxent) cluster** | One model-viewer extraction adapter in scraper sidecar → ~12 retailers | `scripts/scraper/`, pack `kind:'ikea-live'`-style, `devOnly` flag | **Dev-gated** | **M→L** | E (retailer-adapters) |
| **AI-INTEG-007** | **Castlery + HipVan (SG)** | model-viewer scrape adapters (verify HipVan PDP first) | `scripts/scraper/` adapters, packs, `devOnly` | **Dev-gated** | **M** | E (retailer-adapters) |
| **AI-INTEG-008** | **Self-hosted AI generation** (TRELLIS — MIT; fallback TripoSR/Hunyuan/SF3D) | Dev-only generation sidecar (like scraper-server) → GLB → `runOptimize` → import; new `aiGenerate3d` `devOnly` flag | `scripts/` sidecar, `features/flags/registry.ts`, upload path | **Dev-gated** (TRELLIS MIT = prod-eligible later) | **L** | F (ai-gen sidecar) |
| **AI-INTEG-009** | **Objaverse CC-filtered subset** | Python per-object license filter → GLB → optimize → bundle curated pack | `scripts/` ingest, `catalog/packs/registry.ts` | **Prod** (CC0/CC-BY slice only) | **L** | D (offline-ingest) |
| **AI-INTEG-010** | **CC0 material/HDRI quick wins** | See §5 — promote Poly Haven HDRI tab; bundle cgbookcase/3DTextures CC0 sets as `mat:<id>` packs | `materials/*`, `catalog/packs/registry.ts`, backdrops/HDRI | **Prod** (CC0) | **S→M** | G (materials/hdri) |

**Parallel dispatch:** groups A, B, D, E, F, G are independent. Group **C (AI-INTEG-003 prod proxy)** is a prerequisite that unblocks the prod-promotion half of ambientCG and any prod retailer mirror — sequence it early but it doesn't block the bundled-pack items (D/G ship same-origin, no proxy).

---

## 5. Materials / HDRI quick wins (for the `mat:<id>` DLC + backdrops)

The `mat:<id>` system applies a CC0 textured material over the procedural fallback. Best additions:

- **Poly Haven HDRIs** — already CC0 + already provider-fetched; surface an HDRI/backdrop tab (the `backdrops` flag exists). **Prod, S.** Top pick for IBL + window sky.
- **ambientCG materials in prod** — best CC0 material API; blocked only on the prod proxy (AI-INTEG-003). **Prod-after-proxy, M.**
- **cgbookcase** (CC0, cleanest license) and **3DTextures.me** (CC0) — currently manual link-outs; bundle curated full-PBR sets (albedo/normal/rough/AO) as same-origin material packs → `mat:<id>` ids. Cloudflare blocks runtime fetch, so **build-time bundle** is the path. **Prod, M.**
- **Maxime Roz interior HDRIs** (free, 6 calibrated interiors) — valuable for indoor HDB/condo lighting; manual download → bundle. **Prod (verify attribution), S.**
- **Adobe Substance / Firefly text-to-texture** — strongest *generated* PBR; commercial-safe but app/subscription-bound — dev/authoring only, not runtime.

Avoid despite CC0 labels: **ShareTextures** (ToS bans automated download/embedding), **NoEmotion** (NoDerivatives blocks re-encoding), **Poliigon/Textures.com** (proprietary EULA, no redistribution).

---

## 6. Blockers & honest caveats

- **Production CORS proxy / backend (AI-INTEG-003) is the single recurring blocker.** ambientCG, cgbookcase, 3DTextures, and any runtime retailer fetch all lack CORS headers. Until an edge function / same-origin mirror exists, these stay dev-only (`/acg` Vite proxy) or must be **build-time bundled** (the route taken for GSO/Quaternius/material packs, which is why those are prod-eligible without the proxy).
- **OAuth sources** (Sketchfab Download API, CGTrader, Fab) need a server to hold credentials — not anonymous client-side. Keep as dev-only/manual until a backend exists.
- **Retailer scrapes are IP** — visualization/reference only, always `devOnly`, never bundle GLBs into prod. Verify `<model-viewer>` presence on a live PDP before building any adapter (catalogue flags Article/West Elm/HipVan as unverified).
- **Dataset licenses:** only GSO (CC-BY), Redwood (PD), and the CC-filtered Objaverse slice are shippable. ABO/3D-FUTURE/3D-FRONT/ShapeNet/Matterport/Replica/CO3D are non-commercial → R&D/eval only.
- **AI generation:** TRELLIS (MIT) is the cleanest license + PBR + GLB combo for an eventual prod path; start it as a dev-only sidecar. Hosted generators (Meshy/Rodin/Tripo) are paid and need a backend + spend — defer.
- **CC-BY attribution** must be captured at ingest and surfaced (inspector + `CREDITS.json`) for Poly Pizza CC-BY, GSO, Sketchfab CC-BY, and the CC-BY Objaverse slice — the per-entry attribution field already exists on packs/remote entries.
