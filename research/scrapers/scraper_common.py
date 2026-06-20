"""
scraper_common.py — shared utilities for the per-source asset scrapers.

Every `<source>_scraper.py` in this directory imports from this module so they all
share ONE implementation of the things that make a scraper safe + resumable:

  * RateLimiter   — polite, configurable requests/sec with jitter.
  * Backoff       — exponential backoff that honours HTTP 429 `Retry-After`.
  * Manifest      — a JSON ledger of completed items so a re-run RESUMES instead
                    of re-downloading (atomic writes; survives Ctrl-C / crashes).
  * http_get / download_file — stdlib-only (urllib) HTTP with retries, timeout,
                    a real User-Agent, and skip-if-already-downloaded.
  * common_argparser — uniform CLI: --out --limit --rps --resume --retries ...

Design goals (per the project brief):
  - RESUMABLE: interrupting and re-running continues where it stopped.
  - RATE-LIMITED: never hammer a host; defaults are conservative; tune via --rps.
  - DEPENDENCY-LIGHT: standard library only, so a script runs with plain `python3`.
    (A few source scripts note an OPTIONAL dependency — e.g. `requests`,
    `huggingface_hub`, `boto3` — when the source's official SDK is the sane path;
    those are clearly flagged in that script's header.)

LEGAL / ToS: scraping many of these sources is restricted by their Terms of
Service (see research/MODEL_LIBRARIES.html for the per-source license + the
"Programmatic access" notes). CC0/CC-BY API sources are fine to use within their
terms (mind attribution). Proprietary / retailer / marketplace sources are
DEV-ONLY references — respect robots.txt, rate limits, and each site's ToS, and
do not redistribute downloaded assets. These scripts are tools; using them is the
operator's responsibility.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator, Optional

DEFAULT_UA = (
    "sofa-so-good-asset-scraper/1.0 (+research; respectful crawler; "
    "contact: set CRAWLER_CONTACT env var)"
)


# --------------------------------------------------------------------------- #
# Rate limiting
# --------------------------------------------------------------------------- #
class RateLimiter:
    """Block so that calls happen at most `rps` times per second (with jitter)."""

    def __init__(self, rps: float = 1.0, jitter: float = 0.25):
        self.min_interval = 1.0 / rps if rps > 0 else 0.0
        self.jitter = max(0.0, jitter)
        self._last = 0.0

    def wait(self) -> None:
        if self.min_interval <= 0:
            return
        now = time.monotonic()
        elapsed = now - self._last
        sleep_for = self.min_interval - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for + random.uniform(0, self.jitter))
        self._last = time.monotonic()


# --------------------------------------------------------------------------- #
# Resumable manifest
# --------------------------------------------------------------------------- #
class Manifest:
    """A JSON ledger of completed item keys, written atomically after each item.

    A re-run loads it and skips anything already marked done — this is what makes
    every scraper resumable across interruptions.
    """

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self.done: dict[str, dict] = {}
        if self.path.exists():
            try:
                self.done = json.loads(self.path.read_text())
            except (json.JSONDecodeError, OSError):
                # Corrupt/partial ledger: keep a backup, start fresh rather than crash.
                try:
                    self.path.rename(self.path.with_suffix(self.path.suffix + ".bak"))
                except OSError:
                    pass
                self.done = {}

    def has(self, key: str) -> bool:
        # An empty/falsy key is never "done": keying on "" would collapse every
        # keyless item onto one entry and silently skip the rest on resume
        # (REV-002). Such items are always reprocessed instead.
        return bool(key) and key in self.done

    def mark(self, key: str, **meta) -> None:
        # Never persist an empty/falsy key — see `has` (REV-002).
        if not key:
            return
        self.done[key] = {"ts": int(time.time()), **meta}
        self._flush()

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        # fsync the tmp file before the atomic rename so a power-loss / kernel
        # panic between write and rename can't leave a truncated ledger and lose
        # resume progress (REV-003); the rename itself is atomic on POSIX.
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(json.dumps(self.done, indent=0))
            f.flush()
            os.fsync(f.fileno())
        tmp.replace(self.path)  # atomic on POSIX

    def __len__(self) -> int:
        return len(self.done)


# --------------------------------------------------------------------------- #
# HTTP with retries + backoff
# --------------------------------------------------------------------------- #
@dataclass
class HttpClient:
    rps: float = 1.0
    retries: int = 4
    timeout: float = 60.0
    user_agent: str = DEFAULT_UA
    headers: dict = field(default_factory=dict)
    limiter: RateLimiter = field(init=False)

    def __post_init__(self):
        self.limiter = RateLimiter(self.rps)

    def _req(self, url: str, *, data: bytes | None = None) -> urllib.request.Request:
        h = {"User-Agent": self.user_agent, "Accept": "*/*", **self.headers}
        return urllib.request.Request(url, data=data, headers=h)

    def open(self, url: str, *, data: bytes | None = None):
        """GET/POST with exponential backoff; honours Retry-After on 429/503."""
        attempt = 0
        while True:
            self.limiter.wait()
            try:
                return urllib.request.urlopen(self._req(url, data=data), timeout=self.timeout)
            except urllib.error.HTTPError as e:
                # 4xx (except 429) are not retryable.
                if e.code in (429, 500, 502, 503, 504) and attempt < self.retries:
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    delay = _retry_delay(attempt, retry_after)
                    _log(f"  HTTP {e.code} on {url} → backoff {delay:.1f}s "
                         f"(attempt {attempt + 1}/{self.retries})")
                    time.sleep(delay)
                    attempt += 1
                    continue
                raise
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < self.retries:
                    delay = _retry_delay(attempt, None)
                    _log(f"  net error {e} on {url} → backoff {delay:.1f}s "
                         f"(attempt {attempt + 1}/{self.retries})")
                    time.sleep(delay)
                    attempt += 1
                    continue
                raise

    def get_bytes(self, url: str) -> bytes:
        with self.open(url) as r:
            return r.read()

    def get_text(self, url: str, encoding: str = "utf-8") -> str:
        return self.get_bytes(url).decode(encoding, errors="replace")

    def get_json(self, url: str, *, data: bytes | None = None):
        with self.open(url, data=data) as r:
            return json.loads(r.read().decode("utf-8", errors="replace"))

    def download_file(self, url: str, dest: str | os.PathLike, *, skip_existing: bool = True) -> bool:
        """Stream a URL to `dest`. Returns True if downloaded, False if skipped.

        Writes to a `.part` file then renames, so a half-finished download is never
        mistaken for a complete one on resume.
        """
        dest = Path(dest)
        if skip_existing and dest.exists() and dest.stat().st_size > 0:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_suffix(dest.suffix + ".part")
        # `self.open` retries the request, but a connection reset *mid-stream*
        # (after a 200) would otherwise propagate and leave an orphaned `.part`
        # (REV-004). Retry the whole stream with backoff and always clean up the
        # partial so a failed attempt never litters or is mistaken for progress.
        attempt = 0
        while True:
            try:
                with self.open(url) as r, open(part, "wb") as f:
                    while True:
                        chunk = r.read(1 << 16)
                        if not chunk:
                            break
                        f.write(chunk)
                part.replace(dest)
                return True
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                part.unlink(missing_ok=True)
                if attempt < self.retries:
                    delay = _retry_delay(attempt, None)
                    _log(f"  stream error {e} on {url} → retry {delay:.1f}s "
                         f"(attempt {attempt + 1}/{self.retries})")
                    time.sleep(delay)
                    attempt += 1
                    continue
                raise


def _retry_delay(attempt: int, retry_after: Optional[str]) -> float:
    if retry_after:
        try:
            return float(retry_after)
        except ValueError:
            pass
    # 2,4,8,16s + jitter
    return (2 ** (attempt + 1)) + random.uniform(0, 1.0)


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------- #
# Tiny stdlib helpers (avoid bs4 dependency)
# --------------------------------------------------------------------------- #
import re as _re

_SITEMAP_LOC = _re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", _re.I)
_MODEL_VIEWER_SRC = _re.compile(r'<model-viewer[^>]*\ssrc=["\']([^"\']+\.glb[^"\']*)["\']', _re.I)
_MODEL_VIEWER_IOS = _re.compile(r'\sios-src=["\']([^"\']+\.usdz[^"\']*)["\']', _re.I)
_GLB_URL = _re.compile(r'https?://[^"\'\\\s]+\.glb\b[^"\'\\\s]*', _re.I)
_USDZ_URL = _re.compile(r'https?://[^"\'\\\s]+\.usdz\b[^"\'\\\s]*', _re.I)


def sitemap_locs(xml_text: str) -> list[str]:
    """Extract <loc> URLs from a sitemap or sitemap-index."""
    return _SITEMAP_LOC.findall(xml_text)


def find_model_urls(html: str) -> dict[str, list[str]]:
    """Best-effort extraction of GLB/USDZ asset URLs from a product page's HTML."""
    return {
        "glb": list(dict.fromkeys(_MODEL_VIEWER_SRC.findall(html) + _GLB_URL.findall(html))),
        "usdz": list(dict.fromkeys(_MODEL_VIEWER_IOS.findall(html) + _USDZ_URL.findall(html))),
    }


# --------------------------------------------------------------------------- #
# CLI scaffold
# --------------------------------------------------------------------------- #
def common_argparser(source: str, description: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog=f"{source}_scraper.py",
        description=description,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--out", default=f"./downloads/{source}", help="output directory")
    p.add_argument("--limit", type=int, default=0, help="max items this run (0 = no limit)")
    p.add_argument("--rps", type=float, default=1.0, help="requests per second (politeness)")
    p.add_argument("--retries", type=int, default=4, help="HTTP retry attempts with backoff")
    p.add_argument("--timeout", type=float, default=60.0, help="per-request timeout (s)")
    p.add_argument("--resume", action="store_true", default=True,
                   help="resume from the manifest (default on; --no-resume to force re-fetch)")
    p.add_argument("--no-resume", dest="resume", action="store_false")
    p.add_argument("--api-key", default=os.environ.get("API_KEY", ""),
                   help="API key/token if the source needs one (or set API_KEY env)")
    return p


def run_loop(
    items: Iterable[dict],
    *,
    out_dir: str,
    manifest_name: str = "_manifest.json",
    key_fn: Callable[[dict], str],
    handle: Callable[[dict, Manifest], None],
    limit: int = 0,
) -> None:
    """Drive a resumable download loop over `items`.

    `key_fn(item)` → stable unique key; `handle(item, manifest)` does the work and
    calls `manifest.mark(key, ...)` on success. Already-done keys are skipped.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    manifest = Manifest(out / manifest_name)
    done_at_start = len(manifest)
    processed = 0
    for item in items:
        key = key_fn(item)
        if manifest.has(key):
            continue
        try:
            handle(item, manifest)
        except KeyboardInterrupt:
            _log("\nInterrupted — progress saved to manifest; re-run to resume.")
            break
        except Exception as e:  # noqa: BLE001 — keep going; one bad item shouldn't kill the run
            _log(f"  ! failed {key}: {e}")
            continue
        processed += 1
        if limit and processed >= limit:
            _log(f"Hit --limit {limit}; stop (re-run to continue).")
            break
    _log(f"Done. {processed} new this run; {len(manifest)} total "
         f"(was {done_at_start}). Output: {out}")
