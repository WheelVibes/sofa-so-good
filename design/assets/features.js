/* ============================================================
   HDB Sandbox — Feature builders (pure, on window.Features)
   app.js owns state + events; these return HTML strings only.
   Mirrors the Flows / Screens module pattern.
   ============================================================ */
(function () {
  const I = window.icon;
  const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  /* ---------- shared bits ----------------------------------- */
  function emptyMini(ic, title, body, cta) {
    return `<div class="empty-mini">
      <div class="em-ic">${I(ic, 20)}</div>
      <b>${title}</b><span>${body}</span>
      ${cta || ''}
    </div>`;
  }

  // tiny top-down room thumbnail from furniture footprints [x,y,w,h,role]
  function layoutThumb(f, w = 70, h = 52) {
    const roleFill = {
      soft: 'fill:var(--accent-soft);stroke:var(--accent)',
      wood: 'fill:var(--surface-solid);stroke:var(--border-2)',
      tv: 'fill:var(--surface-2);stroke:var(--text-3)',
      rug: 'fill:var(--surface-3);stroke:none',
      plant: 'fill:var(--accent-soft);stroke:none',
      round: 'fill:var(--surface-solid);stroke:var(--border-2)',
    };
    const rects = (f || []).map((r) => {
      const round = r[4] === 'round' || r[4] === 'plant';
      return `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="${round ? r[2] / 2 : 1.5}" style="${roleFill[r[4]] || roleFill.wood};stroke-width:1.2"/>`;
    }).join('');
    return `<svg viewBox="0 0 100 76" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="96" height="72" rx="3" fill="var(--surface-2)" stroke="var(--border-2)" stroke-width="1.5"/>
      ${rects}
    </svg>`;
  }

  /* ============================================================
     OBJECTS / LAYERS — left-dock body (header shell is in app.js)
     ============================================================ */
  function layersBody(S) {
    const rooms = S.rooms;
    const issuesByItem = {};
    (S.issues || []).forEach((i) => { if (!issuesByItem[i.item] || i.sev === 'error') issuesByItem[i.item] = i.sev; });
    const groups = rooms.map((room) => {
      const items = S.placed.filter((p) => p.room === room);
      if (!items.length) return '';
      const collapsed = (S.lyrCollapsed || {})[room];
      const rows = collapsed ? '' : items.map((p) => {
        const sev = issuesByItem[p.id];
        const flag = sev ? `<span class="lyr-flag ${sev === 'warn' ? 'warn' : ''}" title="Has a clearance issue">${I('ruler', 13)}</span>` : '';
        return `<div class="lyr-row ${S.selectedId === p.id ? 'sel' : ''} ${p.hidden ? 'hidden' : ''}" data-selobj="${p.id}">
          <span class="lyr-ic">${I(p.ic, 14, 1.6)}</span>
          <span class="lyr-nm">${esc(p.name)}</span>
          ${flag}
          <span class="lyr-acts">
            <button data-objlock="${p.id}" class="${p.locked ? 'on' : ''}" title="${p.locked ? 'Unlock' : 'Lock'}">${I(p.locked ? 'lock' : 'unlock', 13)}</button>
            <button data-objvis="${p.id}" class="${p.hidden ? 'on' : ''}" title="${p.hidden ? 'Show' : 'Hide'}">${I('eye', 13)}</button>
            <button data-objdel="${p.id}" title="Delete">${I('trash', 13)}</button>
          </span>
        </div>`;
      }).join('');
      return `<div class="lyr-group">
        <button class="lyr-ghead ${collapsed ? 'collapsed' : ''}" data-lyrgroup="${esc(room)}">
          <span class="chev">${I('chevronDown', 13)}</span>${esc(room)}
          <span class="gcount">${items.length}</span>
        </button>${rows}
      </div>`;
    }).join('');
    const total = S.placed.length;
    return `<div class="lyr-body">${groups || emptyMini('layers', 'No furniture yet', 'Drag pieces from the catalog to start building your layout.')}</div>
      <div class="lyr-foot"><span>${total} object${total === 1 ? '' : 's'}</span><span>${S.rooms.length} rooms</span></div>`;
  }

  /* ============================================================
     SWAP — alternatives in the same category, similar footprint
     ============================================================ */
  function swap(S, getAlternatives) {
    const it = S.placed.find((p) => p.id === S.selectedId);
    if (!it) return `<aside class="panel" id="swapPanel"><div class="panel-head"><div class="panel-title">Swap</div><button class="icon-btn" data-closemodal="swap">${I('close', 16)}</button></div><div class="panel-body">${emptyMini('copy', 'Nothing selected', 'Select a piece first to find alternatives.')}</div></aside>`;
    const alts = getAlternatives(it);
    const fitFor = (alt) => {
      const dw = Math.abs((alt.w || it.w) - it.w);
      if (dw <= 12) return ['Exact fit', 'ok'];
      if (dw <= 45) return ['Fits', 'ok'];
      return [(alt.w > it.w ? '+' : '−') + dw + ' cm', 'warn'];
    };
    const cards = alts.map((alt) => {
      const cur = alt.name === it.name;
      const [fit, fc] = fitFor(alt);
      return `<button class="swap-card ${cur ? 'current' : ''}" ${cur ? '' : `data-swapuse="${esc(alt.name)}|${alt.price}|${alt.w}"`}>
        ${cur ? `<span class="curtag badge ok">Current</span>` : ''}
        <div class="card-thumb">${I(it.ic, 30, 1.5)}</div>
        <span class="nm">${esc(alt.name)}</span>
        <div class="meta"><b>${money(alt.price)}</b><span class="fittag badge ${fc}">${fit}</span></div>
      </button>`;
    }).join('');
    return `<aside class="panel" id="swapPanel">
      <div class="panel-head"><div><div class="panel-title">Swap with similar</div><div class="panel-sub">${esc(it.catLabel || it.cat)} · keeps position</div></div>
        <button class="icon-btn" data-closemodal="swap">${I('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="swap-cur">
          <div class="insp-thumb">${I(it.ic, 26, 1.5)}</div>
          <div class="sc-meta"><div class="nm">${esc(it.name)}</div><div class="dims mono">${it.w} × ${it.d} × ${it.h} cm</div></div>
          <span class="badge neutral">Replacing</span>
        </div>
        <div class="swap-grid">${cards}</div>
      </div>
    </aside>`;
  }

  /* ============================================================
     CLEARANCE — counts + issue list
     ============================================================ */
  function clearance(S) {
    const issues = S.issues || [];
    const errs = issues.filter((i) => i.sev === 'error').length;
    const warns = issues.filter((i) => i.sev === 'warn').length;
    const ok = S.placed.length - new Set(issues.map((i) => i.item)).size;
    const nameOf = (id) => (S.placed.find((p) => p.id === id) || {}).name || 'item';
    const body = issues.length ? `
      <div class="clr-summary">
        <div class="clr-stat err"><div class="n">${errs}</div><div class="l">Blocking</div></div>
        <div class="clr-stat warn"><div class="n">${warns}</div><div class="l">Tight</div></div>
        <div class="clr-stat ok"><div class="n">${ok}</div><div class="l">Clear</div></div>
      </div>
      <div class="clr-list">${issues.map((i) => `
        <button class="clr-item ${i.sev}" data-clrissue="${i.id}">
          <div class="ci-head">
            <span class="badge ${i.sev === 'error' ? 'err' : 'warn'}">${i.sev === 'error' ? 'Blocking' : 'Tight'}</span>
            <span class="ci-title">${esc(i.title)}</span>
          </div>
          <div class="ci-detail">${esc(i.detail)}</div>
          ${i.fix ? `<div class="ci-fix">${I('check', 13)} ${esc(i.fix)}</div>` : ''}
        </button>`).join('')}
      </div>` : `<div class="clr-allclear">
        <div class="ring">${I('check', 22)}</div>
        <b style="font-size:var(--t-base);font-weight:700">All clearances pass</b>
        <span style="font-size:var(--t-xs);color:var(--text-3);max-width:30ch">Every walkway is at least 90 cm and all doors swing freely.</span>
      </div>`;
    return `<aside class="panel mini aux" id="clearancePanel" data-anim-key="aux:clearance">
      <div class="panel-head"><div><div class="panel-title">Clearance checks</div><div class="panel-sub">HDB 90 cm walkways</div></div>
        <button class="icon-btn" data-closepanel="clearance">${I('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body" style="padding-bottom:var(--s-5)">${body}</div>
    </aside>`;
  }

  /* ============================================================
     SHOPPING LIST + COLLECTIONS
     ============================================================ */
  function shopping(S) {
    const tab = S.shopTab || 'list';
    const tbtn = (id, label, n) => `<button class="tab ${tab === id ? 'on' : ''}" data-shoptab="${id}">${label}${n != null ? ` · ${n}` : ''}</button>`;
    // group identical placed items by name
    const map = new Map();
    S.placed.forEach((p) => {
      const k = p.name;
      if (map.has(k)) map.get(k).qty++;
      else map.set(k, { name: p.name, cat: p.catLabel || p.cat, ic: p.ic, price: p.price, qty: 1, id: p.id });
    });
    const lines = [...map.values()];
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
    const delivery = subtotal > 0 ? 59 : 0;
    const assembly = subtotal > 0 ? Math.round(subtotal * 0.04) : 0;
    const grand = subtotal + delivery + assembly;

    let body;
    if (tab === 'list') {
      body = lines.length ? `
        <div class="shop-list">${lines.map((l) => `
          <div class="shop-row">
            <div class="shop-th">${I(l.ic, 18, 1.5)}</div>
            <div class="shop-meta"><div class="nm">${esc(l.name)}</div><div class="sub">${esc(l.cat)}</div></div>
            <div class="shop-qty">
              <button data-shopqty="${l.id}|-1">${I('minus', 13)}</button>
              <span class="q">${l.qty}</span>
              <button data-shopqty="${l.id}|1">${I('plus', 13)}</button>
            </div>
            <span class="shop-price">${money(l.price * l.qty)}</span>
          </div>`).join('')}
        </div>
        <div class="shop-totals">
          <div class="tr"><span>Subtotal · ${S.placed.length} items</span><span class="mono">${money(subtotal)}</span></div>
          <div class="tr"><span>Home delivery</span><span class="mono">${money(delivery)}</span></div>
          <div class="tr"><span>Assembly service</span><span class="mono">${money(assembly)}</span></div>
          <div class="tr grand"><span>Estimated total</span><span class="mono">${money(grand)}</span></div>
        </div>
        <button class="btn btn-accent btn-block" style="margin-top:var(--s-4)" data-shopcart>${I('budget', 14)} Add all to cart</button>
        <button class="btn btn-soft btn-block" style="margin-top:var(--s-2)" data-shopexport>${I('download', 14)} Export shopping list</button>
      ` : emptyMini('budget', 'Your list is empty', 'Furniture you place appears here with a live price estimate.');
    } else {
      const coll = S.collections || [];
      body = coll.length ? `<div class="coll-grid">${coll.map((c, i) => `
        <div class="coll-card">
          <button class="coll-x" data-collremove="${i}" title="Remove">${I('close', 12)}</button>
          <div class="card-thumb">${I(c.ic, 26, 1.5)}</div>
          <span class="nm">${esc(c.name)}</span>
          <span class="pr">${money(c.price)}</span>
          <button class="btn btn-soft btn-sm add" data-colladd="${i}">${I('plus', 12)} Add to room</button>
        </div>`).join('')}</div>`
        : emptyMini('star', 'No saved items', 'Tap the heart on any catalog piece to save it here for later.');
    }
    return `<aside class="panel mini aux" id="shopPanel" data-anim-key="aux:shop">
      <div class="panel-head"><div class="panel-title">Shopping</div>
        <button class="icon-btn" data-closepanel="budget">${I('close', 16)}</button></div>
      <div class="shop-tabs" style="padding-left:var(--s-4);padding-right:var(--s-4)">${tbtn('list', 'List', S.placed.length)}${tbtn('saved', 'Saved', (S.collections || []).length)}</div>
      <hr class="hr"/>
      <div class="panel-body" style="padding-bottom:var(--s-5)">${body}</div>
    </aside>`;
  }

  /* ============================================================
     VERSIONS — save / restore / compare
     ============================================================ */
  function versions(S) {
    if (S.compareVers) return compareView(S);
    const vers = S.versions || [];
    const list = vers.length ? `<div class="ver-list">${vers.map((v) => `
      <div class="ver-card ${v.current ? 'current' : ''}">
        <div class="ver-thumb">${layoutThumb(v.f)}</div>
        <div class="ver-info">
          <div class="nm">${esc(v.name)}${v.current ? ' <span class="badge ok">Current</span>' : ''}</div>
          <div class="when">${esc(v.when)}</div>
          <div class="stats">${v.items} items · ${money(v.cost)}</div>
          <div class="ver-actions">
            ${v.current ? '' : `<button data-verrestore="${v.id}">${I('undo', 12)} Restore</button>`}
            <button data-vercompare="${v.id}">${I('group', 12)} Compare</button>
            ${v.current ? '' : `<button class="del" data-verdel="${v.id}">${I('trash', 12)}</button>`}
          </div>
        </div>
      </div>`).join('')}</div>`
      : emptyMini('save', 'No saved versions', 'Save the current arrangement to compare layouts side by side later.');
    return `<aside class="panel mini aux" id="versionsPanel" data-anim-key="aux:versions">
      <div class="panel-head"><div><div class="panel-title">Versions</div><div class="panel-sub">Layout history</div></div>
        <button class="icon-btn" data-closepanel="versions">${I('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body" style="padding-bottom:var(--s-5)">
        <button class="btn btn-accent btn-block" style="margin-top:var(--s-3)" data-versave>${I('save', 14)} Save current as version</button>
        ${list}
      </div>
    </aside>`;
  }
  function compareView(S) {
    const a = (S.versions || []).find((v) => v.current) || S.versions[0];
    const b = (S.versions || []).find((v) => v.id === S.compareVers) || S.versions[1] || a;
    const col = (v, tag) => `<div class="col"><div class="ver-thumb">${layoutThumb(v.f)}</div><h4>${esc(v.name)}</h4><div class="stats">${v.items} items · ${money(v.cost)}</div><span class="badge ${tag === 'A' ? 'ok' : 'neutral'}" style="margin-top:6px">${esc(v.when)}</span></div>`;
    return `<aside class="panel mini aux" id="versionsPanel" style="width:420px;position:relative" data-anim-key="aux:versions">
      <div class="panel-head"><div><div class="panel-title">Compare versions</div><div class="panel-sub">${money(Math.abs(a.cost - b.cost))} difference</div></div>
        <button class="icon-btn" data-comparedone>${I('arrowLeft', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body" style="padding-bottom:var(--s-5)">
        <div class="ver-cmp" style="margin-top:var(--s-3);position:relative">
          ${col(a, 'A')}${col(b, 'B')}
          <div class="vs">VS</div>
        </div>
        <button class="btn btn-soft btn-block" style="margin-top:var(--s-4)" data-verrestore="${b.id}">${I('undo', 14)} Restore “${esc(b.name)}”</button>
      </div>
    </aside>`;
  }

  /* ============================================================
     SHARE & EXPORT
     ============================================================ */
  function share(S) {
    const vis = S.shareVis || 'link';
    const opt = (id, ic, t, sub) => `<button class="share-opt ${vis === id ? 'on' : ''}" data-sharevis="${id}">
      <span class="so-ic">${I(ic, 16)}</span>
      <span class="so-t"><b>${t}</b><span>${sub}</span></span>
      <span class="so-check">${I('check', 16)}</span></button>`;
    return `<aside class="panel" id="sharePanel">
      <div class="panel-head"><div><div class="panel-title">Share design</div><div class="panel-sub">Serangoon North Vista · 4-room</div></div>
        <button class="icon-btn" data-closemodal="share">${I('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="sec" style="border:none;padding-top:var(--s-4)">
          <div class="sec-h">Shareable link</div>
          <div class="share-link">
            <div class="field" style="flex:1">${I('eye', 16)}<input class="input" readonly value="hdb.design/s/4rm-serangoon-9fK2" /></div>
            <button class="btn btn-accent" data-copylink>${I('copy', 14)} Copy</button>
          </div>
        </div>
        <div class="sec">
          <div class="sec-h">Who can view</div>
          <div class="share-vis">
            ${opt('link', 'eye', 'Anyone with the link', 'View-only — they can’t edit your layout')}
            ${opt('account', 'lock', 'Only my IKEA account', 'Private — saved to the cloud for you')}
          </div>
        </div>
        <div class="sec">
          <div class="sec-h">Export</div>
          <div class="export-row">
            <button class="btn btn-soft" data-exportpng>${I('download', 14)} Snapshot PNG</button>
            <button class="btn btn-soft" data-exportpdf>${I('file', 14)} Shoppable PDF</button>
          </div>
        </div>
      </div>
    </aside>`;
  }

  /* ============================================================
     COMMAND PALETTE — list is built in app.js, rendered here
     ============================================================ */
  function cmdk(S, groups) {
    const q = S.cmdQuery || '';
    let idx = 0;
    const flat = [];
    const body = groups.map((g) => {
      if (!g.items.length) return '';
      const rows = g.items.map((it) => {
        const myIdx = idx++;
        flat.push(it);
        return `<button class="cmdk-item ${myIdx === S.cmdIdx ? 'active' : ''}" data-cmdrun="${it.id}" data-cmdidx="${myIdx}">
          ${I(it.ic || 'chevronRight', 17)}
          <span class="ci-label">${esc(it.label)}</span>
          ${it.hint ? `<span class="ci-hint">${esc(it.hint)}</span>` : ''}
          ${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}
        </button>`;
      }).join('');
      return `<div class="cmdk-glabel">${esc(g.label)}</div>${rows}`;
    }).join('');
    const results = flat.length ? body : `<div class="cmdk-empty">No commands match “${esc(q)}”.</div>`;
    return `<div class="cmdk-overlay" data-cmdkroot data-anim-key="cmdk">
      <div class="cmdk">
        <div class="cmdk-search">${I('search', 20)}
          <input id="cmdkInput" placeholder="Search actions, furniture, views…" value="${esc(q)}" autocomplete="off" spellcheck="false"/>
          <kbd>esc</kbd>
        </div>
        <div class="cmdk-results">${results}</div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>`;
  }

  /* ============================================================
     CONTEXT MENU — right-click on a placed item
     ============================================================ */
  function ctxMenu(S) {
    const it = S.placed.find((p) => p.id === S.selectedId);
    if (!it || !S.ctx) return '';
    const item = (act, ic, label, sk, cls = '') => `<button class="ctx-item ${cls}" data-ctxact="${act}">${I(ic, 16)}<span>${label}</span>${sk ? `<kbd class="sk">${sk}</kbd>` : ''}</button>`;
    return `<div class="ctx-menu" data-ctxroot style="left:${S.ctx.x}px;top:${S.ctx.y}px">
      <div class="ctx-head">${I(it.ic, 15)}<b>${esc(it.name)}</b></div>
      ${item('swap', 'copy', 'Swap with similar…')}
      ${item('duplicate', 'copy', 'Duplicate', '⌃D')}
      ${item('rotate', 'rotate', 'Rotate 90°', 'R')}
      <div class="ctx-sep"></div>
      ${item('align', 'alignX', 'Align to room')}
      ${item('front', 'layers', 'Bring to front')}
      ${item('lock', it.locked ? 'unlock' : 'lock', it.locked ? 'Unlock' : 'Lock')}
      ${item('hide', 'eye', it.hidden ? 'Show' : 'Hide')}
      <div class="ctx-sep"></div>
      ${item('delete', 'trash', 'Delete', '⌫', 'danger')}
    </div>`;
  }

  /* ============================================================
     SMART GUIDES OVERLAY — shown over the 3D scene in measure mode
     ============================================================ */
  function guideOverlay(S) {
    const it = S.placed.find((p) => p.id === S.selectedId);
    if (!it) return '';
    // a simple, centered, schematic representation of the selected item's
    // footprint with snap lines + clearance pills. Decorative but on-brand.
    return `<div class="guide-overlay">
      <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">
        <!-- vertical + horizontal snap lines through item center -->
        <line class="guide-line snap" x1="500" y1="40" x2="500" y2="600"/>
        <line class="guide-line snap" x1="120" y1="360" x2="880" y2="360"/>
        <!-- item footprint -->
        <rect class="guide-box" x="410" y="300" width="180" height="120" rx="4"/>
        <!-- clearance to left wall -->
        <line class="guide-line" x1="120" y1="360" x2="410" y2="360"/>
        <g transform="translate(232 360)">
          <rect class="guide-pill" x="-26" y="-11" width="52" height="22" rx="11"/>
          <text class="guide-pill-txt" x="0" y="4" text-anchor="middle">94 cm</text>
        </g>
        <!-- clearance below to next item -->
        <line class="guide-line" x1="500" y1="420" x2="500" y2="520"/>
        <g transform="translate(500 470)">
          <rect class="guide-pill" x="-26" y="-11" width="52" height="22" rx="11"/>
          <text class="guide-pill-txt" x="0" y="4" text-anchor="middle">72 cm</text>
        </g>
        <!-- item label tag -->
        <g transform="translate(500 285)">
          <rect class="guide-tag" x="-72" y="-15" width="144" height="26" rx="6"/>
          <text class="guide-tag-txt" x="0" y="3" text-anchor="middle">${esc(it.name)}</text>
        </g>
      </svg>
    </div>`;
  }

  window.Features = { layersBody, swap, clearance, shopping, versions, share, cmdk, ctxMenu, guideOverlay, layoutThumb };
})();
