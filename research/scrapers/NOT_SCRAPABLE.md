# Material / HDRI sources we deliberately do NOT scrape

These PBR-material / HDRI sources from `research/MODEL_LIBRARIES.html` are **auth-gated,
credit-metered, or ToS-prohibited for automation**. No scraper is provided for them; they
remain manual / reference-only. Listed here so future work does not re-litigate them.

| Source | Reason no scraper |
| --- | --- |
| **Poliigon** (`poliigon.com`) | Proprietary royalty-free EULA (not CC0). No public/anonymous API — the only API is the internal, auth-gated one powering the Blender add-on, served over token-signed CDN URLs. Raw-file redistribution is prohibited by the EULA. Dev/reference only. |
| **Textures.com** (ex-CGTextures) | Proprietary royalty-free; **credit-metered, account-gated**, and the ToS **forbids scraping / bulk download**. No public bulk API. Assets may not be redistributed as-is (must be incorporated into a work). |
| **ShareTextures** (`sharetextures.com`) | Labelled "CC0" **but the ToS explicitly bans automated downloads, hotlinking, and embedding direct downloads in third-party apps** — directly conflicts with automated fetching. Cloudflare 403 on top. Avoided on legal + technical grounds. |
| **Architextures / ARTX** (`architextures.org`) | Freemium **proprietary**; it is a web *generator* app (no static asset catalogue), and PBR / high-res export is behind a **Pro login subscription**. No API; Cloudflare 403. Commercial + PBR export are license-gated. Manual only. |

## Borderline sources that DID get a scraper (with caveats documented in their header)

- **FreePBR.com** — access is scrapable (predictable slugs + ZIPs), but the **license is the
  constraint**: free tier is non-commercial; commercial use needs a ~$16 purchase. Scraper
  downloads only the public free ZIPs and records the non-commercial license; do not ship
  commercially without buying the license. Cloudflare 403 risk noted in-header.
- **HDRMaps** — free tier is **CC BY 4.0 (attribution required)**, not CC0; many downloads are
  **free-account / WooCommerce-form gated**. Scraper attempts only publicly reachable `.exr`
  links, records the CC-BY attribution requirement, and marks gated assets as skipped (it does
  **not** bypass the account/form gate).
- **cgbookcase / 3DTextures.me / CGEES** — all genuinely **CC0** and scrapable, but
  **Cloudflare-fronted**; a scripted User-Agent may still receive HTTP 403 and need a
  residential/headless-browser proxy or an allow-listed host. Noted in each header.
