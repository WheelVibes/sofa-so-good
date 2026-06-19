#!/usr/bin/env python3
"""
article_scraper.py — extract Article web-AR GLB/USDZ models (DEV-ONLY reference).

Source: https://www.article.com  (mid-century / modern furniture)
License: PROPRIETARY (Article-owned). DEV-ONLY reference — respect robots.txt + ToS,
         DO NOT redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: sitemap crawl → product page → <model-viewer src> GLB + ios-src USDZ
         (find_model_urls).
LEGAL / ToS: proprietary catalogue; developer reference only. Keep --rps LOW (default 0.5).
         Using this is the operator's responsibility.

UNVERIFIED 3D: Article's 3D/AR is reported by 3D-commerce roundups but NOT byte-confirmed
         here. BEFORE a real crawl, confirm a live PDP actually embeds a <model-viewer>
         (GLB src / USDZ ios-src) — open one product page and inspect the source.

RESUMABLE per product URL. RATE-LIMITED (--rps, retry+backoff, robots). Stdlib only.

Examples:
  python3 article_scraper.py --limit 20
  python3 article_scraper.py --url-filter "/product/" --rps 0.3
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.article.com"
DEFAULT_SITEMAP = "https://www.article.com/sitemap.xml"
PAGE_FILTER = r"/product/"


def main() -> None:
    ap = retailer_argparser("article", __doc__.strip().splitlines()[0])
    args = ap.parse_args()
    crawl_retailer(
        source="article", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
