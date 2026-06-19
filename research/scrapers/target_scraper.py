#!/usr/bin/env python3
"""
target_scraper.py — extract Target "See It In Your Space" AR GLB/USDZ (DEV-ONLY ref).

Source: https://www.target.com/c/see-it-in-your-space (Project 62 / Threshold / Pillowfort)
License: PROPRIETARY (Target-owned). DEV-ONLY reference — respect robots.txt + ToS,
         DO NOT redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: sitemap crawl → product page → GLB (Scene Viewer) + USDZ (Quick Look) via
         model-viewer tags (find_model_urls). CONFIRMED feature; standard AR-tag extraction.
LEGAL / ToS: proprietary catalogue; developer reference only. Keep --rps LOW (default 0.5).
         Using this is the operator's responsibility.

RESUMABLE per product URL. RATE-LIMITED (--rps, retry+backoff, robots). Stdlib only.

Examples:
  python3 target_scraper.py --limit 20
  python3 target_scraper.py --url-filter "/p/" --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.target.com"
DEFAULT_SITEMAP = "https://www.target.com/sitemap_index.xml"
PAGE_FILTER = r"/p/"  # Target PDP paths are /p/<slug>/-/A-<id>


def main() -> None:
    ap = retailer_argparser("target", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="target", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
