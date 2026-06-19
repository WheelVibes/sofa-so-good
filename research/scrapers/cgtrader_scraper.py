#!/usr/bin/env python3
"""
cgtrader_scraper.py — search + download CGTrader models via the official OAuth REST API.

Source: https://www.cgtrader.com  ·  API: https://api.cgtrader.com  ·  devs: https://www.cgtrader.com/developers
License: PER-ITEM. CGTrader Royalty-Free (default; no resale) or Editorial (non-commercial),
         some per-product exclusive; ~150k free models but NOT CC0 by default — read each
         item's license before any commercial use or bundling.
Access method: official OAuth2 REST API (api.cgtrader.com), partner key by application
         (client id/secret → access token). Search models, then download authorised files.
LEGAL / ToS §19.2: BANS mass scraping of free models AND ML-training use. The API is the
         ONLY sanctioned path — this script uses it; respect rate limits and §19.2. Do not
         bulk-harvest the free section. Using this is the operator's responsibility.

AUTH: pass --api-key as "client_id:client_secret" (or set API_KEY=client_id:client_secret).
      The script does a client_credentials token exchange against the OAuth token endpoint.
      The exact field names are partner-account specific; override the endpoints/keys via
      flags if your contract differs. NOTE: schema is best-effort from CGTrader's public
      developer docs; verify against your partner credentials before a real run.

RESUMABLE per model id (JSON manifest). RATE-LIMITED (--rps, retry+backoff). Stdlib only.

Examples:
  python3 cgtrader_scraper.py --api-key $CID:$CSECRET --query "sofa" --limit 25
  python3 cgtrader_scraper.py --api-key $CID:$CSECRET --query "dining chair" --file-format glb
"""
from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

API = "https://api.cgtrader.com"
TOKEN_URL = "https://www.cgtrader.com/oauth/token"  # client_credentials grant


def main() -> None:
    ap = common_argparser("cgtrader", __doc__.strip().splitlines()[0])
    ap.add_argument("--query", default="furniture", help="search keywords")
    ap.add_argument("--file-format", default="glb",
                    help="preferred download file format (glb/gltf/fbx/obj)")
    ap.add_argument("--pages", type=int, default=1, help="search result pages to walk")
    ap.add_argument("--token-url", default=TOKEN_URL, help="OAuth2 token endpoint")
    ap.add_argument("--api-base", default=API, help="API base URL")
    ap.add_argument("--free-only", action="store_true",
                    help="restrict to free models (still subject to ToS §19.2 — no mass scraping)")
    args = ap.parse_args()

    if not args.api_key or ":" not in args.api_key:
        _log("  ! CGTrader needs OAuth credentials: --api-key client_id:client_secret "
             "(or API_KEY env). The API is the only ToS-sanctioned path. Aborting.")
        return
    client_id, client_secret = args.api_key.split(":", 1)

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)
    token = _oauth_token(http, args.token_url, client_id, client_secret)
    if not token:
        _log("  ! OAuth token exchange failed — verify credentials / token URL. Aborting.")
        return
    http.headers["Authorization"] = f"Bearer {token}"
    http.headers["Accept"] = "application/json"

    _log(f"== CGTrader API: search '{args.query}' (pages={args.pages}) ==")
    items = []
    for page in range(1, max(1, args.pages) + 1):
        q = urllib.parse.urlencode({"keywords": args.query, "page": page,
                                    **({"price": "free"} if args.free_only else {})})
        try:
            res = http.get_json(f"{args.api_base}/v1/models?{q}")
        except Exception as e:  # noqa: BLE001
            _log(f"  ! search page {page} failed: {e}")
            break
        batch = res.get("data") or res.get("models") or (res if isinstance(res, list) else [])
        if not batch:
            break
        items.extend({"model": m} for m in batch)

    def handle(item: dict, manifest: Manifest) -> None:
        m = item["model"]
        mid = str(m.get("id") or m.get("slug") or m.get("title") or abs(hash(repr(m))))
        # Resolve a downloadable file URL for the chosen format via the model's files endpoint.
        files = m.get("files")
        if not files:
            detail = http.get_json(f"{args.api_base}/v1/models/{mid}")
            files = (detail.get("data") or detail).get("files", [])
        url = _pick_file(files, args.file_format)
        if not url:
            _log(f"  - {mid}: no '{args.file_format}' file (license/ToS may bar it); skipping")
            manifest.mark(mid, skipped="no-file")
            return
        ext = args.file_format.lower().lstrip(".")
        dest = Path(args.out) / f"{_safe(mid)}.{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {mid} -> {dest.name}")
        manifest.mark(mid, url=url, license=m.get("license"))

    run_loop(items, out_dir=args.out,
             key_fn=lambda i: str(i["model"].get("id") or i["model"].get("slug") or repr(i)),
             handle=handle, limit=args.limit)


def _oauth_token(http: HttpClient, token_url: str, client_id: str, client_secret: str):
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode()
    try:
        with http.open(token_url, data=body) as r:
            data = json.loads(r.read().decode("utf-8", errors="replace"))
        return data.get("access_token")
    except Exception as e:  # noqa: BLE001
        _log(f"  ! token exchange error: {e}")
        return None


def _pick_file(files, fmt: str):
    fmt = fmt.lower().lstrip(".")
    if not isinstance(files, list):
        return None
    # Prefer an exact format match, then any url.
    for f in files:
        if not isinstance(f, dict):
            continue
        name = (f.get("format") or f.get("extension") or f.get("filename") or "").lower()
        url = f.get("download_url") or f.get("url")
        if url and fmt in name:
            return url
    for f in files:
        if isinstance(f, dict):
            url = f.get("download_url") or f.get("url")
            if url:
                return url
    return None


def _safe(v) -> str:
    import re
    return re.sub(r"[^A-Za-z0-9._-]", "-", str(v))[:120] or "model"


if __name__ == "__main__":
    main()
