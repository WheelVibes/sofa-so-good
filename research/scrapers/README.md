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
