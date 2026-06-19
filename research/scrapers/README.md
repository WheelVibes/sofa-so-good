# Asset-source scrapers

One `<source>_scraper.py` per source in [`../MODEL_LIBRARIES.html`](../MODEL_LIBRARIES.html)
that is **scrapable or programmatically downloadable**. Sources that are auth-gated /
credit-metered / ToS-prohibited for automation are listed (with reasons) in
[`NOT_SCRAPABLE.md`](./NOT_SCRAPABLE.md).

Every script is:

- **Resumable** — a JSON manifest (`_manifest.json` in the output dir) records every
  completed item; interrupt and re-run to continue where it stopped (downloads write
  `.part` then rename, so a half-finished file is never mistaken for complete).
- **Rate-limited** — `--rps` (conservative defaults) with exponential backoff that
  honours HTTP `429 Retry-After`.
- **Stdlib-only by default** — runs with plain `python3`; a few note an OPTIONAL official
  SDK (`huggingface_hub`, `boto3`, `objaverse`) in their header, guarded with a friendly
  ImportError when absent.
- **License-aware** — records each item's license in the manifest where the source exposes
  it, so a downstream commercial-use filter is possible (esp. Poly Pizza, OpenGameArt,
  Sketchfab, Objaverse).

Shared harness: [`scraper_common.py`](./scraper_common.py) (`HttpClient`, `Manifest`,
`RateLimiter`, `run_loop`, `sitemap_locs`, `find_model_urls`, `common_argparser`).
[`polyhaven_scraper.py`](./polyhaven_scraper.py) is the canonical reference. The
sitemap-crawl retailers also share [`_retailer.py`](./_retailer.py) (robots-aware
*sitemap → product page → `find_model_urls` → download*).

## Usage

```bash
cd research/scrapers
python3 polyhaven_scraper.py --type hdris --res 4k --limit 20    # try it (CC0)
python3 <source>_scraper.py --help                                # per-source flags
```

Common flags: `--out --limit --rps --retries --timeout --resume/--no-resume --api-key`.
Set `CRAWLER_CONTACT` env to advertise a contact in the User-Agent.

## Scripts by category

### Free / CC0 models + aggregators
| Script | Source | License | Access |
| --- | --- | --- | --- |
| `poly_pizza_scraper.py` | Poly Pizza | CC0 / CC-BY (per item) | REST API + key |
| `quaternius_scraper.py` | Quaternius | CC0 — **commercial-safe** | pack-listing scrape |
| `kenney_scraper.py` | Kenney | CC0 — **commercial-safe** | pack-page scrape |
| `opengameart_scraper.py` | OpenGameArt | mixed CC (`--licenses` filter) | listing crawl |
| `sketchfab_scraper.py` | Sketchfab | CC (per item) | Data API v3 + Download API + token |
| `smithsonian3d_scraper.py` | Smithsonian Open Access | CC0 | api.si.edu + key |
| `thingiverse_scraper.py` | Thingiverse | mixed CC (`--licenses`) | REST API + token |
| `threedscans_scraper.py` | Three D Scans | Public Domain — **commercial-safe** | gallery scrape |

### PBR materials + HDRI / backdrops
| Script | Source | License | Access |
| --- | --- | --- | --- |
| `polyhaven_scraper.py` | Poly Haven (models/textures/HDRI) | CC0 — **commercial-safe** | public REST API |
| `ambientcg_scraper.py` | ambientCG (materials + HDRI) | CC0 — **commercial-safe** | public REST API v2 |
| `cgbookcase_scraper.py` | cgbookcase | CC0 — **commercial-safe** | sitemap (Cloudflare → proxy) |
| `3dtextures_me_scraper.py` | 3DTextures.me | CC0 — **commercial-safe** | sitemap/RSS (Cloudflare) |
| `cgees_scraper.py` | CGEES (ex-iHDRI HDRIs) | CC0 — **commercial-safe** | sitemap scrape |
| `hdrmaps_scraper.py` | HDRMaps | CC BY (attribution) | freebies-hub crawl |
| `freepbr_scraper.py` | FreePBR | free non-comm / ~$16 commercial | sitemap scrape |

### Academic / furniture / scanned datasets
| Script | Source | License | Access |
| --- | --- | --- | --- |
| `google_scanned_objects_scraper.py` | Google Scanned Objects | CC-BY 4.0 — **commercial-safe** | Gazebo Fuel REST API |
| `redwood_3dscan_scraper.py` | Redwood 3DScan | Public Domain — **commercial-safe** | open CDN + JSON indexes |
| `objaverse_scraper.py` | Objaverse 1.0 / XL | ODC-By + per-object CC (`--licenses` → cc0/cc-by **commercial-safe**) | `objaverse` pkg (optional) |
| `abo_scraper.py` | Amazon Berkeley Objects (GLB) | CC BY-**NC** 4.0 — research-only | open S3 bucket |
| `shapenet_scraper.py` | ShapeNetCore / Sem | **non-commercial**, gated | HF mirror + token |
| `omniobject3d_scraper.py` | OmniObject3D | CC BY-NC — research-only | HF dataset (optional token) |
| `pix3d_scraper.py` | Pix3D | **non-commercial** | open zip |
| `threed_future_scraper.py` | 3D-FUTURE | ToU — **non-commercial**, email-gated | emailed links / `--config` |
| `threed_front_scraper.py` | 3D-FRONT | CC BY-NC — email-gated | emailed links / `--config` |

### Retailers (DEV-ONLY, proprietary — `<model-viewer>` GLB + USDZ)
`castlery` · `crateandbarrel` · `target` · `houzz` · `article` (unverified PDP) ·
`westelm` (unverified/partial) · `amazon` (heavy anti-bot, default `--rps 0.1`).
`wayfair` uses the **official 3D Model API** (keyless demo set, or `--api-key` for the
registered glTF/GLB endpoint) — the clean path, not HTML scraping. All respect
`robots.txt` (`--ignore-robots` to override) and do **not** redistribute assets.

### Marketplace / AI-generation APIs (programmatic, `--api-key`)
`cgtrader` (OAuth2 `client_id:client_secret`; search + download; ToS §19.2 — API only, no
mass free scraping) · `meshy` / `tripo` (text/image→3D: submit prompt, poll task, download
GLB; generated-asset license depends on your plan).

Large tar/zip datasets (ABO, Pix3D, 3D-FUTURE/3D-FRONT) treat each archive as one manifest
item (resumable `.part`→rename); many-small-file sets (GSO, Objaverse, Redwood, HF mirrors,
all the API sources) iterate per object/file.

## ⚠️ Legal / Terms of Service

Per-source license + access notes live in [`../MODEL_LIBRARIES.html`](../MODEL_LIBRARIES.html);
non-scrapable sources + reasons are in [`NOT_SCRAPABLE.md`](./NOT_SCRAPABLE.md).

- **CC0 / CC-BY API sources** (Poly Haven, ambientCG, Poly Pizza, Quaternius, Kenney,
  Google Scanned Objects, Redwood, …) are fine to use within their terms — honour CC-BY
  attribution (the manifest records per-item license to help).
- **Datasets** are often **research / non-commercial only** (ABO, ShapeNet, 3D-FUTURE,
  3D-FRONT, OmniObject3D, Pix3D; Objaverse is per-object — the script filters to cc0/cc-by).
  The scripts *download*; *commercial* use is gated by each dataset's license.
- **Retailer / marketplace sources** are **proprietary, DEV-ONLY references** (same
  dev-gating as the existing IKEA scrape). Respect `robots.txt`/rate limits; do **not**
  redistribute downloaded assets. Several marketplaces' ToS **prohibit scraping** — those
  use the official API where one exists, otherwise carry a clear warning. Use is the
  operator's responsibility.
