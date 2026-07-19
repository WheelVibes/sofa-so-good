// Touch-target + layout-leak sweep. Injects a fixed overlay listing every
// visible interactive element under the ~44px min touch target, plus any
// horizontal-scroll leak and any element overflowing the viewport width.
// Screenshot the result and read it. Re-run per UI state.
;(() => {
  const MIN = 44
  const vw = window.innerWidth
  const vh = window.innerHeight
  document.getElementById('__tt_overlay')?.remove()

  const sel = [
    'button',
    'a[href]',
    '[role="button"]',
    '[role="option"]',
    '[role="tab"]',
    '[role="menuitem"]',
    'input',
    'select',
    'textarea',
    '[tabindex]:not([tabindex="-1"])',
    '.btn',
    '.icon-btn',
    '.seg',
    '.swatch',
  ].join(',')

  const seen = new Set()
  const small = []
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    // Only visible, on-screen, non-zero elements.
    if (r.width < 1 || r.height < 1) continue
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue
    if (parseFloat(cs.opacity) < 0.05) continue
    const key =
      el.tagName +
      ':' +
      Math.round(r.left) +
      ',' +
      Math.round(r.top) +
      ':' +
      Math.round(r.width) +
      'x' +
      Math.round(r.height)
    if (seen.has(key)) continue
    seen.add(key)
    // Account for an absolutely-positioned ::after/::before HIT-AREA expander
    // (the repo's `.m-sheet-head`/`.panel-head .icon-btn::after { inset: -9px }`
    // pattern). A negative inset grows the tappable area beyond the box rect.
    let padX = 0
    let padY = 0
    for (const pseudo of ['::after', '::before']) {
      const ps = getComputedStyle(el, pseudo)
      if (ps.content && ps.content !== 'none' && ps.position === 'absolute') {
        const t = parseFloat(ps.top)
        const b = parseFloat(ps.bottom)
        const l = parseFloat(ps.left)
        const ri = parseFloat(ps.right)
        // Negative offsets extend outward; take the max expander seen.
        if (t < 0) padY = Math.max(padY, -t)
        if (b < 0) padY = Math.max(padY, -b)
        if (l < 0) padX = Math.max(padX, -l)
        if (ri < 0) padX = Math.max(padX, -ri)
      }
    }
    const w = Math.round(r.width + 2 * padX)
    const h = Math.round(r.height + 2 * padY)
    if (w < MIN || h < MIN) {
      const label = (
        el.getAttribute('aria-label') ||
        el.title ||
        (el.textContent || '').trim().slice(0, 24) ||
        el.className ||
        el.tagName
      )
        .toString()
        .slice(0, 30)
      small.push({ label, w, h, cls: (el.className || '').toString().slice(0, 22) })
    }
  }
  small.sort((a, b) => a.w * a.h - b.w * b.h)

  const docW = document.documentElement.scrollWidth
  const bodyW = document.body.scrollWidth
  const hLeak = Math.max(docW, bodyW) - vw

  // Find elements wider than the viewport (overflow-x offenders), top 6.
  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width > vw + 2 && r.height > 4) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      wide.push({
        cls: (el.className || el.tagName).toString().slice(0, 34),
        w: Math.round(r.width),
      })
    }
  }
  const wideSeen = new Set()
  const wideUniq = wide
    .filter((x) => (wideSeen.has(x.cls) ? false : wideSeen.add(x.cls)))
    .slice(0, 6)

  const o = document.createElement('div')
  o.id = '__tt_overlay'
  o.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:rgba(10,12,18,0.96);color:#e8eef8;' +
    'font:12px/1.4 ui-monospace,monospace;padding:14px 16px;overflow:auto;'
  const rows = small
    .map(
      (s) =>
        `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #223">` +
        `<span style="color:${s.w < MIN && s.h < MIN ? '#ff7a7a' : '#ffd27a'}">${s.w}×${s.h}</span>` +
        `<span style="flex:1;color:#9fb3d0">${s.label.replace(/</g, '&lt;')}</span></div>`,
    )
    .join('')
  o.innerHTML =
    `<div style="font-weight:800;font-size:14px;margin-bottom:6px">Touch-target sweep · ${vw}×${vh}</div>` +
    `<div style="margin-bottom:8px;color:${hLeak > 1 ? '#ff7a7a' : '#7ae0a0'}">` +
    `horizontal leak: ${hLeak}px (doc ${docW} / vw ${vw})</div>` +
    (wideUniq.length
      ? `<div style="margin-bottom:8px;color:#ffd27a">over-wide: ${wideUniq
          .map((w) => `${w.cls}=${w.w}`)
          .join(' · ')}</div>`
      : '') +
    `<div style="font-weight:700;margin:8px 0 4px">${small.length} target(s) under ${MIN}px (red = both dims small):</div>` +
    (rows || '<div style="color:#7ae0a0">none — all targets ≥44px</div>')
  document.body.appendChild(o)
  return { small: small.length, hLeak }
})()
