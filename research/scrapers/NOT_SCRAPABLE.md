# NOT_SCRAPABLE / caveats — retailer 3D/AR + marketplace/AI segment

This file records sources in this agent's segment (scrapable retailers excluding IKEA +
marketplace/AI APIs) that have **no plausible programmatic path**, plus important caveats on
the ones that *do* have a script. All retailer sources are **PROPRIETARY, DEV-ONLY** reference.

## Sources with NO programmatic path (no script written)

None in this segment. Every assigned source had at least a plausible path:

- All retailers expose AR via `<model-viewer>` (GLB `src` + USDZ `ios-src`) discoverable
  from a sitemap-driven product-page crawl → handled by the generic `_retailer.py` pattern.
- Wayfair, CGTrader, Meshy, Tripo each have an **official API** → handled directly.

## Scripts written but flagged UNVERIFIED — confirm before a real crawl

- **article_scraper.py** — Article's 3D/AR is reported by 3D-commerce roundups but not
  byte-confirmed. Open one live PDP and confirm a `<model-viewer>` (GLB src / USDZ ios-src)
  is present before crawling.
- **westelm_scraper.py** — Williams-Sonoma (West Elm / Pottery Barn / PBteen) AR is
  per-product (partial catalogue coverage) and extraction specifics are unverified on a
  sampled PDP. Confirm a live PDP before crawling; point `--sitemap` at sibling brands.

## Scripts written with strong operational caveats

- **amazon_scraper.py** — heavy anti-bot (CAPTCHAs, IP bans, JS-rendered listings,
  signed/expiring asset URLs). Implemented for completeness with a **very low default rps
  (0.1 = 1 req / 10 s)**. Many listings render AR client-side, so `find_model_urls` on raw
  HTML may return nothing. Treat as a reference shape, not a turnkey bulk crawler; Amazon
  has no clean public product sitemap (point `--sitemap` at an authorised collection).

## API schema caveats (verify against your credentials)

- **wayfair_scraper.py** — keyless demo endpoint serves a public sample set; the registered
  partner endpoint's exact JSON schema is account-specific. Auto-detects common list/url
  fields; override with `--endpoint` / `--models-key` / `--url-key` if your contract differs.
- **cgtrader_scraper.py** — OAuth2 `client_credentials` exchange + `/v1/models` search are
  best-effort from CGTrader's public developer docs; field names may differ per partner
  account. **ToS §19.2 bans mass scraping of free models + ML-training** — the API is the
  only sanctioned path; do not bulk-harvest the free section.
- **meshy_scraper.py** / **tripo_scraper.py** — async generate→poll→download against the
  documented v2 endpoints; confirm the current API version for your key. **Generated-asset
  license depends on your plan** (Meshy free = CC BY 4.0 / paid = full commercial; Tripo
  paid hosted = commercial). Prefer a paid key for commercial bundling.

## Out of this segment (handled / to be handled elsewhere)

- **IKEA** — explicitly EXCLUDED from this segment (existing IKEA scrape).
- **Amazon Berkeley Objects (ABO)**, **Google Scanned Objects**, **Poly Haven**, academic
  datasets, and other CC0/CC-BY API sources are in the dataset/CC0 segment, not here.
