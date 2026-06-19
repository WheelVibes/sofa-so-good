#!/usr/bin/env python3
"""
quaternius_scraper.py — download Quaternius CC0 low-poly themed packs (ZIP).

Source: https://quaternius.com
License: CC0 1.0 (public domain) — commercial use OK, NO attribution required
         (donations encouraged). Recorded as CC0 in the manifest.
Programmatic access: NO public REST API. The site lists themed packs, each with a
         pack-page that links a downloadable ZIP bundle (GLTF/GLB/FBX/OBJ/BLEND).
         This scraper scrapes the listing page(s) for pack links, then each pack
         page for its ZIP download link, and fetches each ZIP. Predictable enough
         to script via stdlib HTML scraping (no bs4 dependency — uses the regex
         helpers in scraper_common + a small local link extractor).

LEGAL / ToS: CC0 assets are free to download, use, and redistribute. Still be a
polite crawler — default 1 rps, honour robots/back-off. Do not hammer the host.

RESUMABLE: a JSON manifest records every completed pack URL; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 quaternius_scraper.py --limit 5
  python3 quaternius_scraper.py --listing https://quaternius.com/packs.html
  python3 quaternius_scraper.py --out ./downloads/quaternius   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

BASE = "https://quaternius.com"

# href to a .zip, or to a pack page we can follow for a .zip.
_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_ZIP = re.compile(r'\.zip(\?[^"\']*)?$', re.I)


def _abs(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)


def _links(html: str, base: str) -> list[str]:
    return [_abs(base, h) for h in _HREF.findall(html)]


def _find_zip_on_page(http: HttpClient, page_url: str) -> str | None:
    """Follow a pack page and return the first ZIP download link found."""
    try:
        html = http.get_text(page_url)
    except Exception as e:  # noqa: BLE001
        _log(f"  ! cannot read pack page {page_url}: {e}")
        return None
    for link in _links(html, page_url):
        if _ZIP.search(link):
            return link
    return None


def _collect_packs(http: HttpClient, listing_url: str) -> list[dict]:
    """Scrape the listing page for direct ZIPs + candidate pack pages."""
    html = http.get_text(listing_url)
    packs: list[dict] = []
    seen: set[str] = set()
    candidate_pages: list[str] = []
    for link in _links(html, listing_url):
        if _ZIP.search(link):
            if link not in seen:
                seen.add(link)
                packs.append({"zip": link, "page": listing_url})
        elif "/packs/" in link or "/pack/" in link or link.rstrip("/").count("/") >= 3:
            candidate_pages.append(link)
    # Pages that may themselves hold a ZIP (resolved lazily in handle()).
    for page in dict.fromkeys(candidate_pages):
        if page not in seen and page != listing_url:
            packs.append({"zip": None, "page": page})
    return packs


def main() -> None:
    ap = common_argparser("quaternius", __doc__.strip().splitlines()[0])
    ap.add_argument("--listing", default=BASE, help="listing/index page to scrape for packs")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    _log(f"== Quaternius: scraping {args.listing} ==")
    packs = _collect_packs(http, args.listing)
    _log(f"   found {len(packs)} candidate packs/pages")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return item["zip"] or item["page"]

    def handle(item: dict, manifest: Manifest) -> None:
        zip_url = item["zip"] or _find_zip_on_page(http, item["page"])
        if not zip_url:
            _log(f"  - no ZIP on {item['page']}; skipping")
            manifest.mark(key_fn(item), skipped="no-zip")
            return
        name = urllib.parse.urlparse(zip_url).path.split("/")[-1] or "pack.zip"
        dest = Path(out_dir) / name
        got = http.download_file(zip_url, dest)
        _log(f"  {'↓' if got else '·'} {name} [CC0]")
        manifest.mark(key_fn(item), file=name, url=zip_url, license="CC0-1.0")

    run_loop(packs, out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
