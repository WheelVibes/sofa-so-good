#!/usr/bin/env python3
"""
westelm_scraper.py — extract West Elm (Williams-Sonoma) AR GLB/USDZ (DEV-ONLY ref).

Source: https://www.westelm.com  (Williams-Sonoma group: West Elm, Pottery Barn, PBteen)
License: PROPRIETARY (WSI-owned). DEV-ONLY reference — respect robots.txt + ToS, DO NOT
         redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: sitemap crawl → product page → <model-viewer src> GLB + ios-src USDZ
         (find_model_urls). AR "View in Room" is per-product (not the whole catalogue).
LEGAL / ToS: proprietary catalogue; developer reference only. Keep --rps LOW (default 0.5).
         Using this is the operator's responsibility.

UNVERIFIED 3D: extraction specifics not byte-confirmed on a sampled PDP, and AR coverage
         is partial. BEFORE a real crawl, confirm a live PDP embeds a <model-viewer>.
         For sibling brands point --sitemap at potterybarn.com / pbteen.com.

RESUMABLE per product URL. RATE-LIMITED (--rps, retry+backoff, robots). Stdlib only.

Examples:
  python3 westelm_scraper.py --limit 20
  python3 westelm_scraper.py --sitemap https://www.potterybarn.com/sitemap.xml --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.westelm.com"
DEFAULT_SITEMAP = "https://www.westelm.com/sitemap.xml"
PAGE_FILTER = r"/products/"


def main() -> None:
    ap = retailer_argparser("westelm", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="westelm", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
