#!/usr/bin/env python3
"""
hdrmaps_scraper.py — download HDRMaps free-tier HDRIs (CC BY 4.0).

Source: https://hdrmaps.com/freebies/free-hdris/
License: Free tier is CC BY 4.0 — commercial use OK WITH ATTRIBUTION (credit HDRMaps +
         the author). Full-res / backplates are paid/Patreon and are NOT covered here.
         The CC-BY license + attribution requirement is recorded per-asset in the
         manifest (you MUST keep that credit when you ship the map).
Programmatic access: No REST API. The freebies hub is a paginated WordPress listing; this
         script crawls the freebies pages for per-asset detail pages and parses each for
         the .exr download link.
LEGAL / ToS: NOTE — HDRMaps gates many downloads behind a free account / a download form
         (WooCommerce "free purchase" flow), so a direct .exr link may not be present on
         the public page without a logged-in session/cookie. This script attempts only
         the publicly reachable links and records assets it cannot fetch as skipped; it
         does NOT attempt to bypass the account/form gate. Honour the CC-BY attribution
         and the site's ToS. WordPress/Cloudflare may 403 scripts — a proxy/allow-listed
         host may be required.

RESUMABLE: a JSON manifest records every completed HDRI; re-running skips them.
RATE-LIMITED: --rps (default 0.5/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 hdrmaps_scraper.py --res 2K --limit 10
  python3 hdrmaps_scraper.py --out ./downloads/hdrmaps
  python3 hdrmaps_scraper.py                         # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

BASE = "https://hdrmaps.com"
HUB = f"{BASE}/freebies/free-hdris/"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 "
    "sofa-so-good-asset-scraper/1.0 (+research)"
)

# WooCommerce product detail pages for the free HDRIs.
_DETAIL_URL = re.compile(r'https?://hdrmaps\.com/[^"\'\\\s?#]*hdri[^"\'\\\s?#]*/', re.I)
_NEXT_PAGE = re.compile(r'href=["\'](https?://hdrmaps\.com/[^"\']*?/page/\d+/?[^"\']*)["\']', re.I)
_EXR_URL = re.compile(r'https?://[^"\'\\\s]+\.exr\b[^"\'\\\s]*', re.I)
_HDR_URL = re.compile(r'https?://[^"\'\\\s]+\.hdr\b[^"\'\\\s]*', re.I)


def main() -> None:
    ap = common_argparser("hdrmaps", __doc__.strip().splitlines()[0])
    ap.add_argument("--res", default="", help="preferred resolution token in the file name (e.g. 1K/2K)")
    ap.add_argument("--max-pages", type=int, default=20, help="max listing pages to crawl")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps or 0.5, retries=args.retries, timeout=args.timeout,
                      user_agent=BROWSER_UA)

    def items():
        seen: set[str] = set()
        page_url = HUB
        for _ in range(max(1, args.max_pages)):
            try:
                html = http.get_text(page_url)
            except Exception as e:  # noqa: BLE001
                _log(f"  ! listing fetch failed {page_url}: {e}")
                break
            for url in dict.fromkeys(_DETAIL_URL.findall(html)):
                if url not in seen:
                    seen.add(url)
                    slug = url.rstrip("/").rsplit("/", 1)[-1]
                    yield {"slug": slug, "url": url}
            nexts = _NEXT_PAGE.findall(html)
            nxt = next((u for u in nexts if u not in (page_url,)), None)
            if not nxt or nxt == page_url:
                break
            page_url = nxt

    def handle(item: dict, manifest: Manifest) -> None:
        slug, page_url = item["slug"], item["url"]
        html = http.get_text(page_url)
        files = list(dict.fromkeys(_EXR_URL.findall(html) + _HDR_URL.findall(html)))
        url = _pick(files, args.res)
        if not url:
            _log(f"  - {slug}: no public .exr/.hdr link (likely account/form-gated); skipping")
            manifest.mark(slug, skipped="gated-or-no-link", license="CC-BY-4.0")
            return
        url = urljoin(page_url, url)
        ext = ".hdr" if url.lower().split("?")[0].endswith(".hdr") else ".exr"
        dest = Path(args.out) / f"{slug}{('_' + args.res) if args.res else ''}{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {slug}")
        manifest.mark(slug, license="CC-BY-4.0", attribution="HDRMaps + author", url=url)

    run_loop(items(), out_dir=args.out, key_fn=lambda i: i["slug"],
             handle=handle, limit=args.limit)


def _pick(files: list[str], res: str) -> str | None:
    if not files:
        return None
    if res:
        for f in files:
            if res.upper() in f.upper():
                return f
    return files[0]


if __name__ == "__main__":
    main()
