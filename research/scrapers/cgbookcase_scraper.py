#!/usr/bin/env python3
"""
cgbookcase_scraper.py — download cgbookcase CC0 PBR textures.

Source: https://www.cgbookcase.com/textures
License: CC0 1.0 (public domain) — commercial OK, no attribution, redistribution allowed.
         Recorded per-asset in the manifest.
Programmatic access: No REST API. Texture pages live at predictable `/textures/<slug>`
         URLs; the catalogue is enumerated from the XML sitemap, and each texture page
         carries per-resolution ZIP download links parsed out of the page HTML.
LEGAL / ToS: CC0 textures. NOTE — cgbookcase is Cloudflare-fronted and frequently returns
         HTTP 403 to scripted requests despite a real User-Agent. If you hit 403s you will
         need a residential/headless-browser proxy or to run from an allow-listed host;
         this script sets a browser-like UA and is otherwise polite, but cannot bypass a
         Cloudflare challenge on its own. Do not hammer the host.

RESUMABLE: a JSON manifest records every completed texture; re-running skips them.
RATE-LIMITED: --rps (default 0.5/s — conservative for a Cloudflare host) with backoff.

Examples:
  python3 cgbookcase_scraper.py --res 2K --limit 20
  python3 cgbookcase_scraper.py --res 4K --out ./downloads/cgbookcase
  python3 cgbookcase_scraper.py                      # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop, sitemap_locs

BASE = "https://www.cgbookcase.com"
SITEMAP = f"{BASE}/sitemap.xml"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 "
    "sofa-so-good-asset-scraper/1.0 (+research)"
)

# Texture detail pages: https://www.cgbookcase.com/textures/<slug>
_TEXTURE_PAGE = re.compile(r"^https?://[^/]+/textures/[^/?#]+/?$", re.I)
# Download links to ZIP archives (CDN or same-origin).
_ZIP_URL = re.compile(r'https?://[^"\'\\\s]+\.zip\b[^"\'\\\s]*', re.I)


def main() -> None:
    ap = common_argparser("cgbookcase", __doc__.strip().splitlines()[0])
    ap.add_argument("--res", default="2K", help="preferred resolution token in the ZIP name (1K/2K/4K)")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps or 0.5, retries=args.retries, timeout=args.timeout,
                      user_agent=BROWSER_UA)

    def items():
        # Sitemap may be an index of sub-sitemaps; collect texture pages from all locs.
        seen: set[str] = set()
        for loc in _crawl_sitemap(http, SITEMAP):
            if _TEXTURE_PAGE.match(loc) and loc not in seen:
                seen.add(loc)
                slug = loc.rstrip("/").rsplit("/", 1)[-1]
                yield {"slug": slug, "url": loc}

    def handle(item: dict, manifest: Manifest) -> None:
        slug, page_url = item["slug"], item["url"]
        html = http.get_text(page_url)
        zips = list(dict.fromkeys(_ZIP_URL.findall(html)))
        url = _pick_zip(zips, args.res)
        if not url:
            _log(f"  - {slug}: no ZIP link found on page; skipping")
            manifest.mark(slug, skipped="no-zip-link")
            return
        url = urljoin(page_url, url)
        dest = Path(args.out) / f"{slug}.zip"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {slug}")
        manifest.mark(slug, license="CC0-1.0", url=url)

    run_loop(items(), out_dir=args.out, key_fn=lambda i: i["slug"],
             handle=handle, limit=args.limit)


def _crawl_sitemap(http: HttpClient, url: str, depth: int = 0) -> list[str]:
    """Return all <loc> URLs, recursing one level into a sitemap index."""
    try:
        locs = sitemap_locs(http.get_text(url))
    except Exception as e:  # noqa: BLE001
        _log(f"  ! sitemap fetch failed {url}: {e}")
        return []
    out: list[str] = []
    for loc in locs:
        if depth == 0 and loc.lower().endswith(".xml"):
            out.extend(_crawl_sitemap(http, loc, depth + 1))
        else:
            out.append(loc)
    return out


def _pick_zip(zips: list[str], res: str) -> str | None:
    if not zips:
        return None
    for z in zips:
        if res and res.upper() in z.upper():
            return z
    return zips[0]


if __name__ == "__main__":
    main()
