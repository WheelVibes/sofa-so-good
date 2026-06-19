#!/usr/bin/env python3
"""
thingiverse_scraper.py — download Thingiverse "thing" files (printable furniture/decor).

Source: https://www.thingiverse.com  ·  API: https://api.thingiverse.com
License: PER-ITEM Creative Commons (CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-ND, GPL) —
         stated on each thing. This scraper records each thing's licence in the
         manifest and only downloads licences in --licenses (default: CC0 + CC-BY
         family) so a downstream commercial filter is possible. NC/ND/GPL excluded
         unless you opt in. NOTE: files are mostly STL (no PBR/UVs) — they need
         STL→glTF conversion + materials before use in the app (out of scope here).
Programmatic access: REST API with app-token auth.
           GET /search/{term}?type=things                     (search)
           GET /things/{id}/files                              (file list)
           each file's `download_url` (or `public_url`) is the direct download.
         The token is sent as `Authorization: Bearer <token>` (or ?access_token=).
         Register an app at https://www.thingiverse.com/developers to get a token.
         Pass it via --api-key or the API_KEY env var.

LEGAL / ToS: follow Thingiverse's API Terms + each thing's licence (attribution for
CC-BY/-SA, share-alike for -SA). Respect rate limits (default 1 rps, back-off on 429).

RESUMABLE: a JSON manifest records every completed thing id; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  API_KEY=xxxx python3 thingiverse_scraper.py --query "furniture" --limit 20
  python3 thingiverse_scraper.py --api-key xxxx --query "chair" --licenses cc0
  python3 thingiverse_scraper.py --api-key xxxx --query "vase"   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import sys
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

API = "https://api.thingiverse.com"

# Thingiverse `license` field values → our readable buckets for filtering.
_LICENSE_MAP = {
    "Creative Commons - Public Domain Dedication": "cc0",
    "Public Domain": "cc0",
    "Creative Commons - Attribution": "cc-by",
    "Creative Commons - Attribution - Share Alike": "cc-by-sa",
    "Creative Commons - Attribution - No Derivatives": "cc-by-nd",
    "Creative Commons - Attribution - Non-Commercial": "cc-by-nc",
    "Creative Commons - Attribution - Non-Commercial - Share Alike": "cc-by-nc-sa",
    "Creative Commons - Attribution - Non-Commercial - No Derivatives": "cc-by-nc-nd",
    "GNU - GPL": "gpl",
    "GNU - LGPL": "gpl",
}


def _bucket(license_str: str | None) -> str:
    if not license_str:
        return "unknown"
    return _LICENSE_MAP.get(license_str, license_str.lower())


def _search(http: HttpClient, query: str, page: int, per_page: int) -> dict:
    q = urllib.parse.quote(query)
    return http.get_json(f"{API}/search/{q}?type=things&page={page}&per_page={per_page}")


def main() -> None:
    ap = common_argparser("thingiverse", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="furniture", help="search term")
    ap.add_argument("--licenses", default="cc0,cc-by",
                    help="comma list of allowed licences (cc0,cc-by,cc-by-sa,...)")
    ap.add_argument("--per-page", type=int, default=30, help="results per API page")
    args = ap.parse_args()

    if not args.api_key:
        _log("ERROR: Thingiverse API needs an app token. Pass --api-key or set API_KEY env.")
        _log("       Register an app at https://www.thingiverse.com/developers")
        sys.exit(2)

    allowed = {s.strip().lower() for s in args.licenses.split(",") if s.strip()}
    http = HttpClient(
        rps=args.rps,
        retries=args.retries,
        timeout=args.timeout,
        headers={"Authorization": f"Bearer {args.api_key}"},
    )

    def iter_things():
        page = 1
        while True:
            data = _search(http, args.query, page, args.per_page)
            hits = data.get("hits") if isinstance(data, dict) else data
            hits = hits or []
            if not hits:
                break
            for h in hits:
                yield h
            if len(hits) < args.per_page:
                break
            page += 1

    _log(f"== Thingiverse: query={args.query!r}, licences={sorted(allowed)} ==")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return str(item.get("id") or "")

    def handle(item: dict, manifest: Manifest) -> None:
        tid = key_fn(item)
        name = item.get("name") or tid
        lic = _bucket(item.get("license"))
        if allowed and lic not in allowed:
            _log(f"  - {tid} ({name}): licence {lic} not in filter; skipping")
            manifest.mark(tid, skipped="license-filtered", license=lic)
            return
        files = http.get_json(f"{API}/things/{tid}/files")
        files = files or []
        if not files:
            _log(f"  - {tid} ({name}): no files; skipping")
            manifest.mark(tid, skipped="no-files", license=lic)
            return
        n = 0
        for f in files:
            url = f.get("download_url") or f.get("public_url")
            fname = f.get("name") or url.split("/")[-1]
            if not url:
                continue
            dest = Path(out_dir) / tid / fname
            got = http.download_file(url, dest)
            n += 1 if got else 0
        _log(f"  ↓ {tid} — {name} ({len(files)} file(s)) [{lic}]")
        manifest.mark(tid, title=name, files=len(files), license=lic)

    run_loop(iter_things(), out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
