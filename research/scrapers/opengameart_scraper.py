#!/usr/bin/env python3
"""
opengameart_scraper.py — download OpenGameArt.org 3D submissions (mixed CC).

Source: https://opengameart.org  (3D Art: art type tid 10)
License: PER-ITEM, MIXED — CC0, CC-BY, CC-BY-SA, CC-BY-3.0/4.0, GPL, OGA-BY.
         This scraper captures each item's declared licence(s) in the manifest and,
         by default, only downloads items whose licences pass --licenses
         (default: CC0 + CC-BY family) so a downstream commercial filter is possible.
         GPL / *-SA / *-NC are awkward for bundling — excluded unless you opt in.
Programmatic access: NO formal REST API, but the site is scrapable — a filterable
         advanced search lists submission ("art") pages, each of which exposes
         direct file download links + the licence checkboxes. This scraper walks
         the search listing pages, parses each art page for file links + licences,
         filters by licence, and downloads the files. Stdlib HTML scraping
         (no bs4 — small local extractors).

LEGAL / ToS: respect OpenGameArt's terms + robots.txt and each item's licence
(attribution for CC-BY/-SA, share-alike obligations for -SA). Be a polite crawler
(default 1 rps, back-off on 429). Do not redistribute beyond each licence's terms.

RESUMABLE: a JSON manifest records every completed art-page URL; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 opengameart_scraper.py --query "furniture" --limit 20
  python3 opengameart_scraper.py --licenses cc0 --query "chair"
  python3 opengameart_scraper.py --out ./downloads/oga          # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

BASE = "https://opengameart.org"
# art type tid 10 == "3D Art"
SEARCH = BASE + "/art-search-advanced"

_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_NODE = re.compile(r"/content/[^\"'?#]+", re.I)
# Files attach under /sites/default/files/... on OGA.
_FILE = re.compile(r"/sites/default/files/[^\"'?#\s]+", re.I)

# Map readable licence tokens to the substrings that appear in OGA page text.
_LICENSE_TOKENS = {
    "cc0": ["cc0", "cc-0", "public domain"],
    "cc-by": ["cc-by 3.0", "cc-by 4.0", "cc-by", "attribution"],
    "cc-by-sa": ["cc-by-sa", "share alike", "sharealike"],
    "gpl": ["gpl", "gnu general"],
    "oga-by": ["oga-by", "oga by"],
}


def _abs(href: str) -> str:
    return urllib.parse.urljoin(BASE, href)


def _detect_licenses(html: str) -> list[str]:
    low = html.lower()
    found: list[str] = []
    for name, toks in _LICENSE_TOKENS.items():
        if any(t in low for t in toks):
            found.append(name)
    # Prefer the most specific: if -SA matched, drop the bare cc-by it overlaps.
    if "cc-by-sa" in found and "cc-by" in found:
        found.remove("cc-by")
    return found


def _listing_pages(http: HttpClient, query: str, max_pages: int):
    """Yield art-page URLs from the 3D-art advanced-search listing, paginated."""
    page = 0
    while page < max_pages:
        params = {"field_art_type_tid[]": "10", "page": str(page)}
        if query:
            params["keys"] = query
        url = f"{SEARCH}?{urllib.parse.urlencode(params)}"
        try:
            html = http.get_text(url)
        except Exception as e:  # noqa: BLE001
            _log(f"  ! listing page {page} failed: {e}")
            return
        nodes = [_abs(h) for h in _HREF.findall(html) if _NODE.fullmatch(urllib.parse.urlparse(h).path or "")]
        nodes = list(dict.fromkeys(nodes))
        if not nodes:
            return
        for n in nodes:
            yield n
        page += 1


def main() -> None:
    ap = common_argparser("opengameart", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="", help="search keywords (blank = all 3D art)")
    ap.add_argument("--licenses", default="cc0,cc-by",
                    help="comma list of allowed licences (cc0,cc-by,cc-by-sa,gpl,oga-by)")
    ap.add_argument("--max-pages", type=int, default=20, help="max listing pages to crawl")
    args = ap.parse_args()

    allowed = {s.strip().lower() for s in args.licenses.split(",") if s.strip()}
    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    _log(f"== OpenGameArt: 3D art, query={args.query!r}, licences={sorted(allowed)} ==")
    items = ({"page": p} for p in _listing_pages(http, args.query, args.max_pages))
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return item["page"]

    def handle(item: dict, manifest: Manifest) -> None:
        url = item["page"]
        html = http.get_text(url)
        licences = _detect_licenses(html)
        if allowed and not (set(licences) & allowed):
            _log(f"  - {url}: licences {licences or ['unknown']} not in filter; skipping")
            manifest.mark(url, skipped="license-filtered", licenses=licences)
            return
        files = list(dict.fromkeys(_abs(m) for m in _FILE.findall(html)))
        if not files:
            _log(f"  - {url}: no downloadable files; skipping")
            manifest.mark(url, skipped="no-files", licenses=licences)
            return
        slug = urllib.parse.urlparse(url).path.rstrip("/").split("/")[-1] or "item"
        n = 0
        for f in files:
            name = urllib.parse.urlparse(f).path.split("/")[-1]
            dest = Path(out_dir) / slug / name
            got = http.download_file(f, dest)
            n += 1 if got else 0
        _log(f"  ↓ {slug}: {len(files)} file(s) {licences}")
        manifest.mark(url, files=len(files), licenses=licences)

    run_loop(items, out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
