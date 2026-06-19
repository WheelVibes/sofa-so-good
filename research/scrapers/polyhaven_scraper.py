#!/usr/bin/env python3
"""
polyhaven_scraper.py — download Poly Haven assets (HDRIs, textures, models).

Source: https://polyhaven.com  ·  API: https://api.polyhaven.com
License: CC0 1.0 (public domain) — commercial use OK, no attribution required.
Programmatic access: documented public REST API, no key, predictable CDN URLs.
This is one of the cleanest, most integration-friendly sources (see
research/MODEL_LIBRARIES.html → Ultra/High tiers).

RESUMABLE: a JSON manifest records every completed asset; re-running skips them.
RATE-LIMITED: --rps (default 1/s) with retry+backoff honouring HTTP 429.

Examples:
  python3 polyhaven_scraper.py --type hdris --res 4k --limit 20
  python3 polyhaven_scraper.py --type textures --res 2k --out ./downloads/ph_tex
  python3 polyhaven_scraper.py --type models                 # resumes automatically

Stdlib only (no pip install needed).
"""
from __future__ import annotations

from pathlib import Path

from scraper_common import HttpClient, Manifest, common_argparser, run_loop, _log

API = "https://api.polyhaven.com"


def main() -> None:
    ap = common_argparser("polyhaven", __doc__.strip().splitlines()[0])
    ap.add_argument("--type", choices=["hdris", "textures", "models", "all"], default="hdris")
    ap.add_argument("--res", default="4k", help="resolution tier, e.g. 1k/2k/4k/8k (best-effort)")
    ap.add_argument("--fmt", default="", help="preferred file format (hdr/exr/jpg/png/gltf); blank = pick sensible default")
    args = ap.parse_args()

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)
    types = ["hdris", "textures", "models"] if args.type == "all" else [args.type]

    for asset_type in types:
        _log(f"== Poly Haven: {asset_type} ==")
        # Canonical param is `t=` (the API also tolerates `type=`); send `t=` so a
        # future tightening that drops the alias doesn't yield an empty map (REV-005).
        ids = http.get_json(f"{API}/assets?t={asset_type}")  # {slug: {...}}
        items = [{"slug": slug, "type": asset_type} for slug in ids]
        out_dir = str(Path(args.out) / asset_type)

        def handle(item: dict, manifest: Manifest) -> None:
            slug = item["slug"]
            files = http.get_json(f"{API}/files/{slug}")  # nested {category:{res:{fmt:{url,...}}}}
            urls = _pick_urls(files, args.res, args.fmt)
            if not urls:
                _log(f"  - {slug}: no files at res={args.res}; skipping")
                manifest.mark(slug, skipped="no-matching-res")
                return
            for rel, url in urls:
                dest = Path(out_dir) / slug / rel
                got = http.download_file(url, dest)
                _log(f"  {'↓' if got else '·'} {slug}/{rel}")
            manifest.mark(slug, files=len(urls))

        run_loop(items, out_dir=out_dir, key_fn=lambda i: i["slug"],
                 handle=handle, limit=args.limit)


def _pick_urls(files: dict, res: str, fmt: str) -> list[tuple[str, str]]:
    """Walk Poly Haven's nested files map and pick download URLs for the chosen
    resolution (falls back to the first available res if the requested one is absent).
    Returns (relative_path, url) pairs (incl. the texture map set / GLTF + its blobs)."""
    out: list[tuple[str, str]] = []

    def walk(node, trail):
        if isinstance(node, dict):
            if "url" in node and isinstance(node["url"], str):
                name = node["url"].split("/")[-1].split("?")[0]
                out.append(("/".join(trail + [name]), node["url"]))
                # GLTF/texture sub-blobs (include[...] map of dependent files)
                for inc_url in (node.get("include") or {}):
                    nm = inc_url.split("/")[-1]
                    out.append(("/".join(trail + [nm]), node["include"][inc_url]["url"]
                                if isinstance(node["include"][inc_url], dict) else inc_url))
                return
            for k, v in node.items():
                walk(v, trail + [str(k)])

    # Prefer the requested resolution; if a category only has other res keys, take any.
    for category, resmap in files.items():
        if not isinstance(resmap, dict):
            continue
        chosen = resmap.get(res) or next(iter(resmap.values()), None)
        if chosen is None:
            continue
        if fmt and isinstance(chosen, dict) and fmt in chosen:
            walk({fmt: chosen[fmt]}, [category, res])
        else:
            walk(chosen, [category, res])
    return out


if __name__ == "__main__":
    main()
