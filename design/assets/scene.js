/* ============================================================
   HDB Sandbox — Isometric dollhouse generator
   Renders a furnished HDB living/dining room as a single SVG of
   flat-shaded cuboids (the app's "Performance renderer" look).
   Floor + walls tint to the active theme; furniture keeps natural
   material colours so it reads on light & dark alike.
   ============================================================ */
(function () {
  const U = 31;          // iso unit (px per world unit)
  const HZ = 0.62;       // height foreshortening
  const OX = 350, OY = 92; // origin offset within viewBox

  const proj = (x, y, z = 0) => [
    OX + (x - y) * U,
    OY + (x + y) * U * 0.5 - z * U * HZ,
  ];
  const pts = (arr) => arr.map((p) => p.join(',')).join(' ');

  // L is 0..100 lightness tweak helper on a base {l,c,h}
  const col = (l, c, h, a = 1) => `oklch(${l} ${c} ${h}${a < 1 ? ` / ${a}` : ''})`;

  // a cuboid: top (lightest), down-right face (mid), down-left face (dark)
  function box(x, y, w, d, h, base) {
    const { l, c, h: hue } = base;
    const A0 = proj(x, y, 0), B0 = proj(x + w, y, 0), C0 = proj(x + w, y + d, 0), D0 = proj(x, y + d, 0);
    const Ah = proj(x, y, h), Bh = proj(x + w, y, h), Ch = proj(x + w, y + d, h), Dh = proj(x, y + d, h);
    const top = col(Math.min(0.98, l + 0.08), c, hue);
    const right = col(l - 0.04, c, hue);
    const front = col(l - 0.13, c * 1.05, hue);
    // soft contact shadow
    const sh = pts([proj(x - 0.15, y + d + 0.15), proj(x + w + 0.15, y + d + 0.15), proj(x + w + 0.45, y + d + 0.45), proj(x - 0.45, y + d + 0.45)]);
    return (
      `<polygon points="${pts([D0, C0, proj(x + w + 0.5, y + d + 0.4), proj(x - 0.4, y + d + 0.4)])}" fill="oklch(0 0 0 / 0.10)"/>` +
      `<polygon points="${pts([D0, C0, Ch, Dh])}" fill="${front}"/>` +
      `<polygon points="${pts([B0, C0, Ch, Bh])}" fill="${right}"/>` +
      `<polygon points="${pts([Ah, Bh, Ch, Dh])}" fill="${top}"/>`
    );
  }

  // natural furniture material palette (theme-independent, warm)
  const M = {
    oak:    { l: 0.78, c: 0.045, h: 75 },
    walnut: { l: 0.5,  c: 0.05,  h: 55 },
    fabricL:{ l: 0.82, c: 0.012, h: 250 },
    fabricD:{ l: 0.62, c: 0.02,  h: 250 },
    cream:  { l: 0.9,  c: 0.015, h: 90 },
    sage:   { l: 0.7,  c: 0.04,  h: 150 },
    charcoal:{l: 0.36, c: 0.008, h: 260 },
    plant:  { l: 0.58, c: 0.09,  h: 150 },
    pot:    { l: 0.68, c: 0.06,  h: 40 },
    rugW:   { l: 0.86, c: 0.02,  h: 70 },
  };

  function generateScene(theme) {
    const floor = theme.floor, wallL = theme.wallL, wallR = theme.wallR, grid = theme.grid;
    const W = 13, D = 11;             // room footprint
    const out = [];

    // floor slab
    const f0 = proj(0, 0), f1 = proj(W, 0), f2 = proj(W, D), f3 = proj(0, D);
    out.push(`<polygon points="${pts([f0, f1, f2, f3])}" fill="${floor}"/>`);
    // plank lines along x
    for (let i = 1; i < D; i++) {
      const a = proj(0, i), b = proj(W, i);
      out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${grid}" stroke-width="1"/>`);
    }
    // back walls (low, so we see in)
    const WH = 3.0;
    // back-left wall (y=0 plane)
    out.push(`<polygon points="${pts([proj(0,0,0), proj(W,0,0), proj(W,0,WH), proj(0,0,WH)])}" fill="${wallR}"/>`);
    // back-right wall (x=0 plane)
    out.push(`<polygon points="${pts([proj(0,0,0), proj(0,D,0), proj(0,D,WH), proj(0,0,WH)])}" fill="${wallL}"/>`);
    // skirting accents
    out.push(`<polygon points="${pts([proj(0,0,0), proj(W,0,0), proj(W,0,0.18), proj(0,0,0.18)])}" fill="oklch(0 0 0 / 0.06)"/>`);
    out.push(`<polygon points="${pts([proj(0,0,0), proj(0,D,0), proj(0,D,0.18), proj(0,0,0.18)])}" fill="oklch(0 0 0 / 0.06)"/>`);
    // a window on the back-left wall
    out.push(`<polygon points="${pts([proj(2.5,0,0.9), proj(6.5,0,0.9), proj(6.5,0,2.4), proj(2.5,0,2.4)])}" fill="oklch(0.92 0.03 230 / 0.55)"/>`);
    out.push(`<polygon points="${pts([proj(4.5,0,0.9), proj(4.6,0,0.9), proj(4.6,0,2.4), proj(4.5,0,2.4)])}" fill="${wallR}"/>`);

    // ---- empty variant: a bare room with a dashed drop-pad ----
    if (theme.empty) {
      const acc = theme.accent;
      const p0 = proj(3, 3.4), p1 = proj(10, 3.4), p2 = proj(10, 8), p3 = proj(3, 8);
      out.push(`<polygon points="${pts([p0, p1, p2, p3])}" fill="${acc}" fill-opacity="0.06" stroke="${acc}" stroke-width="2.5" stroke-dasharray="10 8"/>`);
      const c = proj(6.5, 5.7);
      out.push(`<g transform="translate(${c[0]} ${c[1]})"><circle r="20" fill="${acc}" fill-opacity="0.12"/><path d="M0 -9 V9 M-9 0 H9" stroke="${acc}" stroke-width="2.5" stroke-linecap="round"/></g>`);
      return `<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
    }

    // ---- furniture (drawn back→front) ----
    const items = [];
    // rug
    const r0 = proj(2.6, 3.4), r1 = proj(9, 3.4), r2 = proj(9, 8.2), r3 = proj(2.6, 8.2);
    out.push(`<polygon points="${pts([r0, r1, r2, r3])}" fill="${col(M.rugW.l, M.rugW.c, M.rugW.h)}"/>`);
    out.push(`<polygon points="${pts([proj(3,3.8), proj(8.6,3.8), proj(8.6,7.8), proj(3,7.8)])}" fill="none" stroke="oklch(0 0 0 / 0.06)" stroke-width="2"/>`);

    // TV console + TV on back-left wall
    items.push({ k: 0.5, s: box(3.2, 0.2, 4.2, 0.7, 0.55, M.walnut) });
    items.push({ k: 0.55, s: box(4.6, 0.35, 1.6, 0.12, 1.7, M.charcoal) }); // tv
    // sideboard on back-right wall
    items.push({ k: 0.6, s: box(0.2, 3.2, 0.7, 3.0, 0.8, M.oak) });
    // plant by right wall
    items.push({ k: 4, s: box(0.6, 7.0, 0.7, 0.7, 0.5, M.pot) });
    items.push({ k: 4.1, s: box(0.55, 6.95, 0.8, 0.8, 1.7, M.plant) });
    // dining table + chairs (back area)
    items.push({ k: 2.2, s: box(8.6, 1.2, 1.5, 3.2, 0.74, M.oak) });
    items.push({ k: 2.0, s: box(8.0, 1.5, 0.5, 0.5, 0.9, M.walnut) });
    items.push({ k: 2.1, s: box(8.0, 3.4, 0.5, 0.5, 0.9, M.walnut) });
    items.push({ k: 2.6, s: box(10.2, 1.5, 0.5, 0.5, 0.9, M.walnut) });
    items.push({ k: 2.7, s: box(10.2, 3.4, 0.5, 0.5, 0.9, M.walnut) });
    // coffee table
    items.push({ k: 6, s: box(4.6, 5.0, 2.2, 1.2, 0.4, M.oak) });
    // sofa (seat + back + 2 arms) facing the TV (front of room)
    items.push({ k: 8.5, s: box(3.2, 7.4, 5.0, 1.0, 0.78, M.fabricL) }); // backrest row
    items.push({ k: 8.2, s: box(3.2, 7.9, 5.0, 1.6, 0.42, M.fabricD) }); // seat
    items.push({ k: 8.1, s: box(3.2, 7.4, 0.5, 2.1, 0.62, M.fabricL) }); // arm
    items.push({ k: 8.15, s: box(7.7, 7.4, 0.5, 2.1, 0.62, M.fabricL) }); // arm
    // floor lamp
    items.push({ k: 7, s: box(9.4, 6.6, 0.18, 0.18, 1.6, M.charcoal) });
    items.push({ k: 7.05, s: box(9.1, 6.3, 0.8, 0.8, 0.4, M.cream) });

    items.sort((a, b) => a.k - b.k);
    for (const it of items) out.push(it.s);

    // selection highlight on the sofa (ties scene <-> inspector)
    if (theme.selected !== false) {
      const acc = theme.accent;
      const s = { x: 3.0, y: 7.2, w: 5.4, d: 2.5 };
      const ring = pts([proj(s.x, s.y), proj(s.x + s.w, s.y), proj(s.x + s.w, s.y + s.d), proj(s.x, s.y + s.d)]);
      out.push(`<polygon points="${ring}" fill="${acc}" fill-opacity="0.1" stroke="${acc}" stroke-width="2" stroke-dasharray="6 5"/>`);
      const tag = proj(s.x + s.w / 2, s.y);
      out.push(`<g transform="translate(${tag[0]} ${tag[1] - 14})"><rect x="-58" y="-12" width="116" height="22" rx="11" fill="${acc}"/><text x="0" y="3" text-anchor="middle" fill="${theme.onAccent}" font-family="var(--font-ui)" font-size="11" font-weight="700">Halmstad 3-seater</text></g>`);
    }

    return `<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
  }

  function readSceneTheme() {
    const cs = getComputedStyle(document.querySelector('[data-theme]') || document.documentElement);
    const g = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    return {
      floor: g('--scene-floor', 'oklch(0.86 0.03 65)'),
      wallL: g('--scene-b', 'oklch(0.9 0.02 55)'),
      wallR: g('--scene-a', 'oklch(0.94 0.02 60)'),
      grid: g('--grid', 'oklch(0.5 0.04 60 / 0.12)'),
      accent: g('--accent', 'oklch(0.6 0.125 42)'),
      onAccent: g('--on-accent', 'oklch(0.99 0.01 70)'),
      empty: (document.getElementById('stage') || {}).dataset?.empty === '1',
    };
  }

  window.renderScene = function (mount) {
    if (!mount) return;
    mount.innerHTML = generateScene(readSceneTheme());
  };
})();
