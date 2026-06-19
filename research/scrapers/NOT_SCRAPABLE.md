# Sources with NO scraper (and why)

Sources from [`../MODEL_LIBRARIES.html`](../MODEL_LIBRARIES.html) that are **not**
programmatically downloadable in a way we can ship — auth-gated, credit-metered,
ToS-prohibits-automation, paywalled behind anti-bot, or not real mesh geometry. Listed so
we don't re-attempt them. (Anything genuinely scrapable has a `<source>_scraper.py`.)

## Materials / textures
- **Poliigon** — proprietary EULA; only an auth-gated internal API (powers the Blender
  add-on); no anonymous download, no raw-file redistribution.
- **Textures.com** — credit-metered, account-gated; ToS forbids scraping/redistribution.
- **ShareTextures** — labelled "CC0" but ToS explicitly bans automated downloads,
  hotlinking, and embedding downloads in third-party apps (+ Cloudflare 403).
- **Architextures (ARTX)** — proprietary web generator; PBR/high-res export behind Pro
  login; no catalogue/API.

## Premium model marketplaces (paywall + anti-bot; ToS bans scraping)
- **Evermotion**, **Design Connected**, **CGAxis**, **Dimensiva**, **3DSky / 3DDD**,
  **Hum3D**, **3DExport** — login + paywall; all returned HTTP 403 to automated fetch
  (active anti-bot); EULAs bar redistribution. Manual purchase only. (CGTrader is the
  exception — it has an official OAuth API → `cgtrader_scraper.py`.)
- **TurboSquid** — ToS *explicitly* prohibits crawling/scraping/aggregation; only a
  seller-side publishing API exists (no buyer download API). Manual/paid only.
- **Chaos Cosmos** — closed ecosystem; assets consumable only inside Chaos host apps
  (V-Ray/Corona/Enscape); standalone redistribution forbidden; no API.
- **Quixel Megascans (Fab)** — Epic-account-gated; public download API is roadmap-only;
  free era ended 2024-12-31. Manual / Unreal-plugin only.
- **3D Warehouse (Trimble/SketchUp)** — Trimble-ID login required; no official 3DW API;
  per-model GMLA restricts commercial redistribution. (DAE export is per-model, manual.)
- **Archive3D** — free but Terms restrict to personal/non-commercial; uncertain provenance
  → legally unsafe to bundle. (Statically scrapable, but excluded on license grounds.)
- **PixelSquid** — delivers **pre-rendered 2D sprites (PNG/PSD), not 3D geometry** — unusable
  as a mesh source regardless of access.

## Free model libraries without a clean programmatic path
- **BlenderKit** — downloads are Blender-add-on-gated; no clean public download API.
- **Free3D** — login-gated; most assets personal-use license.
- **Clara.io** — no documented public bulk download API.
- **Printables (Prusa)** — account/GraphQL-gated; no documented public download API.
- **Thangs** — search is partner/API-key-gated (no open download API).
- **Google Poly** — defunct; its low-poly catalogue lives on at Poly Pizza
  (→ `poly_pizza_scraper.py`).

## HDRI
- **NoEmotion**, **openfootage (high-res)**, **sIBL Archive (free sets)** — free tiers are
  CC BY-ND / CC BY-NC-ND / CC BY-NC-SA (no-derivatives or non-commercial), which conflicts
  with an app that re-encodes/redistributes maps. Manual, license-restricted. (Poly Haven,
  ambientCG, CGEES, HDRMaps cover the commercial-clean HDRI need.)

## Retailers (no confirmed per-product 3D, or pure scrape with no API)
- Retailers WITH a confirmed/likely `<model-viewer>` path DO have a dev-only scraper
  (castlery, crateandbarrel, target, houzz, amazon, article, westelm). HipVan and other SG
  retailers were not confirmed to expose per-product 3D — verify a live PDP for a
  `<model-viewer>` before adding a scraper. The 3D-Cloud/Threekit/Cylindo *platform*
  clusters are reachable per-retailer via the generic `_retailer.py` pattern (point a thin
  wrapper at the brand's sitemap), so no separate platform script is needed.
