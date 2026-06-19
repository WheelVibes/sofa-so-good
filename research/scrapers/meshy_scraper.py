#!/usr/bin/env python3
"""
meshy_scraper.py — generate a 3D model from a prompt via the Meshy AI API, download the GLB.

Source: https://www.meshy.ai  ·  API docs: https://docs.meshy.ai  ·  base: https://api.meshy.ai
License (GENERATED ASSETS): PAID plans — you OWN the generated asset, full commercial
         rights to distribute/sell, no attribution. FREE plan — generated assets are
         CC BY 4.0 (commercial use REQUIRES crediting Meshy). This matters because the app
         ships generated assets to end users: prefer a paid key for commercial bundling.
Access method: REST API (Bearer key), async — POST a text/image-to-3D task, POLL it to
         SUCCEEDED, then download the result GLB from the task's model_urls.
LEGAL / ToS: per Meshy terms (above). Using this is the operator's responsibility; the
         output's license depends on YOUR Meshy plan.

This is a "programmatically downloadable generated asset" path, not a scrape: each run
submits ONE generation and downloads its GLB. NOTE: endpoint paths follow Meshy's public
docs (v2 text-to-3d preview→refine); confirm the current API version for your key.

RESUMABLE per task id (JSON manifest keyed by the prompt hash + mode). RATE-LIMITED
(--rps governs polling cadence; generation itself is async). Stdlib only.

Examples:
  python3 meshy_scraper.py --api-key $MESHY_KEY --prompt "a scandinavian fabric 3-seat sofa"
  python3 meshy_scraper.py --api-key $MESHY_KEY --mode image --image-url https://.../chair.png
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from scraper_common import HttpClient, Manifest, _log, common_argparser, run_loop

API = "https://api.meshy.ai"


def main() -> None:
    ap = common_argparser("meshy", __doc__.strip().splitlines()[0])
    ap.add_argument("--prompt", default="", help="text prompt (text-to-3D)")
    ap.add_argument("--mode", choices=["text", "image"], default="text",
                    help="generation mode")
    ap.add_argument("--image-url", default="", help="source image URL (image-to-3D)")
    ap.add_argument("--art-style", default="realistic",
                    help="Meshy art style hint (e.g. realistic/sculpture)")
    ap.add_argument("--poll-secs", type=float, default=10.0,
                    help="seconds between task status polls")
    ap.add_argument("--max-wait", type=float, default=900.0,
                    help="give up if a task isn't done within this many seconds")
    ap.add_argument("--api-base", default=API)
    args = ap.parse_args()

    if not args.api_key:
        _log("  ! Meshy needs --api-key (or API_KEY env). Aborting.")
        return
    if args.mode == "text" and not args.prompt:
        _log("  ! text mode needs --prompt. Aborting.")
        return
    if args.mode == "image" and not args.image_url:
        _log("  ! image mode needs --image-url. Aborting.")
        return

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout,
                      headers={"Authorization": f"Bearer {args.api_key}",
                               "Content-Type": "application/json"})

    seed = (args.prompt or args.image_url) + f"|{args.mode}|{args.art_style}"
    key = hashlib.sha1(seed.encode()).hexdigest()[:16]
    items = [{"key": key}]

    def handle(item: dict, manifest: Manifest) -> None:
        if args.mode == "text":
            endpoint = f"{args.api_base}/v2/text-to-3d"
            body = {"mode": "preview", "prompt": args.prompt, "art_style": args.art_style}
        else:
            endpoint = f"{args.api_base}/v1/image-to-3d"
            body = {"image_url": args.image_url}
        task_id = _create_task(http, endpoint, body)
        if not task_id:
            _log("  ! task creation failed (check key/quota/endpoint). Aborting item.")
            return
        _log(f"  task {task_id} submitted; polling…")
        task = _poll(http, endpoint, task_id, args.poll_secs, args.max_wait)
        if not task:
            _log(f"  ! task {task_id} did not succeed within {args.max_wait}s.")
            manifest.mark(item["key"], task=task_id, status="timeout-or-failed")
            return
        glb = _glb_url(task)
        if not glb:
            _log(f"  ! task {task_id} succeeded but no GLB url found.")
            manifest.mark(item["key"], task=task_id, status="no-glb")
            return
        dest = Path(args.out) / f"{item['key']}.glb"
        got = http.download_file(glb, dest)
        _log(f"  {'down' if got else 'skip'} {dest.name}")
        manifest.mark(item["key"], task=task_id, url=glb)

    run_loop(items, out_dir=args.out, key_fn=lambda i: i["key"], handle=handle, limit=args.limit)


def _create_task(http: HttpClient, endpoint: str, body: dict):
    try:
        res = http.get_json(endpoint, data=json.dumps(body).encode())
    except Exception as e:  # noqa: BLE001
        _log(f"  ! create error: {e}")
        return None
    # Meshy returns {"result": "<task-id>"} (or the id directly).
    if isinstance(res, dict):
        return res.get("result") or res.get("id") or res.get("task_id")
    return res if isinstance(res, str) else None


def _poll(http: HttpClient, endpoint: str, task_id: str, poll_secs: float, max_wait: float):
    deadline = time.monotonic() + max_wait
    while time.monotonic() < deadline:
        try:
            task = http.get_json(f"{endpoint}/{task_id}")
        except Exception as e:  # noqa: BLE001
            _log(f"  poll error: {e}")
            time.sleep(poll_secs)
            continue
        status = (task.get("status") or "").upper() if isinstance(task, dict) else ""
        if status in ("SUCCEEDED", "SUCCESS", "COMPLETED"):
            return task
        if status in ("FAILED", "EXPIRED", "CANCELED"):
            _log(f"  task status={status}")
            return None
        prog = task.get("progress") if isinstance(task, dict) else None
        _log(f"  …status={status or '?'} progress={prog}")
        time.sleep(poll_secs)
    return None


def _glb_url(task: dict):
    if not isinstance(task, dict):
        return None
    mu = task.get("model_urls") or task.get("model_url") or task.get("models")
    if isinstance(mu, dict):
        return mu.get("glb") or next((v for v in mu.values() if isinstance(v, str) and ".glb" in v.lower()), None)
    if isinstance(mu, str):
        return mu
    return None


if __name__ == "__main__":
    main()
