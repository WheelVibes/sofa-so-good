#!/usr/bin/env python3
"""
omniobject3d_scraper.py — enumerate + download OmniObject3D files from HuggingFace.

Source: https://omniobject3d.github.io/
        HF: https://huggingface.co/datasets/OmniObject3D/OmniObject3D-New
License: *** NON-COMMERCIAL research (CC BY-NC style) *** — FLAG: research/dev-only;
        verify the current terms before any commercial use.
Access method: HuggingFace dataset repo. The file tree is enumerated via the HF
        API and each file is fetched from the `resolve` endpoint. The repo may be
        gated (accept terms on HF first); pass a token if so.

HF shapes used:
  tree:     https://huggingface.co/api/datasets/<repo>?full=true  (-> siblings[].rfilename)
  resolve:  https://huggingface.co/datasets/<repo>/resolve/<rev>/<rfilename>

Provide a token (if the repo is gated) via --api-key or HF_TOKEN /
HUGGING_FACE_HUB_TOKEN.

OPTIONAL dependency (guarded): none required — stdlib HTTP. If you prefer the
        official client, `pip install huggingface_hub` and use snapshot_download;
        not needed here. (--use-hf-hub will use it if installed, else a friendly
        message.)

LEGAL: OmniObject3D research license (CC BY-NC). Non-commercial; attribution.
       Operator's responsibility.

RESUMABLE: one manifest item per file; `.part`-then-rename. RATE-LIMITED: --rps.

Examples:
  python3 omniobject3d_scraper.py --list
  python3 omniobject3d_scraper.py --include .glb --limit 20
  python3 omniobject3d_scraper.py --repo OmniObject3D/OmniObject3D-New --api-key hf_xxx
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

HF = "https://huggingface.co"
DEFAULT_REPO = "OmniObject3D/OmniObject3D-New"


def _token(args) -> str:
    return args.api_key or os.environ.get("HF_TOKEN", "") or os.environ.get("HUGGING_FACE_HUB_TOKEN", "")


def list_files(http: HttpClient, repo: str) -> list[str]:
    info = http.get_json(f"{HF}/api/datasets/{repo}?full=true")
    sibs = info.get("siblings", []) if isinstance(info, dict) else []
    return [s["rfilename"] for s in sibs if isinstance(s, dict) and "rfilename" in s]


def main() -> None:
    ap = common_argparser("omniobject3d", __doc__.strip().splitlines()[0])
    ap.add_argument("--repo", default=DEFAULT_REPO, help="HuggingFace dataset repo")
    ap.add_argument("--revision", default="main", help="git revision/branch")
    ap.add_argument("--list", action="store_true", help="list files and exit")
    ap.add_argument("--include", nargs="*", default=[], help="only files whose name contains one of these substrings")
    ap.add_argument("--use-hf-hub", action="store_true", help="use huggingface_hub if installed (optional)")
    args = ap.parse_args()

    if args.use_hf_hub:
        try:
            import huggingface_hub  # noqa: F401
        except ImportError:
            _log("huggingface_hub not installed. `pip install huggingface_hub` or drop --use-hf-hub.")
            sys.exit(1)

    token = _token(args)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout, headers=headers)

    files = list_files(http, args.repo)
    if args.include:
        files = [f for f in files if any(s in f for s in args.include)]

    if args.list:
        _log(f"== {args.repo}: {len(files)} file(s) ==")
        for f in files:
            _log(f"  {f}")
        return

    items = [{"rfilename": f} for f in files]
    _log(f"== OmniObject3D {args.repo}: {len(items)} file(s) queued ==")
    if not token:
        _log("  (no HF token supplied — fine if the repo is public; pass --api-key / HF_TOKEN if gated)")

    def handle(item: dict, manifest: Manifest) -> None:
        rf = item["rfilename"]
        url = f"{HF}/datasets/{args.repo}/resolve/{args.revision}/{rf}"
        dest = Path(args.out) / rf
        got = http.download_file(url, dest)
        _log(f"  {'↓' if got else '·'} {rf}")
        manifest.mark(rf, downloaded=got)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["rfilename"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
