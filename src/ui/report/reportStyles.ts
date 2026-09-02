/** Print stylesheet for the design report window (its own CSS, not the app's
 *  design tokens — the report opens in a blank new window / PDF). */
export const REPORT_CSS = `
  * { box-sizing: border-box; }
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #6b7280; margin-bottom: 18px; }
  .hero { width: 100%; max-height: 360px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
  .cols { display: flex; gap: 28px; align-items: flex-start; }
  .col { flex: 1; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; }
  /* Zero horizontal td padding collides adjacent cells in 3–4 column tables
     (renovation estimate read "66.2 m²$60/m²" as one string — UIUX-57):
     separate every cell from its left neighbour, and keep a numeric value on
     one line so "179.5 m²" can't wrap mid-value. */
  td + td { padding-left: 12px; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; color: #374151; white-space: nowrap; }
  td.dim { color: #9ca3af; font-variant-numeric: tabular-nums; font-size: 12px; padding-left: 12px; }
  .msw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,.12); }
  /* Contractor-grade finish schedule (G4) — shared with the drawing set's Finishes sheet. */
  .mcode { display: inline-block; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; color: #4b5563; background: #f3f4f6; border-radius: 3px; padding: 0 4px; margin-right: 4px; }
  .mnum, .mnum-td { font-variant-numeric: tabular-nums; color: #374151; font-size: 11px; }
  .mnum-td { text-align: right; }
  .mnote { font-size: 10px; color: #b45309; margin-top: 1px; }
  .mchip { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,.12); }
  .fin-h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 14px 0 4px; }
  .fin-wrap { margin-top: 24px; break-inside: avoid; }
  .fin-sched td, .fin-accent td, .fin-totals td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .fin-sched tr.h td, .fin-accent tr.h td, .fin-totals tr.h td { font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  .fin-caveat { font-size: 11px; color: #9ca3af; margin-top: 6px; }
  tr.cat td { font-weight: 600; padding-top: 8px; }
  td.indent { padding-left: 12px; color: #4b5563; }
  .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 15px; border-top: 2px solid #1f2937; margin-top: 8px; padding-top: 6px; }
  .subtotal { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 3px; }
  .note { background: #f9fafb; border-left: 3px solid #d1d5db; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; color: #374151; white-space: pre-wrap; }
  .room-cost { margin-top: 24px; max-width: 360px; }
  /* The 360px above is sized for the narrow room-and-price tables this class
     was written for. A section whose last column carries a sentence needs the page:
     at 360px the layout critique's Measured column wrapped to six lines while
     three-quarters of the sheet sat empty. Opt-in, so the cost tables keep the
     column width that suits them. */
  .room-cost.prose { max-width: 720px; }
  /* Only for a table whose LAST column carries the sentence. Kept separate from
     .prose because the floor build-up section is also 720px wide but ends in a
     short number, and the min-width flung its two numeric columns apart. */
  .room-cost.prose-last td:last-child { min-width: 320px; }
  .plan-wrap { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #fff; }
  .palette { margin-top: 24px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
  .chip { display: flex; align-items: center; gap: 7px; border: 1px solid #e5e7eb; border-radius: 999px; padding: 4px 10px 4px 4px; }
  .chip .sw { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); flex: none; }
  .chip .cn { font-size: 12px; color: #374151; }
  .plan-svg { width: 100%; height: auto; max-height: 280px; display: block; }
  .plan-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 11px; color: #6b7280; }
  .lg-item { display: inline-flex; align-items: center; gap: 5px; }
  .lg-sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; opacity: 0.7; }
  .ok { color: #047857; font-weight: 600; margin-top: 6px; }
  .warn { color: #b45309; font-weight: 600; margin-top: 6px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .ds-head { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; }
  .ds-grade { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; color: #fff; font-weight: 700; flex: none; }
  .ds-num { font-size: 20px; font-weight: 700; }
  .ds-den { font-size: 12px; color: #9ca3af; font-weight: 400; }
  .ds-meta { font-size: 11px; color: #9ca3af; margin-left: auto; }
  .ds-cat { margin-top: 8px; break-inside: avoid; }
  .ds-cat-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #374151; }
  .ds-cat-score { font-variant-numeric: tabular-nums; }
  .score-bar { height: 5px; background: #eef2f7; border-radius: 3px; overflow: hidden; margin: 3px 0; }
  .score-fill { height: 100%; }
  .ds-issue { font-size: 11px; margin-top: 2px; }
  .foot { margin-top: 24px; color: #9ca3af; font-size: 11px; }
  /* Keep sections + tables whole across PDF pages, and never strand a heading. */
  .room-cost, .palette, .plan-wrap, .note { break-inside: avoid; }
  .elev-section { margin-top: 24px; }
  .elev-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
  .elev-fig { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; background: #fff; break-inside: avoid; }
  .elev-fig figcaption { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .elev-fig svg { width: 100%; height: auto; display: block; max-height: 220px; }
  table.ffe { font-size: 11px; }
  table.ffe td { padding: 3px 8px 3px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  table.ffe tr.cat td { font-weight: 600; border-bottom: 1px solid #e5e7eb; }
  tr, .chip, .lg-item, .total { break-inside: avoid; }
  h2 { break-after: avoid; }
  @media print {
    body { padding: 0; }
    .hero { max-height: 300px; break-inside: avoid; }
    .cols { gap: 20px; }
  }
`
