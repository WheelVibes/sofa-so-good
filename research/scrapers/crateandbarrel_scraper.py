#!/usr/bin/env python3
"""
crateandbarrel_scraper.py — extract Crate & Barrel / CB2 AR GLB/USDZ (DEV-ONLY ref).

Source: https://www.crateandbarrel.com ("View in My Room"; CB2 has comparable AR)
License: PROPRIETARY (Crate & Barrel-owned). DEV-ONLY reference — respect robots.txt +
         ToS, DO NOT redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: sitemap crawl → product page → <model-viewer src> glTF/GLB + ios-src USDZ
         (find_model_urls). 5,000+ AR items. CONFIRMED glTF AR; extraction standard.
LEGAL / ToS: proprietary catalogue; developer reference for the pipeline only. Keep --rps
         LOW (default 0.5). Using this is the operator's responsibility.

RESUMABLE per product URL. RATE-LIMITED (--rps, retry+backoff, robots). Stdlib only.

Examples:
  python3 crateandbarrel_scraper.py --limit 20
  python3 crateandbarrel_scraper.py --url-filter "/s[0-9]+" --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.crateandbarrel.com"
DEFAULT_SITEMAP = "https://www.crateandbarrel.com/sitemap.xml"
PAGE_FILTER = r""


def main() -> None:
    ap = retailer_argparser("crateandbarrel", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="crateandbarrel", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
