// Async pinch repro: fires each two-finger move as its own awaited step (with a
// paint wait + sample between), so React actually re-renders between moves and we
// can observe per-frame zoom (width) + scroll — exposing intra-gesture flicker
// that a synchronous eval-loop hides (all setZoom calls batch into one render).
const steps = [
  { name: 'store-ready', waitFor: { storeExists: true }, timeout: 60000 },
  {
    name: 'dismiss',
    eval: "(() => { const s=window.__store.getState(); localStorage.setItem('hdb_onboarded','1'); s.endTour?.(); s.setOnboardingOpen?.(false); s.dismissLocationPrompt?.(); })()",
  },
  { name: 'pro', store: { action: 'setUiMode', args: ['pro'] } },
  { name: 'reresolve', eval: 'window.__store.getState().reresolveFeatureFlags()' },
  { name: 'mobile-viewport', viewport: { width: 390, height: 844 } },
  { name: 'open', store: { action: 'setFloorPlanEditing', args: [true] } },
  { name: 'screen', waitFor: { css: '.plan-screen svg.plan-paper' }, timeout: 30000 },
  { name: 'settle', wait: 800 },
  {
    name: 'setup',
    eval: "(() => { const svg = document.querySelector('svg.plan-paper'); const canvas = document.querySelector('.plan-canvas'); const cr = canvas.getBoundingClientRect(); window.__pz = { cx: cr.left + cr.width/2, cy: cr.top + cr.height/2 }; window.__pzSamples = []; window.__fire = (type, id, x, y, btns) => svg.dispatchEvent(new PointerEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y, button:0, buttons:btns, pointerId:id, pointerType:'touch' })); window.__sample = (tag) => { const w = Math.round(parseFloat(svg.style.width)||0); window.__pzSamples.push({ tag, w, sl: Math.round(canvas.scrollLeft) }); }; return 'ready'; })()",
  },
  {
    name: 'down',
    eval: "(() => { const { cx, cy } = window.__pz; window.__fire('pointerdown', 11, cx-40, cy, 1); window.__fire('pointerdown', 12, cx+40, cy, 1); window.__sample('down'); return 'down'; })()",
  },
  { name: 'down-settle', wait: 80 },
]

// Spread out from 40 to 200 (zoom in), then back to 40 (zoom out). Each move is
// its own step + paint wait + sample.
const spreads = []
for (let s = 48; s <= 200; s += 16) spreads.push(s)
for (let s = 200 - 16; s >= 48; s -= 16) spreads.push(s)

spreads.forEach((s, i) => {
  steps.push({
    name: `mv-${i}`,
    eval: `(() => { const { cx, cy } = window.__pz; window.__fire('pointermove', 11, cx-${s}, cy, 1); window.__fire('pointermove', 12, cx+${s}, cy, 1); return ${s}; })()`,
  })
  steps.push({ name: `w-${i}`, wait: 60 })
  steps.push({ name: `s-${i}`, eval: `window.__sample('m${i}')` })
})

steps.push({
  name: 'up',
  eval: "(() => { const { cx, cy } = window.__pz; window.__fire('pointerup', 11, cx-48, cy, 0); window.__fire('pointerup', 12, cx+48, cy, 0); window.__sample('up'); return 'up'; })()",
})
steps.push({ name: 'settle-end', wait: 200 })
steps.push({
  name: 'report',
  eval: "(() => { const s = window.__pzSamples; const ws = s.map(x=>x.w); const sls = s.map(x=>x.sl); let wRev=0, sRev=0; for (let i=2;i<ws.length;i++){ const d1=ws[i-1]-ws[i-2], d2=ws[i]-ws[i-1]; if (d1!==0&&d2!==0&&Math.sign(d1)!==Math.sign(d2)) wRev++; const e1=sls[i-1]-sls[i-2], e2=sls[i]-sls[i-1]; if (e1!==0&&e2!==0&&Math.sign(e1)!==Math.sign(e2)) sRev++; } window.__pzResult = { wRev, sRev, samples: s.length }; console.log('PINCH_WIDTHS ' + ws.join(',')); console.log('PINCH_SCROLL ' + sls.join(',')); console.log('PINCH_WIDTH_REVERSALS ' + wRev); console.log('PINCH_SCROLL_REVERSALS ' + sRev); return window.__pzResult; })()",
})
// A smooth pinch (one move per frame) rises then falls monotonically — exactly
// ONE direction reversal at the zoom-in→zoom-out turnaround. More than a small
// slack (>2) means the zoom/scroll oscillated frame-to-frame = the flicker.
steps.push({
  name: 'assert-no-flicker',
  waitFor: {
    store: 'window.__pzResult && window.__pzResult.wRev <= 2 && window.__pzResult.sRev <= 2',
  },
  timeout: 3000,
  failMessage: 'BUG: pinch zoom oscillated (width/scroll reversed direction mid-gesture) — flicker',
})

export default { name: 'plan-pinch-zoom', url: 'http://localhost:5173/', steps }
