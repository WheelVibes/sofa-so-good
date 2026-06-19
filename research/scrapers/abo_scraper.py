#!/usr/bin/env python3
"""
abo_scraper.py — download Amazon Berkeley Objects (ABO) dataset archives.

Source: https://amazon-berkeley-objects.s3.amazonaws.com/index.html
        AWS Open Data registry: https://registry.opendata.aws/amazon-berkeley-objects/
License: CC BY-NC 4.0 — *** NON-COMMERCIAL ONLY ***. The 3D models, images and
        metadata may be used for research/evaluation but MUST NOT be shipped in a
        commercial product. FLAG: research/dev-only.
Access method: open, unauthenticated S3 bucket — no form, no key. The bucket is
        listed via the S3 ListObjectsV2 REST API and individual archives are large
        tar/zip files served straight over HTTPS.
3D format: `abo-3dmodels.tar` contains glTF 2.0 (.glb) models — Three.js-native.

LEGAL: CC BY-NC 4.0. Non-commercial use only; attribution required. Respect the
       AWS Open Data terms. Using this tool is the operator's responsibility.

OPTIONAL dependency: boto3 is NOT required. This script uses the public S3 REST
       API over stdlib urllib. If you prefer the AWS SDK you may install
       `pip install boto3` and use `--use-boto3` (guarded — falls back with a
       friendly message if boto3 is absent).

RESUMABLE: each archive is one manifest item; `download_file` writes a `.part`
       file then renames, so an interrupted multi-GB download resumes cleanly.
RATE-LIMITED: --rps with retry/backoff (these files are HUGE — keep rps low).

Examples:
  # List what is in the bucket (no download):
  python3 abo_scraper.py --list

  # Download just the 3D models tar + the listings metadata (default set):
  python3 abo_scraper.py

  # Download specific archives:
  python3 abo_scraper.py --archives abo-3dmodels.tar abo-listings.tar

  # Everything (VERY large — ~1TB):
  python3 abo_scraper.py --archives all
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

BUCKET = "https://amazon-berkeley-objects.s3.amazonaws.com"
PREFIX = "archives/"

# Sensible default: the web-ready 3D models + the (small) product metadata.
DEFAULT_ARCHIVES = ["abo-3dmodels.tar", "abo-listings.tar"]

_S3_KEY = re.compile(r"<Key>([^<]+)</Key>")
_S3_SIZE = re.compile(r"<Size>(\d+)</Size>")
_S3_NEXT = re.compile(r"<NextContinuationToken>([^<]+)</NextContinuationToken>")


def list_archives(http: HttpClient) -> list[dict]:
    """List objects under archives/ via the S3 ListObjectsV2 REST API (paginated)."""
    objects: list[dict] = []
    token = ""
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={PREFIX}"
        if token:
            from urllib.parse import quote

            url += f"&continuation-token={quote(token)}"
        xml = http.get_text(url)
        keys = _S3_KEY.findall(xml)
        sizes = _S3_SIZE.findall(xml)
        for k, s in zip(keys, sizes):
            if k.endswith("/"):
                continue  # skip the prefix "directory" marker
            objects.append({"key": k, "name": k[len(PREFIX):], "size": int(s)})
        m = _S3_NEXT.search(xml)
        if not m:
            break
        token = m.group(1)
    return objects


def main() -> None:
    ap = common_argparser("abo", __doc__.strip().splitlines()[0])
    ap.add_argument("--list", action="store_true", help="list bucket archives and exit (no download)")
    ap.add_argument(
        "--archives",
        nargs="+",
        default=DEFAULT_ARCHIVES,
        help="archive filenames to fetch (e.g. abo-3dmodels.tar), or 'all'",
    )
    ap.add_argument("--use-boto3", action="store_true", help="use the boto3 SDK if installed (optional)")
    args = ap.parse_args()

    if args.use_boto3:
        try:
            import boto3  # noqa: F401
        except ImportError:
            _log(
                "boto3 not installed. Either `pip install boto3` or drop --use-boto3 "
                "(the stdlib S3 REST path works fine and is the default)."
            )
            sys.exit(1)

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    available = list_archives(http)
    by_name = {o["name"]: o for o in available}

    if args.list:
        _log(f"== ABO bucket: {len(available)} archive(s) under {PREFIX} ==")
        for o in available:
            _log(f"  {o['name']:<32} {o['size'] / 1e9:8.2f} GB")
        return

    if args.archives == ["all"]:
        wanted = list(by_name.keys())
    else:
        wanted = list(args.archives)

    items: list[dict] = []
    for name in wanted:
        meta = by_name.get(name)
        if not meta:
            _log(f"  ! unknown archive '{name}' (run --list to see options); skipping")
            continue
        items.append(meta)

    def handle(item: dict, manifest: Manifest) -> None:
        name = item["name"]
        url = f"{BUCKET}/{item['key']}"
        dest = Path(args.out) / name
        _log(f"  ↓ {name} ({item['size'] / 1e9:.2f} GB) — this can take a while…")
        got = http.download_file(url, dest)
        manifest.mark(name, bytes=item["size"], downloaded=got)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["name"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
