#!/usr/bin/env python3
"""
cgees_scraper.py — download CGEES CC0 HDRI environment maps.

Source: https://cgees.com  (successor to the old ihdri.com; the original iHDRI domain
        was hijacked — do NOT use ihdri.com.)
License: CC0 1.0 (public domain) — full commercial use, no attribution, no signup.
         Recorded per-asset in the manifest.
Programmatic access: No REST API. The HDRI listing pages are crawled for per-asset
        detail pages, and each detail page is parsed for the direct `.hdr` download
        links (offered 1K up to 24K).
LEGAL / ToS: CC0, no account required. Be polite (default 1 rps). The site layout is
        small and may change; selectors here are best-effort and degrade to "no match"
        rather than crashing. May be Cloudflare-fronted — a proxy/allow-listed host may
        be needed if you hit HTTP 403.

RESUMABLE: a JSON manifest records every completed HDRI; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 cgees_scraper.py --res 4K --limit 10
  python3 cgees_scraper.py --res 8K --out ./downloads/cgees
  python3 cgees_scraper.py                          # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop, sitemap_locs

BASE = "https://cgees.com"
SITEMAP = f"{BASE}/sitemap.xml"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 "
    "sofa-so-good-asset-scraper/1.0 (+research)"
)

# Per-asset detail pages (HDRI product/post pages). Heuristic: a /hdri/ or post path.
_DETAIL_URL = re.compile(r"^https?://cgees\.com/(?:hdri|hdris|product|download)/[^?#]+/?$", re.I)
_HDR_URL = re.compile(r'https?://[^"\'\\\s]+\.hdr\b[^"\'\\\s]*', re.I)
_EXR_URL = re.compile(r'https?://[^"\'\\\s]+\.exr\b[^"\'\\\s]*', re.I)


def main() -> None:
    ap = common_argparser("cgees", __doc__.strip().splitlines()[0])
    ap.add_argument("--res", default="4K",
                    help="preferred resolution token in the file name (1K..24K); "
                         "falls back to the first available .hdr/.exr")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout,
                      user_agent=BROWSER_UA)

    def items():
        seen: set[str] = set()
        try:
            locs = sitemap_locs(http.get_text(SITEMAP))
        except Exception as e:  # noqa: BLE001
            _log(f"  ! sitemap fetch failed: {e}")
            locs = []
        # Recurse one level into a sitemap index.
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
            if _DETAIL_URL.match(url) and url not in seen:
                seen.add(url)
                slug = url.rstrip("/").rsplit("/", 1)[-1]
                yield {"slug": slug, "url": url}

    def handle(item: dict, manifest: Manifest) -> None:
        slug, page_url = item["slug"], item["url"]
        html = http.get_text(page_url)
        files = list(dict.fromkeys(_HDR_URL.findall(html) + _EXR_URL.findall(html)))
        url = _pick(files, args.res)
        if not url:
            _log(f"  - {slug}: no .hdr/.exr link on page; skipping")
            manifest.mark(slug, skipped="no-hdr-link")
            return
        url = urljoin(page_url, url)
        ext = ".exr" if url.lower().split("?")[0].endswith(".exr") else ".hdr"
        dest = Path(args.out) / f"{slug}_{args.res}{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {slug} ({args.res})")
        manifest.mark(slug, license="CC0-1.0", res=args.res, url=url)

    run_loop(items(), out_dir=args.out, key_fn=lambda i: i["slug"],
             handle=handle, limit=args.limit)


def _pick(files: list[str], res: str) -> str | None:
    if not files:
        return None
    for f in files:
        if res and res.upper() in f.upper():
            return f
    return files[0]


if __name__ == "__main__":
    main()
