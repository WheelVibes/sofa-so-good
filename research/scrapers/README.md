# Asset-source scrapers

One `<source>_scraper.py` per source in [`../MODEL_LIBRARIES.html`](../MODEL_LIBRARIES.html)
that is **scrapable or programmatically downloadable**. Each script is:

- **Resumable** — a JSON manifest (`_manifest.json` in the output dir) records every
  completed item; interrupt and re-run to continue where it stopped.
- **Rate-limited** — `--rps` (default conservative) with exponential backoff that
  honours HTTP `429 Retry-After`.
- **Stdlib-only by default** — runs with plain `python3`; a few scripts note an
  OPTIONAL official SDK (`huggingface_hub`, `boto3`, `requests`) in their header when
  that's the sane path for that source.

All scripts share [`scraper_common.py`](./scraper_common.py) (`HttpClient`, `Manifest`,
`RateLimiter`, `run_loop`, sitemap/model-viewer extractors, `common_argparser`).
[`polyhaven_scraper.py`](./polyhaven_scraper.py) is the canonical reference.

## Usage

```bash
cd research/scrapers
python3 polyhaven_scraper.py --type hdris --res 4k --limit 20      # try it
python3 <source>_scraper.py --help                                  # per-source flags
```

Common flags (from `common_argparser`): `--out --limit --rps --retries --timeout
--resume/--no-resume --api-key`.

## Scripts

| Script | Source | License | Access |
| --- | --- | --- | --- |
| `polyhaven_scraper.py` | Poly Haven | CC0 — **commercial-safe** | public REST API |
| `google_scanned_objects_scraper.py` | Google Scanned Objects | CC-BY 4.0 — **commercial-safe** | Gazebo Fuel REST API |
| `redwood_3dscan_scraper.py` | Redwood 3DScan | Public Domain — **commercial-safe** | open CDN + JSON indexes |
| `objaverse_scraper.py` | Objaverse 1.0 / XL | ODC-By + per-object CC (`--licenses` filter; cc0/cc-by = **commercial-safe**) | `objaverse` pkg (optional) |
| `abo_scraper.py` | Amazon Berkeley Objects | CC BY-**NC** 4.0 — research-only | open S3 bucket |
| `shapenet_scraper.py` | ShapeNetCore / Sem | **non-commercial**, gated | HF mirror + token |
| `omniobject3d_scraper.py` | OmniObject3D | CC BY-NC — research-only | HF dataset (optional token) |
| `pix3d_scraper.py` | Pix3D | **non-commercial** | open zip |
| `threed_future_scraper.py` | 3D-FUTURE | ToU — **non-commercial**, email-gated | emailed links (`--furniture-url`/`--config`) |
| `threed_front_scraper.py` | 3D-FRONT | CC BY-NC — email-gated | emailed links (`--house-url`/`--furniture-url`/`--textures-url`/`--config`) |

Large tar/zip datasets (ABO, Pix3D, 3D-FUTURE/3D-FRONT) treat each archive as one
manifest item (resumable file-level download via `.part`→rename); many-small-file
sets (GSO, Objaverse, Redwood, HF mirrors) iterate per object/file.

## ⚠️ Legal / Terms of Service

Per-source license + access notes live in `../MODEL_LIBRARIES.html`.

- **CC0 / CC-BY API sources** (Poly Haven, ambientCG, Poly Pizza, Quaternius, Google
  Scanned Objects, …) are fine to use within their terms — honour CC-BY attribution.
- **Datasets** may be **research/non-commercial only** (ABO, ShapeNet, 3D-FUTURE,
  Objaverse per-object licenses, …) — the scripts download; *commercial* use is gated
  by each dataset's license. Objaverse scripts filter by per-object CC license.
- **Retailer / marketplace sources** are **proprietary, DEV-ONLY references** (same
  dev-gating as the existing IKEA scrape). The scripts respect `robots.txt`/rate
  limits where applicable; do **not** redistribute downloaded assets. Many marketplaces'
  ToS **prohibit scraping** — those scripts use the official API where one exists and
  otherwise carry a clear ToS warning. Use is the operator's responsibility.

Set `CRAWLER_CONTACT` env var to advertise a contact in the User-Agent.
