/* ============================================================
   HDB Sandbox — additional screens & the appearance switcher.
   Pure builder functions exposed on window.Screens; app.js calls
   them with current state and wires interactions.
   ============================================================ */
(function () {
  const I = window.icon;

  // ---------- Appearance switcher popover ----------
  function appearance(theme, modePref, META) {
    const order = ['clay', 'kampong', 'porcelain', 'estate'];
    const cards = order.map((id) => {
      const m = META[id];
      return `<button class="appe-card ${theme === id ? 'on' : ''}" data-settheme="${id}">
        <span class="appe-sw"><i style="background:${m.chip}"></i><i style="background:${m.accent}"></i></span>
        <span class="appe-meta"><b>${m.name}</b><em>${m.desc}</em></span>
        <span class="appe-check">${I('check', 15)}</span>
      </button>`;
    }).join('');
    const mode = [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['auto', 'settings', 'Auto']]
      .map(([k, ic, l]) => `<button class="${modePref === k ? 'on' : ''}" data-setmode="${k}">${I(ic, 15)}${l}</button>`).join('');
    return `<div class="popover appearance" id="appearance" data-anim-key="appearance">
      <div class="pop-label">Theme</div>
      <div class="appe-grid">${cards}</div>
      <div class="pop-label" style="margin-top:10px">Appearance</div>
      <div class="seg accent appe-mode">${mode}</div>
    </div>`;
  }

  // ---------- Loading screen ----------
  function loading(pct) {
    return `<div class="loading" id="loading">
      <div class="load-inner">
        <div class="load-mark">H</div>
        <div class="load-title">HDB Sandbox</div>
        <div class="load-sub">4-Room Flat · Interior Designer</div>
        <div class="load-bar"><i style="width:${pct}%"></i></div>
        <div class="load-status"><span id="loadTip">Loading flat geometry…</span><span class="mono" id="loadPct">${pct}%</span></div>
      </div>
      <div class="load-foot">Performance renderer · WebGL</div>
    </div>`;
  }

  // ---------- 2D Floor-plan editor ----------
  const PLAN_TOOLS = [
    ['select', 'cube', 'Select & move', 'V'],
    ['wall', 'ruler', 'Draw wall', 'W'],
    ['door', 'home', 'Place door', 'D'],
    ['window', 'grid', 'Place window', 'N'],
    ['room', 'topView', 'Define room', 'R'],
    ['dim', 'distribute', 'Dimension', 'M'],
    ['label', 'file', 'Text label', 'T'],
  ];
  function planRail(tool) {
    const top = PLAN_TOOLS.map((t) =>
      `<button class="rail-btn tip ${tool === t[0] ? 'on' : ''}" data-plantool="${t[0]}" data-tip="${t[2]} · ${t[3]}">${I(t[1], 19)}</button>`).join('');
    return `<div class="plan-rail">
      ${top}
      <div class="rail-div"></div>
      <button class="rail-btn tip" data-tip="Undo · ⌃Z">${I('undo', 19)}</button>
      <button class="rail-btn tip" data-tip="Redo · ⇧⌃Z">${I('redo', 19)}</button>
    </div>`;
  }

  // The HDB 4-room plan, drawn to a 920×640 viewBox (1 grid = 20px ≈ 0.5 m)
  function planSVG() {
    const W = 'var(--plan-wall)';
    const wall = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${W}"/>`;
    const room = (x, y, w, h, name, area, sel) =>
      `<g><rect class="plan-room ${sel ? 'sel' : ''}" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      `<text class="plan-rname" x="${x + w / 2}" y="${y + h / 2 - 4}" text-anchor="middle">${name}</text>` +
      `<text class="plan-rarea" x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle">${area}</text></g>`;
    // door as a quarter-arc swing
    const door = (x, y, r, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path class="plan-door" d="M0 0 L${r} 0 A${r} ${r} 0 0 1 0 ${r}" /><line class="plan-door-leaf" x1="0" y1="0" x2="${r}" y2="0"/></g>`;
    const win = (x, y, w, horiz) => horiz
      ? `<rect class="plan-win" x="${x}" y="${y - 1.5}" width="${w}" height="3"/>`
      : `<rect class="plan-win" x="${x - 1.5}" y="${y}" width="3" height="${w}"/>`;
    const dimH = (x1, x2, y, label) => `<g class="plan-dim"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/><line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/><text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle">${label}</text></g>`;
    const dimV = (y1, y2, x, label) => `<g class="plan-dim"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/><text x="${x - 7}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 7} ${(y1 + y2) / 2})">${label}</text></g>`;

    const O = 70, T = 8; // origin, wall thickness
    return `<svg viewBox="0 0 920 640" xmlns="http://www.w3.org/2000/svg" class="plan-svg">
      <!-- outer shell -->
      <rect x="${O}" y="${O}" width="760" height="500" fill="none" stroke="${W}" stroke-width="${T}"/>
      <!-- rooms -->
      ${room(O + T, O + T, 300, 250, 'Living / Dining', '24.6 m²', true)}
      ${room(O + 320, O + T, 220, 150, 'Kitchen', '9.2 m²')}
      ${room(O + 320, O + 170, 220, 92, 'Service Yard', '4.1 m²')}
      ${room(O + 552, O + T, 196, 150, 'Bedroom 2', '10.4 m²')}
      ${room(O + 552, O + 170, 196, 168, 'Bedroom 3', '11.0 m²')}
      ${room(O + T, O + 272, 230, 220, 'Master Bedroom', '13.8 m²')}
      ${room(O + 250, O + 272, 130, 110, 'Bath 1', '3.2 m²')}
      ${room(O + 250, O + 392, 130, 100, 'Bath 2', '3.0 m²')}
      ${room(O + 392, O + 272, 160, 110, 'Foyer', '4.6 m²')}
      ${room(O + 392, O + 392, 160, 100, 'HH Shelter', '3.6 m²')}
      ${room(O + 564, O + 350, 184, 142, 'Balcony', '5.2 m²')}
      <!-- interior walls -->
      ${wall(O + 314, O + T, T, 250)} ${wall(O + 546, O + T, T, 330)}
      ${wall(O + 320, O + 162, 220, T)} ${wall(O + T, O + 264, 540, T)}
      ${wall(O + 244, O + 272, T, 220)} ${wall(O + 386, O + 272, T, 220)}
      ${wall(O + 250, O + 384, 136, T)} ${wall(O + 552, O + 342, 196, T)}
      <!-- windows -->
      ${win(O + 90, O, 120, true)} ${win(O + 600, O, 110, true)}
      ${win(O, O + 330, 120, false)} ${win(O + 760, O + 200, 110, false)}
      <!-- doors -->
      ${door(O + 314, O + 120, 34, 0)} ${door(O + 250, O + 300, 30, 0)}
      ${door(O + 392, O + 300, 30, 90)} ${door(O + 120, O + 264, 32, 180)}
      <!-- living-room furniture footprints -->
      <g class="plan-furn">
        <rect x="${O + 30}" y="${O + 180}" width="150" height="46" rx="6"/>
        <rect x="${O + 60}" y="${O + 110}" width="90" height="44" rx="4"/>
        <circle cx="${O + 240}" cy="${O + 70}" r="26"/>
      </g>
      <!-- dimensions -->
      ${dimH(O, O + 314, O - 22, '7.85 m')}
      ${dimH(O + 320, O + 760 + T, O - 22, '11.0 m')}
      ${dimV(O, O + 264, O - 24, '6.6 m')}
      ${dimV(O + 272, O + 500 + T, O - 24, '5.7 m')}
    </svg>`;
  }

  function planProps(tool) {
    return `<aside class="panel plan-props">
      <div class="panel-head"><div><div class="panel-title">Living / Dining</div><div class="panel-sub">Selected room</div></div></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="sec" style="border:none;padding-top:14px">
          <div class="sec-h">Dimensions</div>
          <div class="transform-grid">
            <label class="num"><span>Width</span><input class="mono" value="7.85"/><i class="unit">m</i></label>
            <label class="num"><span>Depth</span><input class="mono" value="3.20"/><i class="unit">m</i></label>
            <label class="num"><span>Ceiling</span><input class="mono" value="2.60"/><i class="unit">m</i></label>
          </div>
        </div>
        <div class="sec">
          <div class="sec-h">Floor area <span class="mono" style="color:var(--text-3)">24.6 m²</span></div>
          <div class="seg fit" style="width:100%"><button class="on" style="flex:1">Tile</button><button style="flex:1">Vinyl</button><button style="flex:1">Parquet</button></div>
        </div>
        <div class="sec">
          <div class="sec-h">Walls</div>
          <div class="row"><span class="rk">${I('ruler', 16)}Thickness</span><span class="mono" style="font-size:var(--t-xs)">100 mm</span></div>
          <div class="row"><span class="rk">${I('lock', 16)}Structural</span><button class="switch on" data-switch></button></div>
        </div>
        <div class="action-grid two">
          <button class="act" data-act="copy">${I('copy', 18)}Duplicate</button>
          <button class="act danger" data-act="delete">${I('trash', 18)}Delete</button>
        </div>
      </div>
    </aside>`;
  }

  function plan(tool, screenBar) {
    return `<div class="screen plan-screen">
      ${screenBar('2D Floor Plan', 'plan')}
      ${planRail(tool)}
      <div class="plan-canvas"><div class="plan-paper">${planSVG()}</div></div>
      ${planProps(tool)}
      <div class="plan-status">
        <span>${I('grid', 13)} Grid 0.5 m</span>
        <span class="dot"></span>
        <span>Scale 1∶50</span>
        <span class="dot"></span>
        <span>Total <b class="mono">93.5 m²</b></span>
        <span style="margin-left:auto" class="mono">100%</span>
        <button class="status-z">${I('minus', 13)}</button><button class="status-z">${I('plus', 13)}</button>
      </div>
    </div>`;
  }

  // ---------- Walkthrough (first-person) ----------
  function walkBackdrop() {
    // one-point perspective living room — vanishing point centred
    return `<svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" class="walk-svg">
      <defs>
        <linearGradient id="wWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-a)"/><stop offset="1" stop-color="var(--scene-b)"/></linearGradient>
        <linearGradient id="wFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--scene-floor)"/><stop offset="1" stop-color="var(--scene-b)"/></linearGradient>
        <linearGradient id="wSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="oklch(0.85 0.06 230)"/><stop offset="1" stop-color="oklch(0.93 0.04 220)"/></linearGradient>
      </defs>
      <!-- ceiling -->
      <polygon points="0,0 1280,0 840,250 440,250" fill="var(--scene-a)"/>
      <!-- left & right walls -->
      <polygon points="0,0 440,250 440,470 0,720" fill="url(#wWall)"/>
      <polygon points="1280,0 840,250 840,470 1280,720" fill="url(#wWall)"/>
      <!-- floor -->
      <polygon points="0,720 440,470 840,470 1280,720" fill="url(#wFloor)"/>
      <!-- floor planks -->
      <g stroke="var(--grid)" stroke-width="1">
        <line x1="600" y1="470" x2="520" y2="720"/><line x1="680" y1="470" x2="720" y2="720"/>
        <line x1="760" y1="470" x2="920" y2="720"/><line x1="540" y1="470" x2="300" y2="720"/>
      </g>
      <!-- back wall -->
      <rect x="440" y="250" width="400" height="220" fill="var(--scene-a)"/>
      <!-- window with sky -->
      <rect x="500" y="290" width="280" height="130" fill="url(#wSky)"/>
      <line x1="640" y1="290" x2="640" y2="420" stroke="var(--scene-a)" stroke-width="6"/>
      <line x1="500" y1="355" x2="780" y2="355" stroke="var(--scene-a)" stroke-width="4"/>
      <!-- sofa silhouette -->
      <g fill="oklch(0.62 0.02 250)"><rect x="520" y="430" width="240" height="60" rx="12"/><rect x="505" y="412" width="40" height="78" rx="10"/><rect x="735" y="412" width="40" height="78" rx="10"/></g>
      <!-- coffee table + rug -->
      <ellipse cx="640" cy="560" rx="210" ry="46" fill="oklch(0.7 0.02 70 / 0.5)"/>
      <rect x="572" y="520" width="140" height="36" rx="6" fill="oklch(0.5 0.05 55)"/>
      <!-- soft light glow from window -->
      <ellipse cx="640" cy="430" rx="320" ry="180" fill="oklch(0.95 0.05 90 / 0.18)"/>
    </svg>`;
  }
  function walk(room, screenBar) {
    return `<div class="screen walk-screen">
      <div class="walk-view">${walkBackdrop()}</div>
      <div class="walk-vignette"></div>
      <!-- top bar -->
      <div class="walk-top">
        <button class="walk-exit btn" data-goto="sandbox">${I('arrowLeft', 16)} Exit walkthrough</button>
        <div class="walk-room"><span class="walk-room-dot"></span>${room}</div>
        <button class="walk-shot btn tip" data-tip="Capture photo · P">${I('eye', 16)}</button>
      </div>
      <!-- crosshair -->
      <div class="walk-cross"></div>
      <!-- left action stack -->
      <div class="walk-actions">
        <button class="walk-act tip" data-tip="Daylight">${I('sun', 18)}</button>
        <button class="walk-act tip" data-tip="Measure">${I('ruler', 18)}</button>
        <button class="walk-act tip" data-tip="Teleport">${I('pin', 18)}</button>
      </div>
      <!-- bottom hint bar -->
      <div class="walk-hints">
        <span class="wh"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span>
        <span class="wh"><kbd>Drag</kbd> Look</span>
        <span class="wh"><kbd>Shift</kbd> Run</span>
        <span class="wh"><kbd>E</kbd> Interact</span>
      </div>
      <!-- mini compass -->
      <div class="walk-compass"><span class="n">N</span><span class="needle">${I('compassN', 22, 0)}</span></div>
    </div>`;
  }

  window.Screens = { appearance, loading, plan, walk };
})();
