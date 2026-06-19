#!/usr/bin/env python3
"""
tripo_scraper.py — generate a 3D model from a prompt via the Tripo3D API, download the GLB.

Source: https://www.tripo3d.ai/api  ·  devs: https://platform.tripo3d.ai (developers.tripo3d.ai)
        ·  base: https://api.tripo3d.ai
License (GENERATED ASSETS): hosted-API generations carry COMMERCIAL rights on PAID plans.
        (Open weights split separately: TripoSR is MIT; newer TripoSG/TripoSF use VAST's
        own open-source terms — verify per-model before commercial bundling. This script
        uses the HOSTED API.) The app ships generated assets to end users, so prefer a paid
        key for clean commercial rights.
Access method: REST API (Bearer key), async — POST a text/image-to-3D task, POLL it by id
        to success, then download the result model (GLB) from the task output.
LEGAL / ToS: per Tripo terms (above). Using this is the operator's responsibility; the
        output's license depends on YOUR Tripo plan.

A "programmatically downloadable generated asset" path, not a scrape. NOTE: endpoint paths
follow Tripo's public developer docs (/v2/openapi/task); confirm the current API version
for your key.

RESUMABLE per task key (prompt hash + mode). RATE-LIMITED (--rps governs poll cadence;
generation is async). Stdlib only.

Examples:
  python3 tripo_scraper.py --api-key $TRIPO_KEY --prompt "a rattan accent armchair"
  python3 tripo_scraper.py --api-key $TRIPO_KEY --mode image --image-token <uploaded-token>
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

API = "https://api.tripo3d.ai"


def main() -> None:
    ap = common_argparser("tripo", __doc__.strip().splitlines()[0])
    ap.add_argument("--prompt", default="", help="text prompt (text-to-3D)")
    ap.add_argument("--mode", choices=["text", "image"], default="text")
    ap.add_argument("--image-token", default="",
                    help="image file_token from Tripo's upload step (image-to-3D)")
    ap.add_argument("--model-version", default="", help="optional Tripo model version override")
    ap.add_argument("--poll-secs", type=float, default=10.0, help="seconds between status polls")
    ap.add_argument("--max-wait", type=float, default=900.0, help="give up after this many seconds")
    ap.add_argument("--api-base", default=API)
    args = ap.parse_args()

    if not args.api_key:
        _log("  ! Tripo needs --api-key (or API_KEY env). Aborting.")
        return
    if args.mode == "text" and not args.prompt:
        _log("  ! text mode needs --prompt. Aborting.")
        return
    if args.mode == "image" and not args.image_token:
        _log("  ! image mode needs --image-token (upload the image first). Aborting.")
        return

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout,
                      headers={"Authorization": f"Bearer {args.api_key}",
                               "Content-Type": "application/json"})

    seed = (args.prompt or args.image_token) + f"|{args.mode}|{args.model_version}"
    key = hashlib.sha1(seed.encode()).hexdigest()[:16]
    items = [{"key": key}]
    task_endpoint = f"{args.api_base}/v2/openapi/task"

    def handle(item: dict, manifest: Manifest) -> None:
        if args.mode == "text":
            body = {"type": "text_to_model", "prompt": args.prompt}
        else:
            body = {"type": "image_to_model",
                    "file": {"type": "png", "file_token": args.image_token}}
        if args.model_version:
            body["model_version"] = args.model_version
        task_id = _create_task(http, task_endpoint, body)
        if not task_id:
            _log("  ! task creation failed (check key/quota/endpoint). Aborting item.")
            return
        _log(f"  task {task_id} submitted; polling…")
        task = _poll(http, task_endpoint, task_id, args.poll_secs, args.max_wait)
        if not task:
            _log(f"  ! task {task_id} did not succeed within {args.max_wait}s.")
            manifest.mark(item["key"], task=task_id, status="timeout-or-failed")
            return
        url = _model_url(task)
        if not url:
            _log(f"  ! task {task_id} succeeded but no model url found.")
            manifest.mark(item["key"], task=task_id, status="no-model")
            return
        ext = "glb" if ".glb" in url.lower() else "model"
        dest = Path(args.out) / f"{item['key']}.{ext}"
        got = http.download_file(url, dest)
        _log(f"  {'down' if got else 'skip'} {dest.name}")
        manifest.mark(item["key"], task=task_id, url=url)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["key"], handle=handle, limit=args.limit)


def _create_task(http: HttpClient, endpoint: str, body: dict):
    try:
        res = http.get_json(endpoint, data=json.dumps(body).encode())
    except Exception as e:  # noqa: BLE001
        _log(f"  ! create error: {e}")
        return None
    # Tripo wraps responses: {"code":0,"data":{"task_id":"..."}}
    if isinstance(res, dict):
        data = res.get("data") if isinstance(res.get("data"), dict) else res
        return data.get("task_id") or data.get("id")
    return None


def _poll(http: HttpClient, endpoint: str, task_id: str, poll_secs: float, max_wait: float):
    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        try:
            res = http.get_json(f"{endpoint}/{task_id}")
        except Exception as e:  # noqa: BLE001
            _log(f"  poll error: {e}")
            time.sleep(poll_secs)
            continue
        data = res.get("data") if isinstance(res, dict) and isinstance(res.get("data"), dict) else res
        status = (data.get("status") or "").lower() if isinstance(data, dict) else ""
        if status in ("success", "succeeded", "completed"):
            return data
        if status in ("failed", "cancelled", "canceled", "expired", "unknown", "banned"):
            _log(f"  task status={status}")
            return None
        prog = data.get("progress") if isinstance(data, dict) else None
        _log(f"  …status={status or '?'} progress={prog}")
        time.sleep(poll_secs)
    return None


def _model_url(task: dict):
    if not isinstance(task, dict):
        return None
    out = task.get("output") or task.get("result") or {}
    if isinstance(out, dict):
        for k in ("pbr_model", "model", "base_model", "glb", "rendered_model"):
            v = out.get(k)
            if isinstance(v, str) and v.startswith("http"):
                return v
            if isinstance(v, dict):
                u = v.get("url")
                if isinstance(u, str):
                    return u
    return None


if __name__ == "__main__":
    main()
