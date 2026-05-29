// Screenshot harness for the HDB sandbox. Software-WebGL via SwiftShader.
// Usage: node scripts/shot.mjs <outPath> [waitMs] [evalScriptFile] [actionsJson]
// actionsJson: JSON array of {type:'drag',from:[x,y],to:[x,y]} | {type:'wheel',x,y,dy} | {type:'click',x,y} | {type:'key',key} | {type:'wait',ms}
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const out = process.argv[2] || '/tmp/shot.png';
const waitMs = Number(process.argv[3] || 6000);
const evalFile = process.argv[4];
const actionsArg = process.argv[5];

const browser = await puppeteer.launch({
  headless: 'shell',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1600,1000',
  ],
});
const page = await browser.newPage();
await page.emulateTimezone('Asia/Singapore');
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, waitMs));

if (evalFile && evalFile !== '-') {
  await page.evaluate(fs.readFileSync(evalFile, 'utf8'));
  await new Promise((r) => setTimeout(r, 1500));
}

if (actionsArg) {
  const actions = JSON.parse(actionsArg);
  for (const a of actions) {
    if (a.type === 'drag') {
      await page.mouse.move(a.from[0], a.from[1]);
      await page.mouse.down();
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          a.from[0] + ((a.to[0] - a.from[0]) * i) / steps,
          a.from[1] + ((a.to[1] - a.from[1]) * i) / steps,
        );
        await new Promise((r) => setTimeout(r, 8));
      }
      await page.mouse.up();
    } else if (a.type === 'rdrag') {
      await page.mouse.move(a.from[0], a.from[1]);
      await page.mouse.down({ button: 'right' });
      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          a.from[0] + ((a.to[0] - a.from[0]) * i) / steps,
          a.from[1] + ((a.to[1] - a.from[1]) * i) / steps,
        );
        await new Promise((r) => setTimeout(r, 8));
      }
      await page.mouse.up({ button: 'right' });
    } else if (a.type === 'wheel') {
      await page.mouse.move(a.x, a.y);
      await page.mouse.wheel({ deltaY: a.dy });
    } else if (a.type === 'click') {
      await page.mouse.click(a.x, a.y);
    } else if (a.type === 'key') {
      await page.keyboard.press(a.key);
    } else if (a.type === 'type') {
      await page.mouse.click(a.x, a.y);
      await page.keyboard.type(a.text, { delay: 20 });
    } else if (a.type === 'wait') {
      await new Promise((r) => setTimeout(r, a.ms));
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 800));
}

await page.screenshot({ path: out });
console.log('SHOT_SAVED', out);
const fps = await page.evaluate(() => window.__lastFps ?? null);
if (fps != null) console.log('FPS', fps);
console.log('---CONSOLE---');
console.log(logs.slice(-30).join('\n'));
await browser.close();
