#!/usr/bin/env python3
"""
threedscans_scraper.py — download Three D Scans (threedscans.com) public-domain scans.

Source: https://threedscans.com
License: PUBLIC DOMAIN / no copyright claimed (CC0-equivalent), by Oliver Laric —
         free to use without restriction. Recorded as "public-domain" in the manifest.
         Mostly geometry-only (untextured white meshes) → needs a material applied
         downstream; heavy poly counts → decimate for real-time (see MODEL_LIBRARIES).
Programmatic access: NO API. A static-ish gallery where each scan has a page that
         links its downloadable model file(s) (STL/OBJ). This scraper scrapes the
         gallery index for scan pages, then each scan page for the direct file
         link(s), and downloads them. Stdlib HTML scraping (no bs4 — small local
         link extractors).

LEGAL / ToS: assets are public-domain; still be a polite crawler (default 1 rps,
back-off on 429). The catalog is small (low hundreds) — keep --rps gentle.

RESUMABLE: a JSON manifest records every completed scan page; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 threedscans_scraper.py --limit 10
  python3 threedscans_scraper.py --index https://threedscans.com
  python3 threedscans_scraper.py --out ./downloads/threedscans   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import re
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

BASE = "https://threedscans.com"

_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_SRC = re.compile(r'(?:href|src)=["\']([^"\']+\.(?:stl|obj|ply|glb|gltf|zip))["\']', re.I)
_MODEL_EXT = re.compile(r"\.(stl|obj|ply|glb|gltf|zip)(\?|$)", re.I)


def _abs(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)


def _links(html: str, base: str) -> list[str]:
    return [_abs(base, h) for h in _HREF.findall(html)]


def _collect_scan_pages(http: HttpClient, index_url: str) -> list[dict]:
    """Gather candidate scan pages + any direct model files from the gallery index."""
    html = http.get_text(index_url)
    pages: list[str] = []
    direct: list[str] = []
    host = urllib.parse.urlparse(index_url).netloc
    for link in _links(html, index_url):
        if _MODEL_EXT.search(link):
            direct.append(link)
            continue
        p = urllib.parse.urlparse(link)
        if p.netloc and p.netloc != host:
            continue
        path = p.path.rstrip("/")
        # Per-scan pages are single-segment slugs under the root (skip the root itself).
        if path and path.count("/") == 1 and not path.lower().endswith((".html", ".css", ".js")):
            pages.append(link)
    items = [{"page": None, "file": f} for f in dict.fromkeys(direct)]
    items += [{"page": p, "file": None} for p in dict.fromkeys(pages)]
    return items


def _find_files_on_page(http: HttpClient, page_url: str) -> list[str]:
    html = http.get_text(page_url)
    files = [_abs(page_url, m) for m in _SRC.findall(html)]
    return list(dict.fromkeys(files))


def main() -> None:
    ap = common_argparser("threedscans", __doc__.strip().splitlines()[0])
    ap.add_argument("--index", default=BASE, help="gallery index page to scrape")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    _log(f"== Three D Scans: scraping {args.index} ==")
    items = _collect_scan_pages(http, args.index)
    _log(f"   found {len(items)} candidate scans/files")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return item["file"] or item["page"]

    def handle(item: dict, manifest: Manifest) -> None:
        files = [item["file"]] if item["file"] else _find_files_on_page(http, item["page"])
        files = [f for f in files if f]
        if not files:
            _log(f"  - no model file on {item['page']}; skipping")
            manifest.mark(key_fn(item), skipped="no-file")
            return
        slug = urllib.parse.urlparse(key_fn(item)).path.rstrip("/").split("/")[-1] or "scan"
        n = 0
        for f in files:
            name = urllib.parse.urlparse(f).path.split("/")[-1]
            dest = Path(out_dir) / slug / name
            got = http.download_file(f, dest)
            n += 1 if got else 0
        _log(f"  ↓ {slug}: {len(files)} file(s) [public-domain]")
        manifest.mark(key_fn(item), files=len(files), license="public-domain")

    run_loop(items, out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
