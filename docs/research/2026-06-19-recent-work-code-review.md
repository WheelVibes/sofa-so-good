# Critical code review — recent photoreal / security / scraper work (2026-06-19)

Scope: the ~15 commits since the `MODEL_LIBRARIES` / research work, covering
RD-403 corner-AO, MAT-002 tile micro-detail, SEC-001 `safeUrl`, SEC-002 CSV
injection, and the Python scraper harness. Review hunts for *correctness/quality*
bugs that `tsc` + Biome + the unit suite would not catch (z-fighting, cache
collisions, security bypass, data corruption, leaks, wrong API endpoints).

Reviewer's verdict up front: **the security + materials work is solid.** No HIGH
issue was found — the two SEC tasks and the cache-key reasoning all hold up under
adversarial reading. The findings below are LOW/MED polish + a couple of
genuinely-reachable-but-low-impact scraper edge cases.

---

## Findings (ranked)

### REV-001 — MED — `src/ui/CreditsModal.tsx:82`
`<a href={e.sourceUrl} …>` renders a credit entry's `sourceUrl` straight into an
`href` with **no `safeUrl()`**, the lone href/src sink in the changed UI that skips
the SEC-001 sanitizer (every other sink — `SourceLine.tsx:13`, `IkeaBody.tsx:36`,
`IkeaBody.tsx:105`, the schema transform — applies it).

Why it's only MED, not HIGH: `CreditEntry.sourceUrl` comes from the bundled,
first-party `/assets/CREDITS.json` (`CreditsModal.tsx:26`), not from imported /
user / scraped data, so there is no *currently reachable* attacker path — a
`javascript:` URL there would require compromising the app's own origin/build.
But the project's own rule (`src/ui/CLAUDE.md`: "Any URL … MUST pass through
`safeUrl()` … the render sink is the defense-in-depth backstop") is explicit that
*every* sink is guarded, and CREDITS.json is regenerated from per-item license
metadata that originates with downloaded packs — so this is a real
defense-in-depth gap waiting on a future data-flow change.
Why tests missed it: there is no test asserting CreditsModal sanitizes its hrefs,
and the component is data-driven by a fetched JSON the suite never feeds hostile.
Fix: `const href = safeUrl(e.sourceUrl)`; render the `<a>` only when truthy, else
plain text (mirror `SourceLine.tsx`).

### REV-002 — LOW — `research/scrapers/poly_pizza_scraper.py:98-99` (and `run_loop` in `scraper_common.py:275`)
`key_fn` can return `""` for a malformed search result (no `ID`/`Download`/`Url`
field). `run_loop` keys the resume manifest on that value, so **all** empty-key
items collapse to a single manifest entry: after the first such item is marked
done, every later empty-key item is skipped by `manifest.has("")` (`scraper_common.py:276`)
— they are silently never downloaded, and a resume can't recover them.
Why tests missed it: the scrapers are Python and outside the JS/Vitest suite; no
Python tests exist for the harness at all.
Fix: in `run_loop`, treat a falsy/empty key as "always process, never persist"
(skip the `manifest.has`/`mark` path), or have `key_fn` raise so `run_loop`'s
per-item `except` logs and continues instead of de-duping on `""`.

### REV-003 — LOW — `research/scrapers/scraper_common.py:105-109` (`Manifest._flush`)
The manifest write is *visibility-atomic* (`tmp.replace(self.path)` is an atomic
rename on POSIX) but not *durability-atomic*: `tmp.write_text(...)` is never
`fsync`'d before the rename. The docstring claims it "survives Ctrl-C / crashes"
— it survives Ctrl-C and process crash (the rename is atomic), but a power-loss /
kernel panic between write and flush can leave a zero-length or truncated
`_manifest.json`, losing resume progress. The `Manifest.__init__` corrupt-ledger
guard (`scraper_common.py:90-96`) backs up and starts fresh, so it degrades to
"re-download everything" rather than crashing — hence LOW.
Why tests missed it: no Python tests; power-loss is not exercisable in CI anyway.
Fix: `os.fsync()` the tmp file's fd before `replace`, and optionally fsync the
parent dir, if true crash-durability is wanted; otherwise soften the docstring.

### REV-004 — LOW — `research/scrapers/scraper_common.py:184-191` (`download_file`)
A connection reset *mid-stream* (during `r.read()`, after `self.open()` has
already returned a 200) is not retried — the exception propagates and leaves an
orphaned `*.part` file behind. No data corruption results: resume checks
`dest.exists()` (`scraper_common.py:180`), not the `.part`, so the partial is
correctly ignored and re-fetched next run. The cost is wasted bandwidth + litter,
not a wrong file. The retry/backoff in `HttpClient.open` only covers the request,
not the body stream.
Why tests missed it: Python, no tests; requires a mid-body network failure.
Fix: wrap the read loop in the same retry/backoff, and `part.unlink(missing_ok=True)`
in a `finally`/`except` so failed attempts don't leave `.part` litter.

### REV-005 — LOW (uncertain) — `research/scrapers/polyhaven_scraper.py:42`
`http.get_json(f"{API}/assets?type={asset_type}")`. Poly Haven's public API
categories endpoint is historically documented as `GET /assets?t=<type>` (it also
tolerates `type=` in current deployments). If a future API tightening rejects the
`type=` alias this returns an error / empty map and the whole type yields nothing.
The *response* handling (treating the body as `{slug: meta}` and the `/files/{slug}`
shape in `_pick_urls`) is correct against `MODEL_LIBRARIES.html`, so this is the
only soft spot and it's an alias question, not a wrong path — flagged uncertain.
Fix: use `?t={asset_type}` (or send both) to match the canonical param.

### REV-006 — LOW — `src/scene/CornerAO.tsx:62`
The shared corner-AO gradient `CanvasTexture` is created without
`applyAnisotropy(tex)`, which `src/materials/CLAUDE.md` (RD-401) says to route
*every* CanvasTexture through. On the flat (Performance) tier the strip is viewed
at grazing floor angles where anisotropic filtering would slightly sharpen the
falloff. Impact is purely cosmetic and ContactShadow's shared texture appears to
skip it too, so this is a consistency nit, not a regression.
Why tests missed it: anisotropy is a render-quality property with no unit
assertion; only visual verification would surface it.
Fix: `applyAnisotropy(sharedTex)` in `cornerGradientTexture()` after construction.

---

## Reviewed + clean (no action needed)

- **SEC-002 CSV (`src/utils/csv.ts`, `furnitureCsv.ts`, `shoppingCsv.ts`,
  `export/boq.ts`).** Formula-lead set (`= + - @ \t \r`) is complete for the
  OWASP vector; the leading-double-quote smuggle case (`"=cmd`) is handled by
  inspecting `s[1]`; RFC-4180 quoting (comma/quote/CR/LF → wrap + double quotes,
  CRLF line join) is correct. `csvNumberField` is applied **only** to genuinely
  numeric, non-attacker columns (qty/rate/amount/lengthFt/dimensions in mm), so it
  cannot be a numeric-column injection bypass; legitimate negatives stay numeric.
  No corruption, no bypass found.

- **SEC-001 `safeUrl` (`src/utils/safeUrl.ts`) + schema (`state/schema.ts`).** The
  normalize step strips control chars (U+0000–U+0020, U+007F) and trims, then a
  strict `^[a-z][a-z0-9+.-]*:` scheme match + lowercase + allowlist
  (`http`/`https`/`mailto`) — defeats the `java\tscript:`, ` javascript:`,
  `JavaScript:`, newline-in-scheme, and `data:` vectors. Non-stripped exotic
  spacers (e.g. U+00A0 inside the scheme) break the scheme match → treated as
  relative, which the browser also won't execute as `javascript:`, so no bypass.
  Schema sanitizes at import via a Zod transform that drops only the bad field
  (back-compat: the rest of the record is preserved, import never rejected). Render
  sinks `SourceLine`, `IkeaBody` (both image `src` and document `href`) are guarded.
  (Only CreditsModal — REV-001 — is unguarded, and it's first-party data.)

- **MAT-002 tile (`procedural/tileSurface.ts`, `patterns/tile.ts`).** No cache
  collision: `TileSurfaceParams` is consumed *only* via the hardcoded
  `DEFAULT_TILE_SURFACE_PARAMS` constant — no per-def param escapes the
  `${id}@${size}` cache key, so two finishes cannot collide and no stale shared map
  results. `makeGlazePeel` returns a signed delta centred on 0 (`(peel-0.5)*2*amp`,
  amp ≤ 0.06), so the face-height mean is preserved as claimed and stays in 0..1
  (e.g. tile face `0.85 ± 0.06`). `glazeRoughness` blends glossy↔matte by `grout`
  and clamps to 0..1. Path-A (no flag, all tiers) is intentional per
  `src/materials/CLAUDE.md`. Sync + worker paths share the single `PATTERN_FN`
  dispatch (`generators.ts`), so worker output matches the fallback. checker/brick
  correctly left untouched (not ceramic).

- **RD-403 corner-AO gating (`cornerAoMath.ts`, `quality.ts`,
  `WallSegment.tsx`).** No double-darkening: `cornerAo` is true exactly when
  `postprocessing` is false (performance/medium) and false on high/maximum where
  SSAO runs — verified line-by-line in `quality.ts` (81/89, 99/106, 116/123,
  133/139). Strip math is sound: `cornerAoStripDims` places the quad from the wall
  face *outward into the room* (`zCenter = faceZ + sign*reach/2`), so it cannot
  poke through the wall into the adjacent room; reach is a short 0.32 m. No
  z-fighting: `y=0.004` + `depthWrite:false` + `polygonOffset(-1,-1)` + `renderOrder:1`,
  matching the ContactShadow pattern; opaque furniture/baseboards correctly occlude
  it via the depth test. Overdraw is one alpha quad per room-facing floor span.
  Custom plans: the strip mounts inside the wall's local frame in `WallSegment`, so
  it inherits any wall edit (position/rotation/thickness) for free, and uses the
  same abutment-extended `segLen`/`segMid` as the face plane so corners close
  consistently.

- **Shared `CanvasTexture` lifecycle (`CornerAO.tsx:5`).** Module-level singleton,
  never disposed — **intentional and correct**, identical to the established
  `ContactShadow.tsx` pattern (one texture for the app's lifetime, shared by every
  strip). Not a leak.

- **Scraper harness core (`scraper_common.py`).** Manifest visibility-atomicity
  (tmp + atomic rename), corrupt-ledger backup-and-continue, `.part`→rename for
  downloads, exponential backoff honouring `Retry-After` on 429/500/502/503/504,
  non-retry of other 4xx, polite RateLimiter with jitter, and the resumable
  `run_loop` skip-set are all correctly implemented (modulo REV-002/003/004 edge
  cases). `ambientcg_scraper.py` and `poly_pizza_scraper.py` use the correct
  documented endpoints/headers/field paths per `MODEL_LIBRARIES.html`
  (ambientCG `/api/v2/full_json?type=&include=downloadData`; Poly Pizza
  `api.poly.pizza/v1.1/search/{term}` + `x-auth-token` + `Download` field).
</content>
