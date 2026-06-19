#!/usr/bin/env python3
"""
shapenet_scraper.py — download ShapeNetCore / ShapeNetSem archives from the gated
HuggingFace mirror.

Source: https://shapenet.org/  ·  HF mirror: https://huggingface.co/datasets/ShapeNet/ShapeNetCore
License: *** NON-COMMERCIAL research/education ONLY *** (ShapeNet Terms;
        registration + admin approval). FLAG: research/dev-only — do NOT ship.
Access method: GATED. You must (1) register at shapenet.org, (2) accept the
        dataset terms on the HuggingFace mirror with the SAME account, then
        (3) supply a HuggingFace access token. The token is sent as a Bearer
        header to download the archives; this script does NOT bypass the gate.

Provide the token via --api-key or the HF_TOKEN / HUGGING_FACE_HUB_TOKEN env var.

HF resolve URL shape:
  https://huggingface.co/datasets/<repo>/resolve/main/<archive>
We list the repo file tree via the HF API:
  https://huggingface.co/api/datasets/<repo>?full=true   (-> siblings[].rfilename)

LEGAL: ShapeNet Terms — non-commercial research/education only; registration +
       approval required. This tool only automates the download for an ALREADY
       APPROVED account. Operator's responsibility to comply.

RESUMABLE: one manifest item per archive file; `.part`-then-rename per file.
RATE-LIMITED: --rps with retry/backoff.

OPTIONAL dependency: none required (stdlib HTTP with a Bearer token). You may
       instead use `pip install huggingface_hub` and its `snapshot_download` —
       not needed here.

Examples:
  export HF_TOKEN=hf_xxx
  python3 shapenet_scraper.py --repo ShapeNet/ShapeNetCore --list
  python3 shapenet_scraper.py --repo ShapeNet/ShapeNetCore
  python3 shapenet_scraper.py --repo ShapeNet/ShapeNetSem --api-key hf_xxx
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

HF = "https://huggingface.co"


def _token(args) -> str:
    return (
        args.api_key
        or os.environ.get("HF_TOKEN", "")
        or os.environ.get("HUGGING_FACE_HUB_TOKEN", "")
    )


def list_files(http: HttpClient, repo: str) -> list[str]:
    info = http.get_json(f"{HF}/api/datasets/{repo}?full=true")
    sibs = info.get("siblings", []) if isinstance(info, dict) else []
    return [s["rfilename"] for s in sibs if isinstance(s, dict) and "rfilename" in s]


def main() -> None:
    ap = common_argparser("shapenet", __doc__.strip().splitlines()[0])
    ap.add_argument("--repo", default="ShapeNet/ShapeNetCore", help="HF dataset repo (ShapeNetCore / ShapeNetSem)")
    ap.add_argument("--revision", default="main", help="git revision/branch on the HF mirror")
    ap.add_argument("--list", action="store_true", help="list files in the repo and exit")
    ap.add_argument("--include", nargs="*", default=[], help="only files whose name contains one of these substrings")
    args = ap.parse_args()

    token = _token(args)
    if not token:
        _log(
            "ShapeNet is GATED. Register at shapenet.org, accept the terms on the HF\n"
            "mirror with the same account, then provide a token via --api-key or\n"
            "HF_TOKEN / HUGGING_FACE_HUB_TOKEN. (This script does not bypass the gate.)"
        )
        sys.exit(1)

    http = HttpClient(
        rps=args.rps,
        retries=args.retries,
        timeout=args.timeout,
        headers={"Authorization": f"Bearer {token}"},
    )

    files = list_files(http, args.repo)
    if args.include:
        files = [f for f in files if any(s in f for s in args.include)]

    if args.list:
        _log(f"== {args.repo}: {len(files)} file(s) ==")
        for f in files:
            _log(f"  {f}")
        return

    items = [{"rfilename": f} for f in files]
    _log(f"== ShapeNet {args.repo}: {len(items)} file(s) queued ==")

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
