#!/usr/bin/env python3
"""
objaverse_scraper.py — download Objaverse 1.0 / Objaverse-XL objects (GLB), filtered
by per-object Creative Commons license.

Source: https://objaverse.allenai.org/  ·  HF: https://huggingface.co/datasets/allenai/objaverse-xl
License: *** MIXED — per-object *** . The collection is released under ODC-By v1.0,
        but EACH object carries its OWN Creative Commons license recorded in the
        metadata (CC0 / CC-BY / CC-BY-SA / CC-BY-NC / CC-BY-NC-SA / CC-BY-ND ...).
        For commercial shipping you MUST filter to commercial-safe licenses
        (CC0, CC-BY) per object — this script does that via --licenses.
        Default allowlist = cc0,cc-by (commercial-safe). FLAG: anything outside
        the allowlist is research/dev-only.
Access method: the official `objaverse` Python package (loads uid->license/metadata
        maps and downloads GLBs from HuggingFace). Objaverse-XL adds GitHub/
        Thingiverse/etc. sources via the same package.

OPTIONAL dependency (guarded):
        pip install objaverse huggingface_hub
        If absent, the script prints a friendly message and exits — there is no
        stable public bulk URL scheme to fall back to (the package resolves and
        caches the sharded HF blobs for you).

LEGAL: ODC-By collection + per-object CC. Honour each object's license + required
       attribution. Use of this tool is the operator's responsibility.

RESUMABLE: one manifest item per object uid; re-run resumes. (The objaverse
       package also keeps its own download cache, so re-downloads are cheap.)
RATE-LIMITED: the objaverse package manages HF fetching; --rps here gates our own
       metadata/enumeration politeness.

Examples:
  # Commercial-safe (CC0 + CC-BY) objects from Objaverse 1.0, first 50:
  python3 objaverse_scraper.py --version 1.0 --licenses cc0,cc-by --limit 50

  # Everything CC0 only:
  python3 objaverse_scraper.py --licenses cc0

  # Objaverse-XL (10M+), CC-BY too — huge, use --limit:
  python3 objaverse_scraper.py --version xl --licenses cc0,cc-by --limit 200
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

from scraper_common import Manifest, _log, common_argparser, run_loop

# Canonical CC license tokens as Objaverse records them (normalised lower-case).
KNOWN_LICENSES = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa", "cc-by-nd", "cc-by-nc-nd"}
COMMERCIAL_SAFE = {"cc0", "cc-by"}


def _require_objaverse():
    try:
        import objaverse  # type: ignore
    except ImportError:
        _log(
            "This script needs the optional 'objaverse' package.\n"
            "  pip install objaverse huggingface_hub\n"
            "(Objaverse resolves + caches the sharded HuggingFace blobs for you; "
            "there is no stable plain-URL fallback.)"
        )
        sys.exit(1)
    return objaverse


def _normalise(lic) -> str:
    return str(lic or "").strip().lower().replace("_", "-")


def main() -> None:
    ap = common_argparser("objaverse", __doc__.strip().splitlines()[0])
    ap.add_argument("--version", choices=["1.0", "xl"], default="1.0", help="Objaverse 1.0 or XL")
    ap.add_argument(
        "--licenses",
        default="cc0,cc-by",
        help="comma list of allowed per-object licenses (commercial-safe default); 'all' to disable filtering",
    )
    ap.add_argument("--processes", type=int, default=1, help="parallel download processes for the objaverse loader")
    args = ap.parse_args()

    allow = (
        None
        if args.licenses.strip().lower() == "all"
        else {_normalise(x) for x in args.licenses.split(",") if x.strip()}
    )
    if allow is not None:
        unknown = allow - KNOWN_LICENSES
        if unknown:
            _log(f"  (note: unrecognised license token(s) {sorted(unknown)} — kept as-is)")
        if not allow & COMMERCIAL_SAFE:
            _log("  WARNING: no commercial-safe license in --licenses; output is research/dev-only.")

    objaverse = _require_objaverse()

    _log(f"== Objaverse {args.version}: enumerating uids + licenses ==")
    if args.version == "xl":
        import objaverse.xl as oxl  # type: ignore

        ann = oxl.get_annotations()  # pandas DataFrame: sha256/fileIdentifier/license/...
        records = []
        for _, row in ann.iterrows():
            lic = _normalise(row.get("license"))
            if allow is not None and lic not in allow:
                continue
            records.append({"uid": str(row.get("sha256") or row.get("fileIdentifier")), "license": lic, "_row": row})
        _log(f"  {len(records)} object(s) match license filter")

        def handle_xl(item: dict, manifest: Manifest) -> None:
            import pandas as pd  # type: ignore

            df = pd.DataFrame([item["_row"]])
            paths = oxl.download_objects(objects=df, processes=args.processes, download_dir=args.out)
            for _, src in (paths or {}).items():
                manifest.mark(item["uid"], license=item["license"], path=str(src))
            if not paths:
                manifest.mark(item["uid"], license=item["license"], path=None)
            _log(f"  ↓ {item['uid']} ({item['license']})")

        run_loop(records, out_dir=args.out, key_fn=lambda i: i["uid"], handle=handle_xl, limit=args.limit)
        return

    # Objaverse 1.0
    uid_to_license = objaverse.load_uids_with_license() if hasattr(objaverse, "load_uids_with_license") else None
    if uid_to_license is None:
        # Fallback: pull license out of the per-object annotations.
        all_uids = objaverse.load_uids()
        anns = objaverse.load_annotations(all_uids)
        uid_to_license = {u: _normalise(a.get("license")) for u, a in anns.items()}
    else:
        uid_to_license = {u: _normalise(l) for u, l in uid_to_license.items()}

    records = [
        {"uid": u, "license": lic}
        for u, lic in uid_to_license.items()
        if allow is None or lic in allow
    ]
    _log(f"  {len(records)} / {len(uid_to_license)} object(s) match license filter")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    def handle(item: dict, manifest: Manifest) -> None:
        uid = item["uid"]
        objs = objaverse.load_objects(uids=[uid], download_processes=args.processes)
        src = objs.get(uid)
        if src:
            dest = out_dir / f"{uid}.glb"
            if not dest.exists():
                shutil.copy2(src, dest)
            manifest.mark(uid, license=item["license"], path=str(dest))
        else:
            manifest.mark(uid, license=item["license"], path=None)
        _log(f"  ↓ {uid} ({item['license']})")

    run_loop(records, out_dir=args.out, key_fn=lambda i: i["uid"], handle=handle, limit=args.limit)


if __name__ == "__main__":
    main()
