#!/usr/bin/env python3
"""
amazon_scraper.py — extract Amazon "View in Your Room" AR GLB/USDZ (DEV-ONLY reference).

Source: https://www.amazon.com  (AR View on eligible home/furniture listings)
License: PROPRIETARY (seller / Amazon-owned). DEV-ONLY reference — respect robots.txt +
         ToS, DO NOT redistribute downloaded assets (same dev-gating as the IKEA scrape).
Access method: listing/sitemap crawl → product page → GLB (Scene Viewer) + USDZ (Quick
         Look) via model-viewer/AR tags (find_model_urls).

!!! ANTI-BOT CAVEAT (read before running) !!!
Amazon aggressively rate-limits and BLOCKS crawlers (CAPTCHAs, IP bans, JS-rendered
listings, signed/expiring asset URLs). This script implements the standard
model-viewer pattern for COMPLETENESS, but realistically needs: a logged-in/authorised
session, headers/cookies Amazon expects, a residential egress, and patience. The default
--rps is therefore VERY LOW (0.1 = one request / 10s). Treat this as a reference shape,
not a turnkey bulk crawler. Many listings render AR client-side, so find_model_urls on
the raw HTML may return nothing — confirm on a live listing first.

LEGAL / ToS: Amazon's Conditions of Use restrict automated access. Developer reference
         only; using this is entirely the operator's responsibility.

RESUMABLE per listing URL. RATE-LIMITED (--rps default 0.1, retry+backoff, robots).
Stdlib only.

Examples:
  python3 amazon_scraper.py --limit 5            # crawls VERY slowly by design
  python3 amazon_scraper.py --sitemap <listing-sitemap-or-collection> --rps 0.05
"""
from __future__ import annotations

from _retailer import crawl_retailer, retailer_argparser

BASE = "https://www.amazon.com"
# Amazon does not publish a clean product sitemap; point --sitemap at a category/listing
# collection you are authorised to crawl. /sitemap.xml is a placeholder default.
DEFAULT_SITEMAP = "https://www.amazon.com/sitemap.xml"
PAGE_FILTER = r"/dp/|/gp/product/"  # Amazon detail-page paths

AMAZON_DEFAULT_RPS = 0.1  # one request per 10s — deliberately crawl-hostile-aware


def main() -> None:
    ap = retailer_argparser("amazon", __doc__.strip().splitlines()[0])
    # Tighten the politeness default further than the generic retailer 0.5.
    for action in ap._actions:
        if action.dest == "rps":
            action.default = AMAZON_DEFAULT_RPS
            action.help = "requests/sec — VERY LOW; Amazon has heavy anti-bot"
    args = ap.parse_args()
    crawl_retailer(
        source="amazon", base_url=BASE, args=args,
        default_sitemap=DEFAULT_SITEMAP, page_filter=PAGE_FILTER,
    )


if __name__ == "__main__":
    main()
