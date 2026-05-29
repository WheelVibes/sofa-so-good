// Measures average FPS under a populated scene (software WebGL, so absolute
// numbers are low — use for RELATIVE before/after comparisons).
import puppeteer from 'puppeteer';
const count = Number(process.argv[2] || 80);

const browser = await puppeteer.launch({
  headless: 'shell',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1400,900'],
});
const page = await browser.newPage();
await page.emulateTimezone('Asia/Singapore');
await page.setViewport({ width: 1400, height: 900 });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

const placed = await page.evaluate((n) => {
  const s = window.__store.getState();
  s.dismissLocationPrompt();
  s.setLocation({ lat: 1.3521, lon: 103.8198, label: 'SG' });
  s.setManualHour(13);
  const defs = ['armchair', 'dining-chair', 'coffee-table', 'potted-plant', 'floor-lamp',
    'nightstand', 'rug', 'flatscreen-tv', 'refrigerator', 'bed-queen', 'sofa-3seat',
    'bookshelf', 'wardrobe-3door', 'desk', 'ceiling-light'];
  for (let i = 0; i < n; i++) {
    const def = defs[i % defs.length];
    const x = 1 + (i % 11) * 1.05;
    const z = 1 + Math.floor(i / 11) * 1.0;
    s.addItem({ defId: def, position: [x, z], rotation: (i % 4) * Math.PI / 2, props: {} });
  }
  s.selectItem(null);
  s.setSelectedItemIds([]);
  return s.items.length;
}, count);

// Measure FPS for ~4s.
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  function loop(t) {
    frames++;
    if (t - start >= 4000) resolve(Math.round((frames * 1000) / (t - start)));
    else requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}));

// Memory (if exposed).
const mem = await page.evaluate(() => {
  const m = performance.memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
});

console.log(JSON.stringify({ placed, fps, heapMB: mem }));
await browser.close();
