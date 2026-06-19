#!/usr/bin/env python3
"""
castlery_scraper.py — extract Castlery web-AR GLB/USDZ models (DEV-ONLY reference).

Source: https://www.castlery.com  ·  web AR: https://www.castlery.com/sg/web-ar
License: PROPRIETARY (Castlery-owned). DEV-ONLY reference — respect robots.txt + ToS,
         DO NOT redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: sitemap crawl → product page → <model-viewer src> GLB + ios-src USDZ
         (see find_model_urls in scraper_common). ~250 AR-enabled products. Singapore-
         relevant. CONFIRMED web-AR; model-viewer extraction is the standard pattern.
LEGAL / ToS: proprietary catalogue; this is a developer reference for the pipeline only.
         Keep --rps LOW (default 0.5). Using this is the operator's responsibility.

RESUMABLE per product URL (JSON manifest). RATE-LIMITED (--rps, retry+backoff, robots).
Stdlib only.

Examples:
  python3 castlery_scraper.py --limit 10
  python3 castlery_scraper.py --sitemap https://www.castlery.com/sg/sitemap.xml --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.castlery.com"
DEFAULT_SITEMAP = "https://www.castlery.com/sitemap.xml"
PAGE_FILTER = r""  # Castlery product paths vary by region; leave open, use --url-filter to narrow.


def main() -> None:
    ap = retailer_argparser("castlery", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="castlery", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
