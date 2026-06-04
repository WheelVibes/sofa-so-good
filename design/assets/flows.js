/* ============================================================
   HDB Sandbox — Extended flows
   • Edit Room  — focused single-room wall/floor finish editor
   • Layout presets — pick a starting furniture arrangement
   • Onboarding — first-run welcome carousel
   • Empty state — overlay shown over an unfurnished room
   Pure builder functions on window.Flows. app.js owns state.
   ============================================================ */
(function () {
  const I = window.icon;

  /* ---------- Finish libraries ------------------------------- */
  // [name, color, textured?]
  const WALL_LIB = {
    paint: { label: 'Paint', seg: 'Paint', rate: 12, sw: [
      ['Chalk White', 'oklch(0.96 0.005 90)'], ['Warm Linen', 'oklch(0.92 0.02 80)'],
      ['Putty', 'oklch(0.79 0.015 70)'], ['Clay Wash', 'oklch(0.74 0.06 45)'],
      ['Sage Mist', 'oklch(0.82 0.03 150)'], ['Sky Wash', 'oklch(0.83 0.04 230)'],
      ['Slate Blue', 'oklch(0.55 0.045 240)'], ['Terracotta', 'oklch(0.62 0.11 42)'],
      ['Ochre', 'oklch(0.72 0.09 75)'], ['Charcoal', 'oklch(0.36 0.008 260)'],
    ] },
    paper: { label: 'Wallpaper', seg: 'Paper', rate: 28, textured: true, sw: [
      ['Linen Grain', 'oklch(0.88 0.02 90)'], ['Rattan Weave', 'oklch(0.8 0.05 80)'],
      ['Grasscloth', 'oklch(0.78 0.04 95)'], ['Botanical', 'oklch(0.68 0.06 150)'],
      ['Tropic Palm', 'oklch(0.58 0.07 160)'], ['Terrazzo Fleck', 'oklch(0.86 0.02 80)'],
    ] },
    tile: { label: 'Tile', seg: 'Tile', rate: 60, sw: [
      ['Subway White', 'oklch(0.93 0.005 250)'], ['Cement Grey', 'oklch(0.74 0.008 80)'],
      ['Zellige Green', 'oklch(0.6 0.07 165)'], ['Carrara', 'oklch(0.9 0.008 250)'],
      ['Glossy Sand', 'oklch(0.85 0.03 80)'], ['Charcoal Matte', 'oklch(0.38 0.008 260)'],
    ] },
    panel: { label: 'Wood panel', seg: 'Panel', rate: 95, textured: true, sw: [
      ['Oak Slat', 'oklch(0.78 0.045 75)'], ['Teak Batten', 'oklch(0.62 0.06 60)'],
      ['Walnut Flute', 'oklch(0.5 0.05 55)'], ['White Shaker', 'oklch(0.92 0.006 90)'],
      ['Smoked Ash', 'oklch(0.46 0.012 60)'],
    ] },
  };
  const FLOOR_LIB = {
    tile: { label: 'Tile', seg: 'Tile', rate: 60, sw: [
      ['Warm Concrete', 'oklch(0.74 0.008 80)'], ['Terrazzo', 'oklch(0.85 0.02 80)'],
      ['Carrara', 'oklch(0.9 0.008 250)'], ['Charcoal', 'oklch(0.4 0.008 260)'],
    ] },
    vinyl: { label: 'Vinyl', seg: 'Vinyl', rate: 45, sw: [
      ['Light Oak', 'oklch(0.8 0.04 80)'], ['Honey Oak', 'oklch(0.72 0.05 70)'],
      ['Grey Wash', 'oklch(0.72 0.01 80)'], ['Smoked Walnut', 'oklch(0.5 0.05 55)'],
    ] },
    parquet: { label: 'Parquet', seg: 'Parquet', rate: 120, textured: true, sw: [
      ['Herringbone Oak', 'oklch(0.77 0.045 75)'], ['Chevron Teak', 'oklch(0.64 0.055 62)'],
      ['Natural Ash', 'oklch(0.83 0.03 85)'],
    ] },
    carpet: { label: 'Carpet', seg: 'Carpet', rate: 55, textured: true, sw: [
      ['Wool Sand', 'oklch(0.78 0.02 80)'], ['Pebble Grey', 'oklch(0.7 0.01 80)'],
      ['Deep Moss', 'oklch(0.58 0.05 150)'],
    ] },
  };

  // surface meta: key -> [label, icon, area m², libIsFloor]
  const SURFACES = {
    back: ['Feature wall', 'grid', 12.4, false],
    left: ['Left wall', 'grid', 8.6, false],
    right: ['Right wall', 'grid', 8.6, false],
    floor: ['Floor', 'topView', 24.6, true],
    ceiling: ['Ceiling', 'topView', 24.6, false],
  };
  const SURF_ORDER = ['back', 'left', 'right', 'floor', 'ceiling'];

  function libFor(surface) { return SURFACES[surface][3] ? FLOOR_LIB : WALL_LIB; }
  function finishOf(S, surface) {
    const lib = libFor(surface);
    const f = S.finishes[surface];
    const type = lib[f.type] ? f.type : Object.keys(lib)[0];
    const sw = lib[type].sw[Math.min(f.idx, lib[type].sw.length - 1)];
    return { lib, type, sw, textured: !!lib[type].textured };
  }
  function colorOf(S, surface) { return finishOf(S, surface).sw[1]; }

  function estimateCost(S) {
    let total = 0;
    for (const k of SURF_ORDER) {
      const { lib, type } = finishOf(S, k);
      total += lib[type].rate * SURFACES[k][2];
    }
    return Math.round(total / 10) * 10;
  }

  /* ---------- Edit Room screen ------------------------------- */
  function editBar(S) {
    const rooms = ['Living / Dining', 'Master Bedroom', 'Kitchen', 'Bedroom 2'];
    const opts = rooms.map((r) =>
      `<button class="er-room ${S.editRoomName === r ? 'on' : ''}" data-editroom="${r}">${r}</button>`).join('');
    return `<div class="screen-bar er-bar">
      <button class="sb-back" data-goto="sandbox">${I('arrowLeft', 16)} 3D Sandbox</button>
      <div class="tool-divider"></div>
      <span class="sb-title">Edit Room</span>
      <div class="er-roomswitch">${opts}</div>
    </div>`;
  }

  // one-point perspective room shell with clickable surfaces
  function roomShell(S) {
    const sel = S.editSurface;
    const fill = (k) => colorOf(S, k);
    const tx = (k) => (finishOf(S, k).textured
      ? `<polygon class="er-tex" points="${SURF_PTS[k]}" data-surface="${k}"/>` : '');
    const SURF_PTS = {
      ceiling: '40,30 1240,30 880,250 400,250',
      left: '40,30 400,250 400,470 40,690',
      right: '1240,30 880,250 880,470 1240,690',
      floor: '40,690 400,470 880,470 1240,690',
      back: '400,250 880,250 880,470 400,470',
    };
    // (re-declared above for tx closure scope)
    const surf = (k) => {
      const on = sel === k;
      return `<polygon class="er-surf ${on ? 'sel' : ''}" points="${SURF_PTS[k]}" fill="${fill(k)}" data-surface="${k}"/>`;
    };
    // hotspot dot centroids
    const HOT = { ceiling: [640, 150], left: [220, 360], right: [1060, 360], floor: [640, 580], back: [640, 360] };
    const hot = (k) => {
      const [x, y] = HOT[k]; const on = sel === k;
      return `<g class="er-hot ${on ? 'on' : ''}" data-surface="${k}" transform="translate(${x} ${y})">
        <circle r="15"/><g transform="translate(-7 -7) scale(0.6)" class="er-hot-ic">${ICONS.palette}</g></g>`;
    };
    return `<svg viewBox="0 0 1280 720" class="er-svg" xmlns="http://www.w3.org/2000/svg">
      ${surf('ceiling')}${surf('left')}${surf('right')}${surf('floor')}${surf('back')}
      ${SURF_ORDER.map(tx).join('')}
      <!-- back-wall window -->
      <rect class="er-win" x="540" y="300" width="200" height="120" rx="2"/>
      <line class="er-winbar" x1="640" y1="300" x2="640" y2="420"/>
      <line class="er-winbar" x1="540" y1="360" x2="740" y2="360"/>
      <!-- skirting -->
      <polyline class="er-skirt" points="40,690 400,470 880,470 1240,690"/>
      <line class="er-skirt" x1="400" y1="470" x2="400" y2="250"/>
      <line class="er-skirt" x1="880" y1="470" x2="880" y2="250"/>
      <!-- ghost furniture for scale -->
      <g class="er-ghost">
        <rect x="470" y="430" width="340" height="44" rx="10"/>
        <rect x="455" y="412" width="36" height="62" rx="8"/>
        <rect x="789" y="412" width="36" height="62" rx="8"/>
        <rect x="560" y="500" width="160" height="30" rx="5"/>
      </g>
      ${SURF_ORDER.map((k) => sel === k ? `<polygon class="er-ring" points="${SURF_PTS[k]}"/>` : '').join('')}
      ${SURF_ORDER.map(hot).join('')}
    </svg>`;
  }

  function surfaceList(S) {
    const rows = SURF_ORDER.map((k) => {
      const [label] = SURFACES[k]; const { sw, textured } = finishOf(S, k);
      return `<button class="er-listrow ${S.editSurface === k ? 'on' : ''}" data-surface="${k}">
        <span class="er-chip ${textured ? 'tex' : ''}" style="background:${sw[1]}"></span>
        <span class="er-listmeta"><b>${label}</b><em>${sw[0]}</em></span>
        ${S.accentWall === k ? `<span class="er-acctag">Accent</span>` : ''}
      </button>`;
    }).join('');
    return `<aside class="panel er-list">
      <div class="panel-head"><div><div class="panel-title">Surfaces</div><div class="panel-sub">Living / Dining</div></div></div>
      <hr class="hr"/>
      <div class="panel-body" style="padding-top:10px">${rows}</div>
    </aside>`;
  }

  function finishPanel(S) {
    const surface = S.editSurface;
    const [label, , area, isFloor] = SURFACES[surface];
    const lib = libFor(surface);
    const f = finishOf(S, surface);
    const typeSeg = Object.keys(lib).map((t) =>
      `<button class="${f.type === t ? 'on' : ''}" style="flex:1" data-ftype="${t}">${lib[t].seg || lib[t].label}</button>`).join('');
    const cells = lib[f.type].sw.map((s, i) => `
      <button class="finish-cell ${f.sw === s ? 'on' : ''}" data-fswatch="${i}">
        <div class="swatch-lg ${lib[f.type].textured ? 'tex' : ''}" style="background:${s[1]}"></div>
        <div class="name">${s[0]}</div>
      </button>`).join('');
    const isWall = !isFloor && surface !== 'ceiling';
    const sheen = `<div class="er-field">
        <div class="er-fhead"><span>Sheen</span><span class="mono">${S.sheen}%</span></div>
        <input type="range" class="slider" min="0" max="100" value="${S.sheen}" data-sheen/>
      </div>`;
    const accent = isWall ? `<div class="row">
        <span class="rk">${I('star', 16)}Accent wall</span>
        <button class="switch ${S.accentWall === surface ? 'on' : ''}" data-accentwall="${surface}"></button>
      </div>` : '';
    const applyAll = isWall ? `<button class="btn btn-soft btn-block" data-applyall style="margin-top:10px">${I('layers', 14)} Apply to all walls</button>` : '';
    return `<aside class="panel er-finish">
      <div class="panel-head">
        <div><div class="panel-title">${label}</div><div class="panel-sub">${area} m² · ${lib[f.type].label}</div></div>
        <button class="icon-btn" data-goto="sandbox">${I('close', 16)}</button>
      </div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="sec" style="border:none;padding-top:14px">
          <div class="sec-h">Finish type</div>
          <div class="seg fit" style="width:100%">${typeSeg}</div>
        </div>
        <div class="sec">
          <div class="sec-h">${lib[f.type].label} <span class="mono" style="color:var(--text-3)">${f.sw[0]}</span></div>
          <div class="finish-grid">${cells}</div>
        </div>
        <div class="sec">
          ${sheen}
          ${accent}
          ${applyAll}
        </div>
      </div>
      <div class="er-foot">
        <div class="er-cost"><span class="panel-sub">Est. materials</span><span class="big mono">$${estimateCost(S).toLocaleString('en-SG')}</span></div>
        <button class="btn btn-accent" data-goto="sandbox">${I('check', 15)} Done</button>
      </div>
    </aside>`;
  }

  function editRoom(S) {
    return `<div class="screen er-screen">
      ${editBar(S)}
      ${surfaceList(S)}
      <div class="er-stage"><div class="er-roomview">${roomShell(S)}</div>
        <div class="er-hint">${I('palette', 14)} Click a wall, the floor or ceiling to change its finish</div>
      </div>
      ${finishPanel(S)}
    </div>`;
  }

  /* ---------- Layout presets picker -------------------------- */
  // furniture footprint: [x,y,w,h,role]  roles: soft|wood|tv|rug|plant|round
  const PRESETS = [
    { id: 'cosy', name: 'Cosy Lounge', tag: 'Lounge', items: 6, cost: 2480,
      desc: 'Sofa, rug & low console facing the window.',
      f: [[14,58,52,16,'soft'],[26,46,28,10,'wood'],[20,30,40,6,'tv'],[12,40,56,30,'rug'],[60,30,9,9,'plant']] },
    { id: 'entertain', name: 'Open Entertainer', tag: 'Lounge', items: 9, cost: 4120,
      desc: 'L-shaped sofa with a six-seat dining table.',
      f: [[10,46,40,14,'soft'],[10,46,14,30,'soft'],[28,34,24,8,'tv'],[58,16,28,16,'wood'],[60,10,6,6,'wood'],[78,10,6,6,'wood'],[60,34,6,6,'wood'],[78,34,6,6,'wood']] },
    { id: 'wfh', name: 'WFH Corner', tag: 'WFH', items: 7, cost: 3050,
      desc: 'Compact sofa, desk nook & open shelving.',
      f: [[12,52,38,14,'soft'],[60,12,24,12,'wood'],[68,26,8,8,'round'],[12,12,8,30,'wood'],[26,30,32,6,'tv']] },
    { id: 'family', name: 'Compact Family', tag: 'Compact', items: 8, cost: 2760,
      desc: 'Two-seater, round table & toy storage.',
      f: [[14,54,34,14,'soft'],[58,40,18,18,'round'],[12,14,42,8,'wood'],[60,12,16,10,'tv'],[14,28,40,24,'rug']] },
    { id: 'zen', name: 'Minimal Zen', tag: 'Compact', items: 5, cost: 1990,
      desc: 'Low seating, floor cushions & a slim table.',
      f: [[18,52,44,10,'soft'],[34,40,28,7,'wood'],[16,30,10,10,'round'],[64,52,10,10,'plant']] },
    { id: 'dining', name: 'Dining-First', tag: 'Dining', items: 7, cost: 3640,
      desc: 'Eight-seat table, sideboard & bench.',
      f: [[28,22,40,18,'wood'],[30,14,6,6,'wood'],[44,14,6,6,'wood'],[58,14,6,6,'wood'],[30,42,6,6,'wood'],[44,42,6,6,'wood'],[58,42,6,6,'wood'],[12,58,52,8,'wood']] },
  ];
  const PRESET_FILTERS = ['All', 'Lounge', 'Dining', 'WFH', 'Compact'];

  function presetThumb(items) {
    const roleFill = {
      soft: 'fill:var(--accent-soft);stroke:var(--accent)',
      wood: 'fill:var(--surface-3);stroke:var(--border-2)',
      tv: 'fill:var(--text-3);stroke:none',
      rug: 'fill:var(--surface-2);stroke:var(--border)',
      plant: 'fill:var(--accent-soft);stroke:var(--accent-soft-text)',
      round: 'fill:var(--surface-3);stroke:var(--border-2)',
    };
    const order = ['rug', 'wood', 'soft', 'round', 'tv', 'plant'];
    const sorted = [...items].sort((a, b) => order.indexOf(a[4]) - order.indexOf(b[4]));
    const shapes = sorted.map((it) => {
      const [x, y, w, h, role] = it;
      if (role === 'round' || role === 'plant') {
        return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}" style="${roleFill[role]}" stroke-width="1"/>`;
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${role === 'rug' ? 3 : 2}" style="${roleFill[role]}" stroke-width="1"/>`;
    }).join('');
    return `<svg viewBox="0 0 96 84" class="preset-thumb" preserveAspectRatio="xMidYMid meet">
      <rect x="6" y="6" width="84" height="72" rx="3" class="preset-room"/>
      <rect x="40" y="3" width="22" height="4" class="preset-door"/>
      ${shapes}
    </svg>`;
  }

  function presets(S) {
    const chips = PRESET_FILTERS.map((c) =>
      `<button class="chip ${S.presetFilter === c ? 'on' : ''}" data-presetfilter="${c}">${c}</button>`).join('');
    const list = S.presetFilter === 'All' ? PRESETS : PRESETS.filter((p) => p.tag === S.presetFilter);
    const cards = list.map((p) => `
      <button class="preset-card ${S.presetSel === p.id ? 'on' : ''}" data-preset="${p.id}">
        <div class="preset-thumbwrap">${presetThumb(p.f)}</div>
        <div class="preset-meta">
          <div class="preset-top"><b>${p.name}</b><span class="preset-check">${I('check', 14)}</span></div>
          <p class="preset-desc">${p.desc}</p>
          <div class="preset-stats"><span>${p.tag}</span><span class="dot"></span><span>${p.items} items</span><span class="dot"></span><span class="mono">$${p.cost.toLocaleString('en-SG')}</span></div>
        </div>
      </button>`).join('');
    const sel = PRESETS.find((p) => p.id === S.presetSel);
    return `<aside class="panel preset-panel">
      <div class="panel-head">
        <div><div class="panel-title">Layout presets</div><div class="panel-sub">Living / Dining · 24.6 m²</div></div>
        <button class="icon-btn" data-closepanel="presets">${I('close', 16)}</button>
      </div>
      <div class="preset-filters">${chips}</div>
      <hr class="hr"/>
      <div class="panel-body preset-body"><div class="preset-grid">${cards}</div></div>
      <div class="preset-foot">
        <button class="btn" data-startempty>${I('grid', 14)} Start empty</button>
        <button class="btn btn-accent" data-applypreset ${sel ? '' : 'disabled'}>${I('check', 15)} ${sel ? `Apply “${sel.name}”` : 'Select a layout'}</button>
      </div>
    </aside>`;
  }

  /* ---------- Onboarding carousel ---------------------------- */
  function onbStep1() {
    const feat = (ic, t, d) => `<div class="onb-feat"><span class="onb-feat-ic">${I(ic, 20)}</span><b>${t}</b><em>${d}</em></div>`;
    return `<div class="onb-hero">
      <div class="onb-mark">H</div>
      <h2 class="onb-title">Welcome to HDB Sandbox</h2>
      <p class="onb-lede">Design your 4-room flat in the browser — furnish it, refinish the walls and floors, then walk through the result.</p>
      <div class="onb-feats">
        ${feat('grid', 'Furnish', 'Drag from a 75-item catalog')}
        ${feat('palette', 'Refinish', 'Paint, tile & panel any surface')}
        ${feat('walk', 'Walk through', 'See it in first-person')}
      </div>
    </div>`;
  }
  function onbStep2() {
    const step = (ic, t, d) => `<li><span class="onb-step-ic">${I(ic, 17)}</span><div><b>${t}</b><em>${d}</em></div></li>`;
    return `<div class="onb-body2">
      <h2 class="onb-title sm">A quick tour</h2>
      <ul class="onb-steps">
        ${step('drag', 'Drag to place', 'Pull any catalog item onto the floor — press R to rotate.')}
        ${step('cube', 'Orbit & zoom', 'Drag empty space to orbit the dollhouse, scroll to zoom.')}
        ${step('palette', 'Edit the room', 'Open Edit Room to repaint walls and swap flooring.')}
        ${step('walk', 'Walk it through', 'Switch to first-person to feel the scale.')}
      </ul>
    </div>`;
  }
  function onbStep3() {
    const choice = (act, ic, t, d) => `<button class="onb-choice" data-onbgoto="${act}">
      <span class="onb-choice-ic">${I(ic, 22)}</span>
      <b>${t}</b><em>${d}</em>${I('chevronRight', 16)}</button>`;
    return `<div class="onb-body3">
      <h2 class="onb-title sm">Where would you like to start?</h2>
      <div class="onb-choices">
        ${choice('presets', 'layers', 'Pick a layout', 'Start from a furnished arrangement')}
        ${choice('demo', 'cube', 'Open the demo room', 'A styled living / dining to explore')}
        ${choice('empty', 'grid', 'Start empty', 'A bare flat — furnish it yourself')}
      </div>
    </div>`;
  }
  function onboarding(S) {
    const steps = [onbStep1, onbStep2, onbStep3];
    const i = S.onbStep;
    const dots = steps.map((_, d) => `<span class="onb-dot ${d === i ? 'on' : ''}" data-onbdot="${d}"></span>`).join('');
    const nav = i < 2
      ? `<button class="btn" data-onbskip>Skip</button>
         <div class="onb-dots">${dots}</div>
         <button class="btn btn-accent" data-onbnext>${i === 0 ? 'Get started' : 'Next'} ${I('chevronRight', 15)}</button>`
      : `<button class="btn" data-onbprev>${I('chevronLeft', 15)} Back</button>
         <div class="onb-dots">${dots}</div>
         <button class="btn" data-onbskip>Skip for now</button>`;
    return `<div class="modal-overlay onb-overlay" data-onbroot data-anim-key="onb">
      <div class="panel onb-card">
        <div class="onb-content">${steps[i]()}</div>
        <div class="onb-nav">${nav}</div>
      </div>
    </div>`;
  }

  /* ---------- Empty-state overlay ---------------------------- */
  function emptyOverlay() {
    return `<div class="empty-state">
      <div class="empty-card">
        <div class="empty-ic">${I('grid', 26)}</div>
        <div class="empty-title">Your flat is empty</div>
        <p class="empty-sub">Drag furniture from the catalog, or drop in a ready-made layout to get going.</p>
        <div class="empty-actions">
          <button class="btn btn-accent" data-openpanel="presets">${I('layers', 15)} Choose a layout</button>
          <button class="btn" data-fill-demo>${I('cube', 15)} Use demo room</button>
        </div>
      </div>
    </div>`;
  }

  window.Flows = {
    editRoom, presets, onboarding, emptyOverlay,
    WALL_LIB, FLOOR_LIB, SURFACES, SURF_ORDER, PRESETS, libFor,
  };
})();
