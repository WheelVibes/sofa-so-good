#!/usr/bin/env python3
"""
poly_pizza_scraper.py — download Poly Pizza low-poly models (GLB).

Source: https://poly.pizza  ·  API: https://poly.pizza/docs/api/v1.1
License: PER-MODEL — CC0 or CC-BY (incl. the rescued Google Poly catalog +
         Quaternius/Kenney-style packs). CC0 needs no attribution; CC-BY requires
         crediting the creator (+ Poly Pizza). The manifest records each item's
         licence + creator so a downstream commercial/attribution filter is possible.
Programmatic access: documented REST API v1.1. Needs a FREE API key (free for
         hobby use, pay-as-you-go for commercial) passed in the `x-auth-token`
         header. Search/list endpoints return a `Download` field with a direct
         CDN GLB URL (e.g. https://static.poly.pizza/<uid>.glb) — trivially
         scriptable for batch fetch. CORS-friendly CDN.
         Pass the key via --api-key or the API_KEY environment variable.

LEGAL / ToS: use within Poly Pizza's API terms; honour per-model licences and
attribution. CC-BY assets must surface creator + Poly Pizza credit when shipped.
Be a polite client (default 1 rps). Do not exceed your key's quota.

RESUMABLE: a JSON manifest records every completed model uid; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  API_KEY=xxxx python3 poly_pizza_scraper.py --query "chair" --limit 50
  python3 poly_pizza_scraper.py --api-key xxxx --query "sofa" --out ./downloads/pp_sofa
  python3 poly_pizza_scraper.py --api-key xxxx --query "lamp"   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import sys
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

API = "https://api.poly.pizza/v1.1"


def _search(http: HttpClient, query: str, page: int, per_page: int) -> dict:
    q = urllib.parse.quote(query)
    # Documented search endpoint: /search/{term}?page=&limit=
    url = f"{API}/search/{q}?page={page}&limit={per_page}"
    return http.get_json(url)


def _iter_items(http: HttpClient, query: str, per_page: int):
    """Yield model dicts across paginated search results until exhausted."""
    page = 1
    seen = 0
    while True:
        data = _search(http, query, page, per_page)
        results = data.get("results") or data.get("Results") or []
        if not results:
            break
        for r in results:
            yield r
            seen += 1
        total = data.get("total") or data.get("Total") or 0
        if total and seen >= total:
            break
        if len(results) < per_page:
            break
        page += 1


def _field(item: dict, *names: str):
    for n in names:
        if n in item and item[n] not in (None, ""):
            return item[n]
    return None


def main() -> None:
    ap = common_argparser("poly_pizza", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="furniture", help="search term (e.g. chair, sofa, lamp)")
    ap.add_argument("--per-page", type=int, default=50, help="results per API page")
    args = ap.parse_args()

    if not args.api_key:
        _log("ERROR: Poly Pizza needs a free API key. Pass --api-key or set API_KEY env.")
        _log("       Get one at https://poly.pizza/docs/api/v1.1")
        sys.exit(2)

    http = HttpClient(
        rps=args.rps,
        retries=args.retries,
        timeout=args.timeout,
        headers={"x-auth-token": args.api_key},
    )

    _log(f"== Poly Pizza: query={args.query!r} ==")
    items = _iter_items(http, args.query, args.per_page)
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return str(_field(item, "ID", "Id", "id", "uid") or _field(item, "Download", "Url") or "")

    def handle(item: dict, manifest: Manifest) -> None:
        uid = key_fn(item)
        glb_url = _field(item, "Download", "DownloadUrl", "url", "Url")
        if not glb_url:
            _log(f"  - {uid}: no Download URL; skipping")
            manifest.mark(uid, skipped="no-download-url")
            return
        title = _field(item, "Title", "title", "name") or uid
        creator = (
            _field(item, "Creator", "creator", "Author", "author") or {}
        )
        creator_name = creator.get("Username") if isinstance(creator, dict) else creator
        licence = _field(item, "Licence", "License", "license") or "unknown"
        dest = Path(out_dir) / f"{uid}.glb"
        got = http.download_file(glb_url, dest)
        _log(f"  {'↓' if got else '·'} {uid} — {title} [{licence}]")
        manifest.mark(
            uid,
            title=title,
            creator=creator_name,
            license=licence,
            url=glb_url,
        )

    run_loop(items, out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
