// INTERACTION-SWEEP — turn recorded clips into per-frame metrics, flagged events,
// a contact sheet and per-event triptychs.
//
//   node scripts/dev-probes/sweep/analyse.mjs --in /tmp/sweep/desktop-metal [--clip name]
//
// Per clip it writes, next to the frames:
//   metrics.json  per-frame luma / diff / black / white / stepping series
//   events.json   flagged BLACK_FRAME | FLASH | POP | STUTTER | DPR_TOGGLE | RECOMPILE | GL_ERROR
//   sheet.png     contact sheet (every Nth frame, 8 columns, index + tags burned in)
//   worst/<ev>.png triptych: frame before / flagged frame / frame after
//
// Thresholds are the ones named in the sweep brief; they are deliberately blunt —
// the point is to shortlist frames for a HUMAN to look at, not to auto-judge.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const argOf = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args[i + 1]
}
const inRoot = argOf('--in')
const onlyClip = argOf('--clip')
if (!inRoot) {
  console.error('analyse.mjs: --in <recorded arm dir> is required')
  process.exit(2)
}

// Analysis resolution — every frame is resized to this width in greyscale, so a
// 300-frame clip costs seconds instead of minutes. Tiles below are in THIS space.
const AW = 320
const TILE = 16 // 16 px at AW=320 on a 1200-wide frame ≈ a 60 px tile; the brief's
// "64x64 tile" in source pixels is ~17 px here, so 16 is that tile.

const BLACK = 8
const WHITE = 247
const BLACK_FRAC = 0.6
const BLACK_PREV_FRAC = 0.2
const FLASH_MEAN = 25
const POP_TILE_DELTA = 40
const POP_CAM_SPEED = 0.35 // m/s (orbit/walk position) under which the camera counts as still
const POP_ANGLE_SPEED = 0.25 // rad/s for walk look
const STUTTER_MS = 120

function clipDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'clip.json')))
    .map((d) => path.join(root, d.name))
}

/**
 * MASK-SELECTORS (optional, default OFF — a clip with no `maskRects` is byte-
 * identical to before this existed). `record.mjs --mask-selectors` captures
 * DOM callouts' (e.g. the "Walking through" onboarding card, the Measure
 * pill) `getBoundingClientRect()`s in DEVICE px once per clip and stores them
 * as `clip.maskRects` (`[x, y, w, h][]`). Analysis works on a frame resized to
 * `AW` px wide, so this rescales those rects into that same space using the
 * clip's own recorded viewport (`width * dsf` = the screencast frame's native
 * width) — a clip recorded before this existed has no `maskRects` and this
 * returns `[]`, so every metric below is unchanged for it.
 */
function maskRectsForAnalysis(clip) {
  const raw = clip.maskRects
  if (!Array.isArray(raw) || raw.length === 0) return []
  const nativeW = (clip.viewport?.width ?? 0) * (clip.viewport?.dsf ?? 1)
  if (!nativeW) return []
  const scale = AW / nativeW
  return raw.map(([x, y, w, h]) => ({
    x0: Math.max(0, Math.floor(x * scale)),
    y0: Math.max(0, Math.floor(y * scale)),
    x1: Math.ceil((x + w) * scale),
    y1: Math.ceil((y + h) * scale),
  }))
}

function isMasked(x, y, maskRects) {
  for (const r of maskRects) {
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return true
  }
  return false
}

async function frameStats(file, maskRects = []) {
  const { data, info } = await sharp(file)
    .greyscale()
    .resize({ width: AW })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  let sum = 0
  let black = 0
  let white = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (maskRects.length && isMasked(x, y, maskRects)) continue
      const v = data[row + x]
      sum += v
      if (v < BLACK) black++
      else if (v > WHITE) white++
      n++
    }
  }
  // Edge stepping on a FIXED diagonal region (quarter-frame box straddling the
  // main diagonal): the mean absolute second derivative along scanlines. A clean
  // resolved edge gives a smooth ramp; an upscaled/aliased one gives staircases.
  // Not mask-aware — the region is the frame's own diagonal, and every shipped
  // callout sits at a screen edge (bottom sheet / bottom-left pill), so the two
  // have never been observed to overlap.
  const x0 = Math.round(w * 0.25)
  const x1 = Math.round(w * 0.75)
  const y0 = Math.round(h * 0.25)
  const y1 = Math.round(h * 0.75)
  let step = 0
  let stepN = 0
  for (let y = y0; y < y1; y++) {
    const row = y * w
    for (let x = x0 + 1; x < x1 - 1; x++) {
      step += Math.abs(data[row + x - 1] - 2 * data[row + x] + data[row + x + 1])
      stepN++
    }
  }
  return {
    w,
    h,
    data,
    maskRects,
    luma: n ? sum / n : 0,
    black: n ? black / n : 0,
    white: n ? white / n : 0,
    stepping: stepN ? step / stepN : 0,
  }
}

/** True when `[c*TILE, r*TILE]`..`+TILE` overlaps ANY mask rect at all — a
 *  callout's edge landing in a tile is enough to disqualify it from the
 *  worst-tile POP scan, the same reasoning `frameStats` applies per pixel. */
function tileIsMasked(c, r, maskRects) {
  if (!maskRects.length) return false
  const tx0 = c * TILE
  const ty0 = r * TILE
  const tx1 = tx0 + TILE
  const ty1 = ty0 + TILE
  for (const m of maskRects) {
    if (tx0 < m.x1 && tx1 > m.x0 && ty0 < m.y1 && ty1 > m.y0) return true
  }
  return false
}

function tileDiffs(a, b, w, h, maskRects = []) {
  const cols = Math.floor(w / TILE)
  const rows = Math.floor(h / TILE)
  let worst = 0
  let worstTile = null
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tileIsMasked(c, r, maskRects)) continue
      let s = 0
      for (let y = r * TILE; y < (r + 1) * TILE; y++) {
        const row = y * w
        for (let x = c * TILE; x < (c + 1) * TILE; x++) s += a[row + x] - b[row + x]
      }
      const m = Math.abs(s) / (TILE * TILE)
      if (m > worst) {
        worst = m
        worstTile = [c, r]
      }
    }
  }
  return { worst, worstTile }
}

/** Camera speed (m/s) and angular speed (rad/s) around a clip-relative time. */
function motionAt(samples, tMs) {
  let best = null
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].wall >= tMs) {
      best = i
      break
    }
  }
  if (best === null) best = samples.length - 1
  if (best < 1) return { speed: 0, angSpeed: 0 }
  const a = samples[best - 1]
  const b = samples[best]
  const dt = Math.max(1, b.wall - a.wall) / 1000
  let speed = 0
  if (a.pos && b.pos) {
    speed = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) / dt
  }
  let angSpeed = 0
  if (a.yaw != null && b.yaw != null) {
    angSpeed = (Math.abs(b.yaw - a.yaw) + Math.abs((b.pitch ?? 0) - (a.pitch ?? 0))) / dt
  }
  return { speed, angSpeed }
}

function svgLabel(text, w, h) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="#000" opacity="0.72"/>` +
      `<text x="4" y="${h - 5}" font-family="monospace" font-size="${Math.min(13, h - 3)}" fill="#0f0">${esc}</text></svg>`,
  )
}

async function contactSheet(dir, frames, tagsByFrame, out) {
  const COLS = 8
  const step = Math.max(1, Math.ceil(frames.length / 48))
  const picked = frames.filter((_, i) => i % step === 0)
  const CW = 200
  const meta = await sharp(path.join(dir, picked[0].file)).metadata()
  const CH = Math.round((meta.height / meta.width) * CW)
  const rows = Math.ceil(picked.length / COLS)
  const tiles = []
  for (let i = 0; i < picked.length; i++) {
    const f = picked[i]
    const tags = tagsByFrame.get(f.i)
    const label = `${f.i}${tags ? ` ${tags.join(',')}` : ''}`
    const img = await sharp(path.join(dir, f.file))
      .resize(CW, CH)
      .composite([{ input: svgLabel(label, CW, 18), top: CH - 18, left: 0 }])
      .png()
      .toBuffer()
    tiles.push({
      input: img,
      left: (i % COLS) * CW,
      top: Math.floor(i / COLS) * CH,
    })
  }
  await sharp({
    create: { width: COLS * CW, height: rows * CH, channels: 3, background: '#111' },
  })
    .composite(tiles)
    .png()
    .toFile(out)
}

async function triptych(dir, frames, idx, label, out) {
  const pick = [Math.max(0, idx - 1), idx, Math.min(frames.length - 1, idx + 1)]
  const CW = 460
  const meta = await sharp(path.join(dir, frames[idx].file)).metadata()
  const CH = Math.round((meta.height / meta.width) * CW)
  const tiles = []
  for (let i = 0; i < 3; i++) {
    const f = frames[pick[i]]
    const img = await sharp(path.join(dir, f.file))
      .resize(CW, CH)
      .composite([
        {
          input: svgLabel(`${['before', 'FLAGGED', 'after'][i]} #${f.i}`, CW, 20),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer()
    tiles.push({ input: img, left: i * CW, top: 22 })
  }
  await sharp({ create: { width: 3 * CW, height: CH + 22, channels: 3, background: '#111' } })
    .composite([{ input: svgLabel(label, 3 * CW, 22), top: 0, left: 0 }, ...tiles])
    .png()
    .toFile(out)
}

const dirs = clipDirs(inRoot).filter((d) => !onlyClip || path.basename(d) === onlyClip)
const armSummary = { arm: path.basename(inRoot), clips: [], counts: {} }

for (const dir of dirs) {
  const clip = JSON.parse(fs.readFileSync(path.join(dir, 'clip.json'), 'utf8'))
  const frames = clip.frames
  if (frames.length < 3) {
    console.log(`[analyse] ${clip.clip}: only ${frames.length} frames, skipped`)
    continue
  }
  const maskRects = maskRectsForAnalysis(clip)
  const metrics = []
  const events = []
  let prev = null
  for (const f of frames) {
    const st = await frameStats(path.join(dir, f.file), maskRects)
    let diff = 0
    let tile = { worst: 0, worstTile: null }
    if (prev && prev.data.length === st.data.length) {
      let s = 0
      let n = 0
      for (let i = 0; i < st.data.length; i++) {
        if (maskRects.length && isMasked(i % st.w, Math.floor(i / st.w), maskRects)) continue
        s += Math.abs(st.data[i] - prev.data[i])
        n++
      }
      diff = n ? s / n : 0
      tile = tileDiffs(st.data, prev.data, st.w, st.h, maskRects)
    }
    const m = {
      i: f.i,
      relMs: f.relMs,
      luma: +st.luma.toFixed(2),
      diff: +diff.toFixed(3),
      black: +st.black.toFixed(4),
      white: +st.white.toFixed(4),
      stepping: +st.stepping.toFixed(3),
      tileMax: +tile.worst.toFixed(2),
      tile: tile.worstTile,
    }
    metrics.push(m)
    if (prev) {
      const p = metrics[metrics.length - 2]
      if (m.black > BLACK_FRAC && p.black < BLACK_PREV_FRAC) {
        events.push({
          type: 'BLACK_FRAME',
          frame: f.i,
          relMs: f.relMs,
          detail: `black ${(m.black * 100).toFixed(0)}% (prev ${(p.black * 100).toFixed(0)}%)`,
        })
      }
      if (Math.abs(m.luma - p.luma) > FLASH_MEAN) {
        events.push({
          type: 'FLASH',
          frame: f.i,
          relMs: f.relMs,
          detail: `mean ${p.luma.toFixed(1)} -> ${m.luma.toFixed(1)}`,
        })
      }
      const mo = motionAt(clip.samples, f.relMs)
      if (m.tileMax > POP_TILE_DELTA && mo.speed < POP_CAM_SPEED && mo.angSpeed < POP_ANGLE_SPEED) {
        events.push({
          type: 'POP',
          frame: f.i,
          relMs: f.relMs,
          detail: `tile ${m.tile} delta ${m.tileMax.toFixed(0)} while camera ${mo.speed.toFixed(2)} m/s ${mo.angSpeed.toFixed(2)} rad/s`,
        })
      }
    }
    prev = st
  }

  // Sample-series events, mapped to the nearest frame.
  const frameAt = (wall) => {
    let best = frames[0]
    for (const f of frames) if (Math.abs(f.relMs - wall) < Math.abs(best.relMs - wall)) best = f
    return best.i
  }
  let lastDpr = null
  let lastPrograms = null
  for (const s of clip.samples) {
    if (lastDpr !== null && s.dpr !== lastDpr) {
      events.push({
        type: 'DPR_TOGGLE',
        frame: frameAt(s.wall),
        relMs: s.wall,
        detail: `pixelRatio ${lastDpr} -> ${s.dpr}`,
      })
    }
    lastDpr = s.dpr
    if (lastPrograms !== null && s.programs > lastPrograms) {
      events.push({
        type: 'RECOMPILE',
        frame: frameAt(s.wall),
        relMs: s.wall,
        detail: `programs ${lastPrograms} -> ${s.programs}`,
      })
    }
    lastPrograms = s.programs
    for (const [t, d] of s.raf || []) {
      if (d > STUTTER_MS) {
        events.push({
          type: 'STUTTER',
          frame: frameAt(s.wall),
          relMs: s.wall,
          detail: `rAF delta ${d} ms @ t=${t}`,
        })
      }
    }
  }
  for (const c of clip.console) {
    events.push({
      type: 'GL_ERROR',
      frame: 0,
      relMs: 0,
      detail: `[${c.type}] ${c.text.slice(0, 220)}`,
    })
  }

  events.sort((a, b) => a.relMs - b.relMs)
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(metrics))
  fs.writeFileSync(
    path.join(dir, 'events.json'),
    JSON.stringify({ clip: clip.clip, arm: clip.arm, frameCount: frames.length, events }, null, 2),
  )

  const tagsByFrame = new Map()
  for (const e of events) {
    if (!tagsByFrame.has(e.frame)) tagsByFrame.set(e.frame, [])
    const t = tagsByFrame.get(e.frame)
    if (!t.includes(e.type)) t.push(e.type)
  }
  await contactSheet(dir, frames, tagsByFrame, path.join(dir, 'sheet.png'))

  const worstDir = path.join(dir, 'worst')
  fs.mkdirSync(worstDir, { recursive: true })
  // One triptych per event, capped per type so a 200-STUTTER clip doesn't
  // produce 200 images — the human only needs the representative ones.
  const perType = {}
  for (const e of events) {
    if (e.type === 'GL_ERROR') continue
    perType[e.type] = (perType[e.type] || 0) + 1
    if (perType[e.type] > 6) continue
    const idx = frames.findIndex((f) => f.i === e.frame)
    if (idx < 1) continue
    await triptych(
      dir,
      frames,
      idx,
      `${clip.arm} ${clip.clip} ${e.type} — ${e.detail}`,
      path.join(worstDir, `${e.type}-${e.frame}.png`),
    )
  }

  const counts = {}
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1
  for (const k of Object.keys(counts))
    armSummary.counts[k] = (armSummary.counts[k] || 0) + counts[k]
  armSummary.clips.push({ clip: clip.clip, frames: frames.length, counts })
  console.log(`[analyse] ${clip.clip}: ${frames.length} frames — ${JSON.stringify(counts)}`)
}

fs.writeFileSync(path.join(inRoot, 'events-summary.json'), JSON.stringify(armSummary, null, 2))
console.log(`[analyse] summary → ${path.join(inRoot, 'events-summary.json')}`)
console.log(JSON.stringify(armSummary.counts, null, 2))
