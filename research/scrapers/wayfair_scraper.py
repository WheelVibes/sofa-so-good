#!/usr/bin/env python3
"""
wayfair_scraper.py — download Wayfair 3D models via the official 3D Model API (DEV-ONLY).

Source: https://www.wayfair.com  ·  API: https://www.aboutwayfair.com/tech-innovation/wayfairs-3d-model-api
License: PROPRIETARY (Wayfair-owned). The 3D Model API grants access for VISUALIZATION;
         redistribution / bundling is restricted. DEV-ONLY reference — DO NOT redistribute
         downloaded assets (same dev-gating as the IKEA scrape).
Access method: official REST 3D Model API returning glTF/GLB (Wayfair's forward format;
         OBJ is retired). The demo endpoint serves a public sample set with NO key; the
         registered endpoint (a real partner API key) unlocks ~200 models on registration
         and the broader catalogue. This is the CLEAN path — a real API, not HTML scraping.
LEGAL / ToS: visualization-only license; developer reference. Keep --rps LOW (default 0.5).
         Using this is the operator's responsibility.

This is the single best-documented retailer source (CONFIRMED API). The exact JSON shape
of the registered endpoint is partner-specific; this script handles the common cases
(a list, or {"models"/"data"/"results": [...]}) and pulls each entry's glTF/GLB URL from
the usual fields (glb_url / gltf_url / model_url / url / files[].url). Adjust --models-key
/ --url-key if your partner contract returns a different schema.

RESUMABLE per model id (JSON manifest). RATE-LIMITED (--rps, retry+backoff). Stdlib only.

Examples:
  python3 wayfair_scraper.py --limit 50                         # demo endpoint, no key
  python3 wayfair_scraper.py --api-key $WAYFAIR_KEY \
      --endpoint https://api.wayfair.com/v1/3dapi/models --limit 200
"""
from __future__ import annotations

from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

DEMO_ENDPOINT = "https://api.wayfair.com/v1/3dapi/models_demo"

# Fields that commonly hold the model list / per-item download URL across API variants.
_LIST_KEYS = ("models", "data", "results", "items")
_URL_KEYS = ("glb_url", "gltf_url", "model_url", "modelUrl", "url", "download_url")
_ID_KEYS = ("sku", "id", "model_id", "modelId", "product_id", "name")


def main() -> None:
    ap = common_argparser("wayfair", __doc__.strip().splitlines()[0])
    # common_argparser already adds --rps (default 1.0); lower it for a proprietary host.
    for action in ap._actions:
        if action.dest == "rps":
            action.default = 0.5
            action.help = "requests/sec (LOW; proprietary host)"
    ap.add_argument("--endpoint", default=DEMO_ENDPOINT,
                    help="3D Model API endpoint (default: keyless demo set)")
    ap.add_argument("--models-key", default="",
                    help="JSON key holding the model array (auto-detected if blank)")
    ap.add_argument("--url-key", default="",
                    help="JSON key holding each model's glTF/GLB URL (auto-detected if blank)")
    args = ap.parse_args()

    headers = {}
    if args.api_key:
        # Wayfair partner auth is typically a bearer token / API key header.
        headers["Authorization"] = f"Bearer {args.api_key}"
        headers["X-Api-Key"] = args.api_key
    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout, headers=headers)

    _log(f"== Wayfair 3D Model API: {args.endpoint} (key={'yes' if args.api_key else 'no/demo'}) ==")
    payload = http.get_json(args.endpoint)
    models = _extract_list(payload, args.models_key)
    if not models:
        _log("  ! no models found in API response — check --endpoint / --models-key / your key.")
        return
    items = [{"model": m} for m in models]

    def handle(item: dict, manifest: Manifest) -> None:
        m = item["model"]
        mid = _first(m, _ID_KEYS) or str(abs(hash(repr(m))))
        url = _model_url(m, args.url_key)
        if not url:
            _log(f"  - {mid}: no glTF/GLB URL field; skipping")
            manifest.mark(str(mid), skipped="no-url")
            return
        ext = "glb" if ".glb" in url.lower() else "gltf"
        dest = Path(args.out) / f"{_safe(mid)}.{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {mid} -> {dest.name}")
        manifest.mark(str(mid), url=url)

    run_loop(items, out_dir=args.out, key_fn=lambda i: str(_first(i["model"], _ID_KEYS) or repr(i)),
             handle=handle, limit=args.limit)


def _extract_list(payload, models_key: str):
    if models_key:
        return payload.get(models_key, []) if isinstance(payload, dict) else []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in _LIST_KEYS:
            v = payload.get(k)
            if isinstance(v, list):
                return v
        # Single-object response → wrap it.
        if any(k in payload for k in _URL_KEYS):
            return [payload]
    return []


def _model_url(m: dict, url_key: str):
    if not isinstance(m, dict):
        return None
    if url_key:
        return m.get(url_key)
    for k in _URL_KEYS:
        v = m.get(k)
        if isinstance(v, str) and (".glb" in v.lower() or ".gltf" in v.lower() or v.startswith("http")):
            return v
    files = m.get("files") or m.get("assets")
    if isinstance(files, list):
        for f in files:
            if isinstance(f, dict):
                u = _first(f, _URL_KEYS)
                if u:
                    return u
    return None


def _first(d: dict, keys):
    if not isinstance(d, dict):
        return None
    for k in keys:
        if k in d and d[k]:
            return d[k]
    return None


def _safe(v) -> str:
    import re
    return re.sub(r"[^A-Za-z0-9._-]", "-", str(v))[:120] or "model"


if __name__ == "__main__":
    main()
