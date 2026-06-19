#!/usr/bin/env python3
"""
houzz_scraper.py — extract Houzz "View in My Room 3D" GLB/USDZ (DEV-ONLY reference).

Source: https://www.houzz.com  (Shop — View in My Room 3D; marketplace sellers)
License: PROPRIETARY (Houzz / marketplace sellers). DEV-ONLY reference — respect
         robots.txt + ToS, DO NOT redistribute downloaded assets (same dev-gating as the
         IKEA scrape).
Access method: product sitemap crawl → product page → <model-viewer src> GLB + ios-src
         USDZ (find_model_urls). One of the earliest (2017) web-AR shops. Marketplace, so
         3D coverage + quality vary per seller. CONFIRMED feature.
LEGAL / ToS: proprietary marketplace; developer reference only. Keep --rps LOW
         (default 0.5). Using this is the operator's responsibility.

RESUMABLE per product URL. RATE-LIMITED (--rps, retry+backoff, robots). Stdlib only.

Examples:
  python3 houzz_scraper.py --limit 20
  python3 houzz_scraper.py --url-filter "/product/" --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.houzz.com"
DEFAULT_SITEMAP = "https://www.houzz.com/sitemap.xml"
PAGE_FILTER = r"/product"


def main() -> None:
    ap = retailer_argparser("houzz", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="houzz", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
