#!/usr/bin/env python3
"""
3dtextures_me_scraper.py — download 3DTextures.me CC0 PBR textures.

Source: https://3dtextures.me
License: CC0 1.0 (public domain) — commercial OK, no attribution. Free tier is 1K
         (Patreon adds 4K/.sbsar). Recorded per-asset in the manifest.
Programmatic access: WordPress site, no REST API. Texture posts are enumerated from the
         WordPress sitemap (post-sitemap*.xml) or the RSS feed (/feed/); each post page
         carries the ZIP download link (hosted on the site's own domain), parsed out of
         the post HTML.
LEGAL / ToS: CC0 textures. NOTE — Cloudflare-fronted; scripted requests may get HTTP 403.
         A residential/headless-browser proxy or allow-listed host may be required; this
         script sets a browser-like UA but cannot solve a Cloudflare challenge. Be polite.

RESUMABLE: a JSON manifest records every completed post; re-running skips them.
RATE-LIMITED: --rps (default 0.5/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 3dtextures_me_scraper.py --limit 20
  python3 3dtextures_me_scraper.py --out ./downloads/3dtextures
  python3 3dtextures_me_scraper.py                   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop, sitemap_locs

BASE = "https://3dtextures.me"
SITEMAP = f"{BASE}/sitemap.xml"
RSS = f"{BASE}/feed/"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 "
    "sofa-so-good-asset-scraper/1.0 (+research)"
)

# Post permalinks look like https://3dtextures.me/2024/01/02/<slug>/ — skip taxonomy/asset URLs.
_POST_URL = re.compile(r"^https?://3dtextures\.me/\d{4}/\d{2}/\d{2}/[^?#]+/?$", re.I)
_NONPOST = re.compile(r"/(category|tag|page|author|wp-content|wp-json|feed)/", re.I)
_ZIP_URL = re.compile(r'https?://[^"\'\\\s]+\.zip\b[^"\'\\\s]*', re.I)
# RSS <link> entries (fallback enumeration if the sitemap is unavailable).
_RSS_LINK = re.compile(r"<link>\s*([^<\s]+)\s*</link>", re.I)


def main() -> None:
    ap = common_argparser("3dtextures_me", __doc__.strip().splitlines()[0])
    ap.add_argument("--feed", choices=["sitemap", "rss"], default="sitemap",
                    help="enumerate posts via the WordPress sitemap or the RSS feed")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps or 0.5, retries=args.retries, timeout=args.timeout,
                      user_agent=BROWSER_UA)

    def items():
        seen: set[str] = set()
        urls = _enumerate(http, args.feed)
        for url in urls:
            if _POST_URL.match(url) and not _NONPOST.search(url) and url not in seen:
                seen.add(url)
                slug = url.rstrip("/").rsplit("/", 1)[-1]
                yield {"slug": slug, "url": url}

    def handle(item: dict, manifest: Manifest) -> None:
        slug, page_url = item["slug"], item["url"]
        html = http.get_text(page_url)
        zips = list(dict.fromkeys(_ZIP_URL.findall(html)))
        if not zips:
            _log(f"  - {slug}: no ZIP link on post; skipping")
            manifest.mark(slug, skipped="no-zip-link")
            return
        url = urljoin(page_url, zips[0])
        dest = Path(args.out) / f"{slug}.zip"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {slug}")
        manifest.mark(slug, license="CC0-1.0", url=url)

    run_loop(items(), out_dir=args.out, key_fn=lambda i: i["slug"],
             handle=handle, limit=args.limit)


def _enumerate(http: HttpClient, feed: str) -> list[str]:
    if feed == "rss":
        try:
            return _RSS_LINK.findall(http.get_text(RSS))
        except Exception as e:  # noqa: BLE001
            _log(f"  ! RSS fetch failed: {e}")
            return []
    # Sitemap (possibly an index of post-sitemap*.xml sub-sitemaps).
    out: list[str] = []
    try:
        locs = sitemap_locs(http.get_text(SITEMAP))
    except Exception as e:  # noqa: BLE001
        _log(f"  ! sitemap fetch failed: {e}")
        return []
    for loc in locs:
        if loc.lower().endswith(".xml"):
            try:
                out.extend(sitemap_locs(http.get_text(loc)))
            except Exception as e:  # noqa: BLE001
                _log(f"  ! sub-sitemap failed {loc}: {e}")
        else:
            out.append(loc)
    return out


if __name__ == "__main__":
    main()
