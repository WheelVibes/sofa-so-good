#!/usr/bin/env python3
"""
sketchfab_scraper.py — download Sketchfab CC-licensed, downloadable models (GLB).

Source: https://sketchfab.com  ·  Data API v3: https://api.sketchfab.com/v3
        Download API: https://sketchfab.com/developers/download-api
License: PER-MODEL Creative Commons (CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-ND…).
         This scraper records each model's licence + author/uri in the manifest and
         only fetches licences in --licenses (default: CC0 + CC-BY family) so a
         downstream commercial filter is possible. CC-BY requires crediting the
         author + Sketchfab when shipped; NC/ND are excluded unless you opt in.
Programmatic access: full REST API. Data API v3 search:
         GET /v3/search?type=models&downloadable=true&licenses=<uid>&q=<query>
         (face-count + category filters available). Download API:
         GET /v3/models/{uid}/download  →  JSON with time-limited signed URLs
         ({gltf:{url}, glb:{url}, usdz:{url}, source:{url}}). Requires an API
         TOKEN (OAuth or a personal API token) sent as
         `Authorization: Token <token>`. Pass it via --api-key or API_KEY env.
         Download links EXPIRE quickly — fetch immediately after requesting.

LEGAL / ToS: follow Sketchfab's API guidelines + per-model licence; surface
attribution for CC-BY/-SA; respect rate limits (default 1 rps here). Note the
ongoing migration under Epic's Fab. Use within your account's terms.

RESUMABLE: a JSON manifest records every completed model uid; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  API_KEY=xxxx python3 sketchfab_scraper.py --query "armchair" --limit 25
  python3 sketchfab_scraper.py --api-key xxxx --query "sofa" --licenses cc0
  python3 sketchfab_scraper.py --api-key xxxx --query "lamp"   # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

import sys
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

API = "https://api.sketchfab.com/v3"

# Sketchfab licence "slug" filter values accepted by the search API.
LICENSE_SLUGS = {
    "cc0": "cc0",
    "cc-by": "by",
    "cc-by-sa": "by-sa",
    "cc-by-nd": "by-nd",
    "cc-by-nc": "by-nc",
    "cc-by-nc-sa": "by-nc-sa",
    "cc-by-nc-nd": "by-nc-nd",
}


def _search(http: HttpClient, query: str, license_slugs: list[str], cursor: str | None):
    params = {
        "type": "models",
        "downloadable": "true",
        "q": query,
        "count": "24",
    }
    # The API accepts repeated `licenses` params; join with the first as a sane default.
    if license_slugs:
        params["licenses"] = license_slugs[0]
    url = f"{API}/search?{urllib.parse.urlencode(params)}"
    if cursor:
        url = cursor
    return http.get_json(url)


def main() -> None:
    ap = common_argparser("sketchfab", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="furniture", help="search term")
    ap.add_argument("--licenses", default="cc0,cc-by",
                    help="comma list of CC licences to allow (cc0,cc-by,cc-by-sa,...)")
    ap.add_argument("--max-faces", type=int, default=0,
                    help="skip models above this face count (0 = no limit)")
    args = ap.parse_args()

    if not args.api_key:
        _log("ERROR: Sketchfab Download API needs an API token. Pass --api-key or set API_KEY env.")
        _log("       Create one at https://sketchfab.com/settings/password (API token) or via OAuth.")
        sys.exit(2)

    allowed = [s.strip().lower() for s in args.licenses.split(",") if s.strip()]
    slugs = [LICENSE_SLUGS[a] for a in allowed if a in LICENSE_SLUGS]

    http = HttpClient(
        rps=args.rps,
        retries=args.retries,
        timeout=args.timeout,
        headers={"Authorization": f"Token {args.api_key}"},
    )

    def iter_models():
        cursor = None
        while True:
            data = _search(http, args.query, slugs, cursor)
            results = data.get("results") or []
            if not results:
                break
            for r in results:
                yield r
            cursor = data.get("next")
            if not cursor:
                break

    _log(f"== Sketchfab: query={args.query!r}, licences={allowed} ==")
    out_dir = str(Path(args.out))

    def key_fn(item: dict) -> str:
        return str(item.get("uid") or item.get("uri") or "")

    def handle(item: dict, manifest: Manifest) -> None:
        uid = key_fn(item)
        name = item.get("name") or uid
        author = (item.get("user") or {}).get("displayName") or (item.get("user") or {}).get("username")
        lic = (item.get("license") or {})
        lic_slug = lic.get("slug") or lic.get("label") or "unknown"
        faces = item.get("faceCount") or 0
        if args.max_faces and faces and faces > args.max_faces:
            _log(f"  - {uid} ({name}): {faces} faces > --max-faces; skipping")
            manifest.mark(uid, skipped="too-many-faces", faces=faces)
            return
        # Request a time-limited download archive URL.
        dl = http.get_json(f"{API}/models/{uid}/download")
        glb = (dl.get("glb") or {}).get("url") or (dl.get("gltf") or {}).get("url")
        if not glb:
            _log(f"  - {uid} ({name}): no glb/gltf download URL; skipping")
            manifest.mark(uid, skipped="no-download", license=lic_slug)
            return
        dest = Path(out_dir) / f"{uid}.glb"
        got = http.download_file(glb, dest)
        _log(f"  {'↓' if got else '·'} {uid} — {name} [{lic_slug}]")
        manifest.mark(uid, title=name, author=author, license=lic_slug, faces=faces)

    run_loop(iter_models(), out_dir=out_dir, key_fn=key_fn, handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
