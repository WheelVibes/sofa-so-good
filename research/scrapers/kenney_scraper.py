#!/usr/bin/env python3
"""
kenney_scraper.py — download Kenney.nl CC0 asset packs (ZIP).

Source: https://kenney.nl/assets
License: CC0 1.0 (public domain) — all assets, commercial use OK, NO attribution
         required. Recorded as CC0 in the manifest.
Programmatic access: NO REST API. Each asset has a pack page on kenney.nl that
         links a download ZIP. The download URL is served from a content-hash
         directory (e.g. kenney.nl/media/pages/assets/<slug>/<hash>/<file>.zip),
         so the ZIP href is NOT guessable from the slug alone — you MUST read the
         pack page to find the real link (the "content-hash dir caveat" noted in
         research/MODEL_LIBRARIES.html). This scraper scrapes the assets index for
         pack pages, then each pack page for its ZIP href, then downloads it.
         Stdlib HTML scraping (no bs4 — uses a small local link extractor).
         Per CLAUDE.md, the Kenney zip pipeline is treated as a DEV-ONLY sidecar.

LEGAL / ToS: CC0 assets are free to download/use/redistribute. Be a polite crawler
(default 1 rps, honour back-off). Do not hammer the host.

RESUMABLE: a JSON manifest records every completed pack page; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 kenney_scraper.py --limit 5
  python3 kenney_scraper.py --index "https://kenney.nl/assets/category:3D"
  python3 kenney_scraper.py --out ./downloads/kenney         # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

BASE = "https://kenney.nl"
DEFAULT_INDEX = "https://kenney.nl/assets/category:3D"

_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_ZIP = re.compile(r'\.zip(\?[^"\']*)?$', re.I)
_ASSET_PAGE = re.compile(r"/assets/[^/\"'?#]+/?$", re.I)


def _abs(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)


def _links(html: str, base: str) -> list[str]:
    return [_abs(base, h) for h in _HREF.findall(html)]


def _collect_pack_pages(http: HttpClient, index_url: str) -> list[dict]:
    html = http.get_text(index_url)
    pages: list[str] = []
    for link in _links(html, index_url):
        path = urllib.parse.urlparse(link).path
        # Pack pages look like /assets/<slug>; the category index itself is excluded.
        if _ASSET_PAGE.search(path) and "category:" not in link and not path.rstrip("/").endswith("/assets"):
            pages.append(link)
    return [{"page": p} for p in dict.fromkeys(pages)]


def _find_zip_on_page(http: HttpClient, page_url: str) -> str | None:
    html = http.get_text(page_url)
    for link in _links(html, page_url):
        if _ZIP.search(link):
            return link
    return None


def main() -> None:
    ap = common_argparser("kenney", __doc__.strip().splitlines()[0])
    ap.add_argument("--index", default=DEFAULT_INDEX, help="assets index/category page to scrape")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    _log(f"== Kenney: scraping {args.index} ==")
    pages = _collect_pack_pages(http, args.index)
    _log(f"   found {len(pages)} pack pages")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return item["page"]

    def handle(item: dict, manifest: Manifest) -> None:
        zip_url = _find_zip_on_page(http, item["page"])
        if not zip_url:
            _log(f"  - no ZIP on {item['page']}; skipping")
            manifest.mark(item["page"], skipped="no-zip")
            return
        name = urllib.parse.urlparse(zip_url).path.split("/")[-1] or "pack.zip"
        dest = Path(out_dir) / name
        got = http.download_file(zip_url, dest)
        _log(f"  {'↓' if got else '·'} {name} [CC0]")
        manifest.mark(item["page"], file=name, url=zip_url, license="CC0-1.0")

    run_loop(pages, out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
