"""
_retailer.py — shared sitemap-crawl → product-page → extract → download helper.

Most retailer 3D/AR scrapers in this directory follow ONE pattern:

  1. fetch the site's sitemap.xml (often a sitemap-INDEX of child sitemaps),
  2. walk it (recursively) to a flat list of product-page URLs,
  3. fetch each product page and run `find_model_urls(html)` (from scraper_common)
     to pull the <model-viewer src> GLB + ios-src USDZ asset URLs,
  4. download those GLB/USDZ files, resumably + rate-limited.

Each `<retailer>_scraper.py` is a thin entry point that calls `crawl_retailer(...)`
with that retailer's base URL + sitemap URL + an optional product-URL filter. This
file holds the ONE implementation so the per-retailer scripts stay tiny and we don't
duplicate the crawl/extract/download logic seven times.

LEGAL / ToS — RETAILER SOURCES ARE PROPRIETARY, DEV-ONLY REFERENCE ONLY.
Respect each site's robots.txt + Terms of Service, keep --rps LOW (these default to
0.5 rps), and DO NOT redistribute downloaded assets. Same dev-gating as the existing
IKEA scrape: a developer reference for building/validating the pipeline, not a
production data source. Using these scripts is the operator's responsibility.

Stdlib only (imports scraper_common, itself stdlib-only).
"""
from __future__ import annotations

import re
import urllib.parse
import urllib.robotparser
from pathlib import Path
from typing import Callable, Iterator, Optional

from scraper_common import (
    HttpClient,
    Manifest,
    _log,
    common_argparser,
    find_model_urls,
    run_loop,
    sitemap_locs,
)

# A LOW default rps for proprietary retailer hosts — be a polite guest.
RETAILER_DEFAULT_RPS = 0.5

_PRODUCT_SITEMAP_HINT = re.compile(r"product|/p/|/pdp|item|catalog", re.I)


def retailer_argparser(source: str, description: str):
    """common_argparser with retailer-specific defaults (low rps) + crawl knobs."""
    ap = common_argparser(source, description)
    # Override the politeness default to a conservative crawl rate for retailers.
    for action in ap._actions:
        if action.dest == "rps":
            action.default = RETAILER_DEFAULT_RPS
            action.help = "requests per second (LOW for proprietary retailers)"
    ap.add_argument(
        "--sitemap",
        default="",
        help="override the sitemap.xml URL (default: <base>/sitemap.xml)",
    )
    ap.add_argument(
        "--url-filter",
        default="",
        help="only crawl product URLs whose path matches this regex (case-insensitive)",
    )
    ap.add_argument(
        "--max-sitemaps",
        type=int,
        default=0,
        help="cap how many child sitemaps to walk in an index (0 = all)",
    )
    ap.add_argument(
        "--ignore-robots",
        action="store_true",
        help="do NOT consult robots.txt (default: honour it; refuse disallowed paths)",
    )
    return ap


def _robots_for(http: HttpClient, base: str) -> Optional[urllib.robotparser.RobotFileParser]:
    """Best-effort fetch + parse of robots.txt. None if it can't be read."""
    robots_url = urllib.parse.urljoin(base, "/robots.txt")
    try:
        text = http.get_text(robots_url)
    except Exception as e:  # noqa: BLE001
        _log(f"  (robots.txt unreadable at {robots_url}: {e}; proceeding cautiously)")
        return None
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(text.splitlines())
    return rp


def walk_sitemap(
    http: HttpClient,
    sitemap_url: str,
    *,
    url_filter: Optional[re.Pattern] = None,
    max_sitemaps: int = 0,
    _depth: int = 0,
) -> Iterator[str]:
    """Yield product-page URLs from a sitemap or (recursively) a sitemap-index.

    A <loc> ending in .xml / .xml.gz (or under /sitemap) is treated as a child
    sitemap and recursed into; everything else is yielded as a page URL.
    """
    if _depth > 4:
        return
    try:
        xml = http.get_text(sitemap_url)
    except Exception as e:  # noqa: BLE001
        _log(f"  ! sitemap fetch failed {sitemap_url}: {e}")
        return
    locs = sitemap_locs(xml)
    if not locs:
        return

    children = [u for u in locs if _looks_like_sitemap(u)]
    pages = [u for u in locs if not _looks_like_sitemap(u)]

    if children:
        if max_sitemaps:
            children = children[:max_sitemaps]
        # Prefer child sitemaps that look product-related, but keep the rest too.
        children.sort(key=lambda u: 0 if _PRODUCT_SITEMAP_HINT.search(u) else 1)
        for child in children:
            yield from walk_sitemap(
                http, child, url_filter=url_filter,
                max_sitemaps=max_sitemaps, _depth=_depth + 1,
            )

    for page in pages:
        if url_filter and not url_filter.search(page):
            continue
        yield page


def _looks_like_sitemap(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return path.endswith(".xml") or path.endswith(".xml.gz") or "sitemap" in path


def crawl_retailer(
    *,
    source: str,
    base_url: str,
    args,
    default_sitemap: str = "",
    page_filter: str = "",
    extract: Callable[[str], dict] = find_model_urls,
) -> None:
    """Drive a resumable retailer crawl: sitemap → page → extract → download.

    `args` is the parsed `retailer_argparser` namespace. `page_filter` is a default
    URL regex for this retailer (overridden by --url-filter). `extract(html)` returns
    {"glb": [...], "usdz": [...]} — defaults to find_model_urls.
    """
    sitemap_url = args.sitemap or default_sitemap or urllib.parse.urljoin(base_url, "/sitemap.xml")
    filt_src = args.url_filter or page_filter
    url_filter = re.compile(filt_src, re.I) if filt_src else None

    http = HttpClient(rps=args.rps, retries=args.retries, timeout=args.timeout)

    robots = None if args.ignore_robots else _robots_for(http, base_url)
    if robots is not None and not robots.can_fetch(http.user_agent, sitemap_url):
        _log(f"  ! robots.txt disallows {sitemap_url}; pass --ignore-robots to override. Aborting.")
        return

    _log(f"== {source}: crawling sitemap {sitemap_url} (rps={args.rps}) ==")

    def page_urls() -> Iterator[dict]:
        for url in walk_sitemap(
            http, sitemap_url, url_filter=url_filter, max_sitemaps=args.max_sitemaps
        ):
            if robots is not None and not robots.can_fetch(http.user_agent, url):
                continue
            yield {"url": url}

    def handle(item: dict, manifest: Manifest) -> None:
        url = item["url"]
        html = http.get_text(url)
        found = extract(html)
        glb, usdz = found.get("glb", []), found.get("usdz", [])
        if not glb and not usdz:
            manifest.mark(url, models=0)  # remember "no model here" so resume skips it
            return
        slug = _slug_for(url)
        n = 0
        for kind, urls in (("glb", glb), ("usdz", usdz)):
            for asset_url in urls:
                asset_url = urllib.parse.urljoin(url, asset_url)
                name = _filename_for(asset_url, slug, kind)
                dest = Path(args.out) / slug / name
                got = http.download_file(asset_url, dest)
                n += 1 if got else 0
                _log(f"  {'down' if got else 'skip'} {slug}/{name}")
        manifest.mark(url, models=len(glb) + len(usdz), downloaded=n)

    run_loop(page_urls(), out_dir=args.out, key_fn=lambda i: i["url"],
             handle=handle, limit=args.limit)


def _slug_for(url: str) -> str:
    path = urllib.parse.urlparse(url).path.strip("/")
    seg = path.split("/")[-1] if path else "item"
    seg = re.sub(r"[^A-Za-z0-9._-]", "-", seg) or "item"
    return seg[:120]


def _filename_for(asset_url: str, slug: str, kind: str) -> str:
    name = urllib.parse.urlparse(asset_url).path.split("/")[-1].split("?")[0]
    if not name or "." not in name:
        name = f"{slug}.{'glb' if kind == 'glb' else 'usdz'}"
    return re.sub(r"[^A-Za-z0-9._-]", "-", name)
