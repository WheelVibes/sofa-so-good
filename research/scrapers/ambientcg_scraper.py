#!/usr/bin/env python3
"""
ambientcg_scraper.py — download ambientCG PBR materials + HDRIs via the public API.

Source: https://ambientcg.com  ·  API: https://docs.ambientcg.com/api/v2/
License: CC0 1.0 (public domain) — commercial use OK, no attribution, redistribution
         + modification allowed. Recorded per-asset in the manifest.
Programmatic access: Public REST API v2, no key/account. The catalogue endpoint
         `full_json` is paginated via offset/limit; with `include=downloadData` each
         asset carries a `downloadFolders` tree whose leaf `downloads` entries expose a
         direct `rawDownloadLink` (and `downloadLink`) ZIP URL — no scraping of HTML.
LEGAL / ToS: CC0 source, public API explicitly provided for programmatic use. Be polite
         (default 1 rps); this is the operator's responsibility. (This app already proxies
         ambientCG via Vite in dev; this standalone script hits the public API directly.)

RESUMABLE: a JSON manifest records every completed asset; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

API shape (full_json, include=downloadData), navigated defensively:
  {
    "foundAssets": [
      {
        "assetId": "Wood050",
        "downloadFolders": {
          "default": {
            "downloadFiletypeCategories": {
              "zip": {
                "downloads": [
                  {"attribute": "2K-PNG", "fileName": "Wood050_2K-PNG.zip",
                   "rawDownloadLink": "https://.../Wood050_2K-PNG.zip",
                   "downloadLink": "https://ambientcg.com/get?...", "size": 12345}
                ]
              }
            }
          }
        }
      }
    ],
    "numberOfResults": 2048
  }

Examples:
  python3 ambientcg_scraper.py --type Material --res 2K --limit 20
  python3 ambientcg_scraper.py --type HDRI --res 4K --out ./downloads/acg_hdri
  python3 ambientcg_scraper.py --type Material            # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

API = "https://ambientcg.com/api/v2/full_json"
PAGE = 100  # API max page size for full_json


def main() -> None:
    ap = common_argparser("ambientcg", __doc__.strip().splitlines()[0])
    ap.add_argument("--type", default="Material",
                    help="asset type: Material | HDRI | Atlas | Decal | Substance | ...")
    ap.add_argument("--res", default="2K",
                    help="preferred resolution tier, e.g. 1K/2K/4K/8K (best-effort; "
                         "falls back to the first available ZIP if absent)")
    ap.add_argument("--fmt", default="PNG",
                    help="preferred map filetype for materials (PNG/JPG); EXR/HDR auto for HDRI")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)
    out_dir = args.out

    def items():
        offset = 0
        while True:
            url = (f"{API}?type={args.type}&include=downloadData"
                   f"&limit={PAGE}&offset={offset}&sort=Alphabet")
            page = http.get_json(url)
            found = page.get("foundAssets") or []
            if not found:
                break
            for asset in found:
                yield asset
            offset += PAGE
            # Stop once we've walked the whole catalogue.
            total = page.get("numberOfResults")
            if isinstance(total, int) and offset >= total:
                break

    def handle(asset: dict, manifest: Manifest) -> None:
        asset_id = asset.get("assetId") or asset.get("asset_id")
        if not asset_id:
            return
        url = _pick_zip(asset, args.res, args.fmt)
        if not url:
            _log(f"  - {asset_id}: no ZIP at res={args.res}; skipping")
            manifest.mark(asset_id, skipped="no-matching-res")
            return
        dest = Path(out_dir) / f"{asset_id}_{args.res}.zip"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {asset_id} ({args.res})")
        manifest.mark(asset_id, license="CC0-1.0", res=args.res, url=url)

    run_loop(items(), out_dir=out_dir, key_fn=lambda a: a.get("assetId", "?"),
             handle=handle, limit=args.limit)


def _pick_zip(asset: dict, res: str, fmt: str) -> str | None:
    """Find the best ZIP `rawDownloadLink` in an asset's downloadFolders tree.

    Prefers an `attribute` containing the requested resolution (and filetype for
    materials); otherwise falls back to any available ZIP. Navigated defensively so a
    schema tweak degrades to 'no match' rather than crashing the whole run.
    """
    folders = asset.get("downloadFolders")
    if not isinstance(folders, dict):
        return None
    candidates: list[tuple[int, str]] = []  # (score, url)
    for folder in folders.values():
        if not isinstance(folder, dict):
            continue
        cats = folder.get("downloadFiletypeCategories")
        if not isinstance(cats, dict):
            continue
        zip_cat = cats.get("zip") or cats.get("Zip") or cats.get("ZIP")
        if not isinstance(zip_cat, dict):
            continue
        for dl in zip_cat.get("downloads") or []:
            if not isinstance(dl, dict):
                continue
            link = dl.get("rawDownloadLink") or dl.get("downloadLink")
            if not link:
                continue
            attr = (dl.get("attribute") or "").upper()
            score = 0
            if res and res.upper() in attr:
                score += 2
            if fmt and fmt.upper() in attr:
                score += 1
            candidates.append((score, link))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1]


if __name__ == "__main__":
    main()
