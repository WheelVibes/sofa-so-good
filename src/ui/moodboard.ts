// Moodboard / style-board export (feature F19).
//
// Self-contained module: builds a shareable, print-ready HTML document composing a
// colour palette, finishes/materials strip, and furniture tiles grid. No app imports —
// all data arrives via `MoodboardInput`. The document carries its own inline <style>
// and is intended to be opened in a new window (like a report) and printed/shared.

/** A single colour-palette swatch. */
export type MoodboardColor = { hex: string; name?: string }

/** A finish/material entry; `swatch` is an optional CSS colour/gradient string. */
export type MoodboardMaterial = { name: string; swatch?: string }

/** A furniture tile. */
export type MoodboardItem = {
  name: string
  category?: string
  count?: number
  priceText?: string
}

/** Input for {@link buildMoodboardHtml}. All strings are treated as untrusted. */
export type MoodboardInput = {
  title: string
  subtitle?: string
  note?: string
  heroDataUrl?: string | null
  palette: MoodboardColor[]
  materials: MoodboardMaterial[]
  items: MoodboardItem[]
}

// --- escaping / validation -------------------------------------------------

/**
 * Full 5-character HTML escape, safe for BOTH text and attribute contexts.
 * Escapes & < > " ' so a value can never break out of an attribute or open a tag.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Accept hex (#abc … #aabbccdd) or a function-form colour (rgb/rgba/hsl/hsla).
const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/
const FUNC_RE = /^(rgb|hsl)a?\([0-9.,%\sa-zA-Z/]+\)$/

/**
 * Validate a colour string before placing it in a `style="background:..."` context.
 * Returns a normalised, safe colour, or `null` if it should be dropped.
 */
export function sanitizeColor(raw: string | undefined | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (HEX_RE.test(value)) return value.startsWith('#') ? value : `#${value}`
  if (FUNC_RE.test(value)) return value
  return null
}

// --- small section helpers -------------------------------------------------

function renderHero(heroDataUrl?: string | null): string {
  if (!heroDataUrl) return ''
  // Only allow data: image URLs as the hero source; anything else is dropped.
  if (!/^data:image\//i.test(heroDataUrl.trim())) return ''
  return `<div class="hero"><img src="${escapeHtml(heroDataUrl)}" alt="Moodboard hero" /></div>`
}

function renderPalette(palette: MoodboardColor[]): string {
  const chips = palette
    .map((c) => {
      const safe = sanitizeColor(c.hex)
      if (!safe) return ''
      const label = c.name ? escapeHtml(c.name) : escapeHtml(safe)
      return (
        `<figure class="chip">` +
        `<span class="chip-swatch" style="background:${escapeHtml(safe)}"></span>` +
        `<figcaption class="chip-label">${label}<small>${escapeHtml(safe)}</small></figcaption>` +
        `</figure>`
      )
    })
    .filter(Boolean)
  if (chips.length === 0) return ''
  return section('Colour palette', `<div class="grid chips">${chips.join('')}</div>`)
}

function renderMaterials(materials: MoodboardMaterial[]): string {
  const strip = materials
    .map((m) => {
      const safe = sanitizeColor(m.swatch)
      const swatch = safe
        ? `<span class="mat-swatch" style="background:${escapeHtml(safe)}"></span>`
        : `<span class="mat-swatch no-swatch"></span>`
      return `<figure class="mat">${swatch}<figcaption>${escapeHtml(m.name)}</figcaption></figure>`
    })
    .filter(Boolean)
  if (strip.length === 0) return ''
  return section('Finishes &amp; materials', `<div class="grid mats">${strip.join('')}</div>`)
}

function renderItems(items: MoodboardItem[]): string {
  const tiles = items
    .map((it) => {
      const parts: string[] = []
      parts.push(`<h3 class="tile-name">${escapeHtml(it.name)}</h3>`)
      if (it.category) {
        parts.push(`<span class="badge">${escapeHtml(it.category)}</span>`)
      }
      const meta: string[] = []
      if (typeof it.count === 'number' && Number.isFinite(it.count)) {
        meta.push(`<span class="count">x${escapeHtml(it.count)}</span>`)
      }
      if (it.priceText) {
        meta.push(`<span class="price">${escapeHtml(it.priceText)}</span>`)
      }
      if (meta.length) parts.push(`<div class="tile-meta">${meta.join('')}</div>`)
      return `<article class="tile">${parts.join('')}</article>`
    })
    .filter(Boolean)
  if (tiles.length === 0) return ''
  return section('Furniture', `<div class="grid tiles">${tiles.join('')}</div>`)
}

function section(heading: string, body: string): string {
  // `heading` is supplied by this module only (never user input) — already safe.
  return `<section class="board-section"><h2>${heading}</h2>${body}</section>`
}

// --- styles ----------------------------------------------------------------

const STYLES = `
  :root {
    --bg: #f7f6f3; --fg: #222; --muted: #6b6b6b; --card: #fff; --line: #e3e0da;
    --accent: #3a5a40; --radius: 12px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
      sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
    line-height: 1.45; padding: 24px;
  }
  .board { max-width: 1080px; margin: 0 auto; }
  header.board-head { margin-bottom: 24px; }
  header.board-head h1 { font-size: 28px; margin: 0 0 4px; }
  header.board-head .subtitle { color: var(--muted); font-size: 16px; margin: 0; }
  header.board-head .note { margin: 12px 0 0; font-size: 14px; white-space: pre-wrap; }
  .hero { margin: 0 0 24px; border-radius: var(--radius); overflow: hidden; }
  .hero img { display: block; width: 100%; height: auto; }
  .board-section { margin: 0 0 28px; }
  .board-section h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--muted); margin: 0 0 12px; border-bottom: 1px solid var(--line);
    padding-bottom: 6px;
  }
  .grid { display: grid; gap: 12px; }
  .chips { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .mats { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .tiles { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .chip { margin: 0; background: var(--card); border: 1px solid var(--line);
    border-radius: var(--radius); overflow: hidden; }
  .chip-swatch { display: block; height: 72px; width: 100%; }
  .chip-label { padding: 8px 10px; font-size: 13px; }
  .chip-label small { display: block; color: var(--muted); font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .mat { margin: 0; text-align: center; }
  .mat-swatch { display: block; height: 64px; width: 100%; border-radius: var(--radius);
    border: 1px solid var(--line); }
  .mat-swatch.no-swatch { background: repeating-linear-gradient(45deg,
    #eee, #eee 6px, #f7f6f3 6px, #f7f6f3 12px); }
  .mat figcaption { font-size: 13px; margin-top: 6px; }
  .tile { background: var(--card); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column;
    gap: 8px; }
  .tile-name { font-size: 15px; margin: 0; }
  .badge { align-self: flex-start; background: var(--accent); color: #fff;
    border-radius: 999px; padding: 2px 10px; font-size: 11px; text-transform: uppercase;
    letter-spacing: .04em; }
  .tile-meta { display: flex; gap: 10px; color: var(--muted); font-size: 13px;
    margin-top: auto; }
  .price { font-weight: 600; color: var(--fg); }
  @media (max-width: 480px) { body { padding: 14px; }
    header.board-head h1 { font-size: 22px; } }
  @media print {
    body { background: #fff; padding: 0; }
    .chip, .tile { break-inside: avoid; }
    .board-section { break-inside: avoid-page; }
  }
`

// --- document --------------------------------------------------------------

/**
 * Build a complete, self-contained HTML document for a shareable moodboard.
 * Every user-controlled string is escaped (text + attribute safe); colours are
 * validated before entering a style. Empty sections are omitted.
 */
export function buildMoodboardHtml(input: MoodboardInput): string {
  const title = escapeHtml(input.title || 'Moodboard')
  const subtitle = input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ''
  const note = input.note ? `<p class="note">${escapeHtml(input.note)}</p>` : ''

  const sections = [
    renderHero(input.heroDataUrl),
    renderPalette(input.palette ?? []),
    renderMaterials(input.materials ?? []),
    renderItems(input.items ?? []),
  ]
    .filter(Boolean)
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="board">
<header class="board-head">
<h1>${title}</h1>
${subtitle}
${note}
</header>
${sections}
</main>
</body>
</html>`
}
