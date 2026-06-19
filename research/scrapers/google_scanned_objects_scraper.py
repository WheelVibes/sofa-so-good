#!/usr/bin/env python3
"""
google_scanned_objects_scraper.py — download Google Scanned Objects (GSO).

Source: https://research.google/blog/scanned-objects-by-google-research-a-dataset-of-3d-scanned-common-household-items/
        Hosted on Gazebo Fuel: https://app.gazebosim.org/GoogleResearch/fuel/collections/Scanned%20Objects%20by%20Google%20Research
License: *** CC-BY 4.0 — COMMERCIAL-SAFE *** (attribution required). One of the
        few fully clean-commercial 3D-scanned datasets. Credit "Google Research"
        per the CC-BY terms when you ship derived assets.
Access method: open Gazebo Fuel REST API (fuel.gazebosim.org). List the models in
        the `GoogleResearch` owner namespace, then download each model's zip
        (OBJ + textures + collision meshes + SDF). No form, no key.

Fuel REST shape (v1.0):
  list:     GET https://fuel.gazebosim.org/1.0/GoogleResearch/models?page=N&per_page=M
            -> JSON array of {name, owner, version, ...}; pagination via the HTTP
               `Link` header (rel="next") — we walk pages until a page is empty.
  download: GET https://fuel.gazebosim.org/1.0/GoogleResearch/models/<name>/<version>/<name>.zip
            (a per-version permalink; we use the version reported by the listing).

LEGAL: CC-BY 4.0 — attribution required, commercial use allowed. The dataset is
       ~1,030 models / ~13GB. Respect Fuel's rate limits (default --rps low).

RESUMABLE: one manifest item per model (its zip). Re-run resumes.
RATE-LIMITED: --rps with retry/backoff (honours Retry-After).

Stdlib only — no pip install needed.

Examples:
  python3 google_scanned_objects_scraper.py --limit 5      # first 5 models
  python3 google_scanned_objects_scraper.py                # all ~1030, resumable
  python3 google_scanned_objects_scraper.py --out ./downloads/gso
"""
from __future__ import annotations

from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

API = "https://fuel.gazebosim.org/1.0"
OWNER = "GoogleResearch"


def enumerate_models(http: HttpClient, per_page: int = 100) -> list[dict]:
    """Walk the paginated Fuel model listing for the GoogleResearch owner."""
    models: list[dict] = []
    page = 1
    while True:
        url = f"{API}/{OWNER}/models?page={page}&per_page={per_page}"
        try:
            batch = http.get_json(url)
        except Exception as e:  # noqa: BLE001 — Fuel returns 404 past the last page
            _log(f"  (stop paging at page {page}: {e})")
            break
        if not batch:
            break
        for m in batch:
            name = m.get("name")
            if not name:
                continue
            version = m.get("version", 1)
            models.append({"name": name, "owner": m.get("owner", OWNER), "version": version})
        if len(batch) < per_page:
            break
        page += 1
    return models


def main() -> None:
    ap = common_argparser("google_scanned_objects", __doc__.strip().splitlines()[0])
    ap.add_argument("--per-page", type=int, default=100, help="Fuel listing page size")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    _log(f"== Google Scanned Objects (Fuel /{OWNER}) ==")
    models = enumerate_models(http, per_page=args.per_page)
    _log(f"  enumerated {len(models)} model(s)")

    def handle(item: dict, manifest: Manifest) -> None:
        name = item["name"]
        version = item["version"]
        owner = item["owner"]
        url = f"{API}/{owner}/models/{name}/{version}/{name}.zip"
        dest = Path(args.out) / f"{name}.zip"
        got = http.download_file(url, dest)
        _log(f"  {'↓' if got else '·'} {name} (v{version})")
        manifest.mark(name, version=version, downloaded=got)

    run_loop(models, out_dir=args.out, key_fn=lambda i: i["name"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
