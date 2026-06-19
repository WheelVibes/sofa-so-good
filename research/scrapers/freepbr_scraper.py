#!/usr/bin/env python3
"""
freepbr_scraper.py — download FreePBR.com PBR material sets.

Source: https://freepbr.com
License: FREEMIUM / PROPRIETARY — NOT CC0. Free downloads are licensed for
         NON-COMMERCIAL use; commercial use requires a one-time ~$16 purchase (which also
         unlocks VIP bulk download). This script downloads the publicly available free
         (non-commercial) ZIPs only; it records `license="freepbr-free-noncommercial"` in
         the manifest. Do NOT ship these in a commercial product without buying the
         commercial license. (Listed here because the slugs/ZIPs are scrapable; the
         licensing — not the access method — is the constraint.)
Programmatic access: No REST API. Material products live at predictable slugs; category
         pages are crawled for product detail pages, and each detail page is parsed for
         the material ZIP link.
LEGAL / ToS: NOTE — Cloudflare-fronted; scripted requests may get HTTP 403. A
         residential/headless-browser proxy or allow-listed host may be required. Respect
         the non-commercial license and the site ToS. Be polite (default 0.5 rps).

RESUMABLE: a JSON manifest records every completed material; re-running skips them.
RATE-LIMITED: --rps (default 0.5/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 freepbr_scraper.py --category stone --limit 10
  python3 freepbr_scraper.py --out ./downloads/freepbr
  python3 freepbr_scraper.py                         # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop, sitemap_locs

BASE = "https://freepbr.com"
SITEMAP = f"{BASE}/sitemap.xml"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 "
    "sofa-so-good-asset-scraper/1.0 (+research)"
)

# Product detail pages (WooCommerce-style /product/<slug>/ or /materials/<slug>/).
_PRODUCT_URL = re.compile(r'^https?://freepbr\.com/(?:product|materials|m)/[^?#]+/?$', re.I)
_ZIP_URL = re.compile(r'https?://[^"\'\\\s]+\.zip\b[^"\'\\\s]*', re.I)


def main() -> None:
    ap = common_argparser("freepbr", __doc__.strip().splitlines()[0])
    ap.add_argument("--category", default="",
                    help="optional category slug filter (e.g. stone/metal/wood); blank = all")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps or 0.5, retries=args.retries, timeout=args.timeout,
                      user_agent=BROWSER_UA)

    def items():
        seen: set[str] = set()
        try:
            locs = sitemap_locs(http.get_text(SITEMAP))
        except Exception as e:  # noqa: BLE001
            _log(f"  ! sitemap fetch failed: {e}")
            locs = []
        pages: list[str] = []
        for loc in locs:
            if loc.lower().endswith(".xml"):
                try:
                    pages.extend(sitemap_locs(http.get_text(loc)))
                except Exception as e:  # noqa: BLE001
                    _log(f"  ! sub-sitemap failed {loc}: {e}")
            else:
                pages.append(loc)
        for url in pages:
            if not _PRODUCT_URL.match(url) or url in seen:
                continue
            if args.category and args.category.lower() not in url.lower():
                continue
            seen.add(url)
            slug = url.rstrip("/").rsplit("/", 1)[-1]
            yield {"slug": slug, "url": url}

    def handle(item: dict, manifest: Manifest) -> None:
        slug, page_url = item["slug"], item["url"]
        html = http.get_text(page_url)
        zips = list(dict.fromkeys(_ZIP_URL.findall(html)))
        if not zips:
            _log(f"  - {slug}: no ZIP link on page (may be login-gated); skipping")
            manifest.mark(slug, skipped="no-zip-link",
                          license="freepbr-free-noncommercial")
            return
        url = urljoin(page_url, zips[0])
        dest = Path(args.out) / f"{slug}.zip"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {slug}")
        manifest.mark(slug, license="freepbr-free-noncommercial", url=url)

    run_loop(items(), out_dir=args.out, key_fn=lambda i: i["slug"],
             handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
