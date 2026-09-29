import { GOODS, CITIES, NATIONS, SHIPS, distance, daysFor } from './data.js';
import { createGame, price, tick, buyShip, buyLicense, setRoute, updateRoute, toggleRoute, removeRoute, assignShip, releaseShip, routeShips, serialize, deserialize, assets, operatingProfit } from './engine.js';
import { t } from './i18n.js';
import { renderRoutes } from './routes-view.js';
import { createClock, voyageProgress } from './clock.js';

let state = createGame(), running = false, speed = 1, selectedCity = 'kingston', editing = null, confirmation = null, pendingRestore = null;
const SAVE_KEY = 'sails-and-flags.save.v2';
const LEGACY_SAVE_KEY = 'sails-and-flags.save.v1';
let pendingMigration = false;
let selectedRoute = null, creating = false, drag = null, suppressPortClick = false;
const clock = createClock();
let draft = { shipId: '', a: 'kingston', b: 'havana', margin: 10, allowed: GOODS.map(g => g.id) };
const app = document.querySelector('#app');
const money = n => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(n);
const decimal = n => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(n);
const cash = n => `¤ ${decimal(Math.abs(n) < 0.05 ? 0 : n)}`;
const signed = n => `${n >= 0 ? '+' : '−'}${cash(Math.abs(n))}`;
const tone = n => n >= 0 ? 'positive' : 'negative';
const date = () => new Date(Date.UTC(1700, 0, 1) + state.day * 86400000).toLocaleDateString('ja-JP', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
const fixedCost = () => state.ships.reduce((v, s) => v + SHIPS[s.type].daily, 0) + state.licenses.reduce((v, n) => v + NATIONS[n].daily, 0);
function notice(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(notice.timer); notice.timer = setTimeout(() => el.classList.remove('show'), 4500); }
const option = (value, label, selected) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
function map() {
  const lines = state.routes.map(r => {
    const a = CITIES[r.a], b = CITIES[r.b];
    const markers = routeShips(state, r).map(ship => {
      return `<g class="ship-marker ${r.id === selectedRoute ? 'selected' : ''}" data-ship="${ship.id}" data-action="select-route" data-id="${r.id}" tabindex="0" role="button" aria-label="${SHIPS[ship.type].name} #${ship.id.split('-')[1]}の交易路を表示" transform="${shipTransform(ship)}"><title>${SHIPS[ship.type].name} #${ship.id.split('-')[1]} · ${CITIES[r.a].name} ⇄ ${CITIES[r.b].name}</title><circle r="14" class="ship-hit"/><circle r="10" fill="#edc786"/><path d="M-5 3H6L3 6H-3ZM0-8V1H6Z" fill="#17383b"/></g>`;
    }).join('');
    return `<line class="route-line ${r.active ? '' : 'inactive'} ${r.id === selectedRoute ? 'selected' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>${markers}`;
  }).join('');
  return `<svg class="map" viewBox="0 0 900 450" role="group" aria-label="カリブ海と西ヨーロッパの交易地図">
    <defs><pattern id="grid" width="75" height="75" patternUnits="userSpaceOnUse"><path d="M75 0H0V75" fill="none" stroke="#ffffff" stroke-opacity=".055"/></pattern><radialGradient id="sea"><stop stop-color="#24515b"/><stop offset="1" stop-color="#153740"/></radialGradient></defs>
    <rect width="900" height="450" fill="url(#sea)"/><rect width="900" height="450" fill="url(#grid)"/>
    <g fill="#496268" stroke="#85958d" stroke-opacity=".5" stroke-width="1.2">
    <path d="M0 0H295L270 25L251 31L235 57L205 72L184 104L165 130L135 162L135 199L155 236L146 250L129 241L107 210L75 203L47 226L0 232Z"/>
    <path d="M0 249L48 238L72 250L80 286L103 311L120 351L160 374L193 406L178 420L148 399L124 394L97 363L66 346L47 311L0 295Z"/>
    <path d="M135 289L160 290L186 302L210 310L224 325L196 323L175 310L151 309Z"/><path d="M205 355L229 352L244 360L225 365Z"/>
    <path d="M244 330L279 329L301 341L295 350L266 346Z"/><path d="M310 347L330 346L340 352L320 357Z"/>
    <path d="M223 421L265 400L319 405L364 420L396 450H216Z"/>
    <path d="M720 29L730 48L719 65L728 83L748 87L758 100L747 108L727 101L715 86L709 64Z"/><path d="M693 60L705 65L703 82L691 87L685 76Z"/>
    <path d="M829 0L808 33L815 56L792 89L768 111L750 118L754 134L734 142L738 155L707 165L697 190L711 210L745 214L762 197L778 184L800 186L820 164L850 185L900 189V0Z"/>
    <path d="M733 233L774 226L813 231L858 214L900 227V450H756L742 401L710 360L698 307L704 260Z"/>
    </g>
    <g class="map-label"><text x="389" y="210" class="ocean">NORTH ATLANTIC</text><text x="390" y="231">北 大 西 洋</text><text x="82" y="389">CARIBBEAN SEA</text><text x="782" y="74">EUROPE</text></g>
    <g stroke="#9baeb0" fill="none" opacity=".5" transform="translate(840 360)"><circle r="25"/><path d="M0-35V35M-35 0H35M0-25L7 0L0 25L-7 0Z"/><text y="-43" fill="#bbc9c7" stroke="none" text-anchor="middle" font-size="12">N</text></g>
    ${lines}<line id="route-drag-preview" hidden/><text id="route-drag-label" x="450" y="420" text-anchor="middle" hidden></text>
    ${Object.entries(CITIES).map(([id, c]) => `<g class="port ${id === selectedCity ? 'selected' : ''}" data-city="${id}" tabindex="0" role="button" aria-label="${c.name}の市場を表示"><circle cx="${c.x}" cy="${c.y}" r="13" class="halo"/><circle cx="${c.x}" cy="${c.y}" r="5" fill="${NATIONS[c.nation].color}"/><text x="${c.x + (id === 'kingston' ? 17 : -17)}" y="${c.y - 13}" text-anchor="${id === 'kingston' ? 'start' : 'end'}">${c.name}</text></g>`).join('')}
  </svg>`;
}
function shipTransform(ship) {
  const w = ship.voyage, p = voyageProgress(w, clock.fraction);
  const from = CITIES[w?.from ?? ship.nextFrom], to = CITIES[w?.to ?? ship.nextFrom];
  // Offset the icon from the city hit target, including when berthed.
  return `translate(${from.x + (to.x - from.x) * p},${from.y + (to.y - from.y) * p + 23})`;
}
function animateTime() {
  for (const marker of app.querySelectorAll('[data-ship]')) {
    const ship = state.ships.find(s => s.id === marker.dataset.ship);
    if (ship?.routeId) marker.setAttribute('transform', shipTransform(ship));
  }
  const bar = app.querySelector('#day-progress');
  if (bar) bar.style.transform = `scaleX(${clock.fraction})`;
  for (const bar of app.querySelectorAll('[data-voyage-progress]')) {
    const ship = state.ships.find(s => s.id === bar.dataset.voyageProgress);
    bar.style.width = `${100 * voyageProgress(ship?.voyage, clock.fraction)}%`;
  }
}
function market() {
  const c = CITIES[selectedCity], n = NATIONS[c.nation];
  return `<div class="section-top"><div><p class="eyebrow">PORT MARKET</p><h2>${c.name}</h2></div><span class="badge">${n.name}</span></div><p class="muted small">${t('taxRate')} ${n.tax * 100}% · ${state.licenses.includes(c.nation) ? t('owned') : '交易免許が必要'}</p>
    <div class="table-wrap"><table><thead><tr><th>${t('product')}</th><th>${t('price')}</th><th>${t('stock')}</th><th>${t('production')}</th><th>${t('demand')}</th></tr></thead><tbody>${GOODS.map(g => { const m = state.markets[selectedCity][g.id]; return `<tr><td><span class="good-icon ${g.id}"></span>${g.name}</td><td>${decimal(price(g.id, m.stock))}</td><td>${money(m.stock)}</td><td class="positive">+${decimal(m.production)}</td><td>${decimal(m.demand)}</td></tr>`; }).join('')}</tbody></table></div><p class="muted small">表示単価は現在在庫の限界価格。実際の売買額は数量による価格変化と税を含めて計算します。</p>`;
}
function policyFields(source) { return `<label>${t('margin')}<input type="number" name="margin" min="0" max="1000" step="1" required value="${source.margin ?? source.minMargin}"></label><fieldset><legend>${t('allowed')}</legend><div class="checks">${GOODS.map(g => `<label><input type="checkbox" name="good" value="${g.id}" ${source.allowed.includes(g.id) ? 'checked' : ''}>${g.name}</label>`).join('')}</div></fieldset>`; }
function setup() {
  const idle = state.ships.filter(s => !s.routeId);
  if (!idle.some(v => v.id === draft.shipId)) draft.shipId = idle[0]?.id || '';
  const ship = idle.find(v => v.id === draft.shipId);
  const existing = findRoute(draft.a, draft.b);
  return `<form id="route-form"><h2 id="create-title">${t('routeSetup')}</h2><div class="form-row"><label>${t('departure')}<select name="from">${Object.entries(CITIES).map(([id, c]) => option(id, c.name, draft.a)).join('')}</select></label><span class="arrow">⇄</span><label>${t('destination')}<select name="to">${Object.entries(CITIES).map(([id, c]) => option(id, c.name, draft.b)).join('')}</select></label></div>
    ${existing ? '<p class="small">この経路は開設済みです。ルート情報を開き、船の追加や積載条件の変更を行えます。</p>' : `<label>${t('vessel')}<select name="ship" required ${idle.length ? '' : 'disabled'}>${idle.length ? idle.map(s => option(s.id, `${SHIPS[s.type].name} #${s.id.split('-')[1]}`, draft.shipId)).join('') : '<option value="">未使用の船がありません</option>'}</select></label>${!idle.length ? '<p class="small">船の購入後にルートを開設できます。</p>' : ''}${policyFields(draft)}<p class="muted small" id="route-estimate">${estimate(ship?.type, draft.a, draft.b)}</p>`}
    <div class="buttons"><button class="primary" ${!existing && (!idle.length || state.gameOver) ? 'disabled' : ''}>${existing ? '既存ルートの情報を表示' : '＋ ' + t('create')}</button><button type="button" data-action="cancel">${t('cancel')}</button></div><p class="muted small">${t('reserveNote')}</p></form>`;
}
function findRoute(a, b) { return a !== b ? state.routes.find(r => [r.a, r.b].includes(a) && [r.a, r.b].includes(b)) : null; }
function estimate(type, a, b) {
  if (a === b) return '異なる2つの港を指定してください。';
  if (!type) return '初回に配置する船を購入してください。';
  const days = daysFor(type, a, b);
  return `${money(distance(a, b))}海里 · 片道${days}日 · 往復${2 * (days + 1)}日（寄港含む） · 船の往復運営費 ${cash(SHIPS[type].daily * 2 * (days + 1))}${distance(a, b) > SHIPS[type].range ? ' · ⚠ 航続距離超過' : ''}`;
}
function routes() {
  const route = state.routes.find(r => r.id === selectedRoute);
  const choices = `<nav class="route-choices" aria-label="交易ルートの選択">${state.routes.map(r => `<button data-action="select-route" data-id="${r.id}" aria-pressed="${r.id === selectedRoute}">${CITIES[r.a].name} ⇄ ${CITIES[r.b].name}</button>`).join('')}</nav>`;
  return choices + renderRoutes({ ...state, routes: route ? [route] : [] }, { decimal, cash, signed, tone });
}
function focusRoute() { document.querySelector('#route-panel-title')?.focus({ preventScroll: true }); document.querySelector('#route-panel')?.scrollIntoView({ block: 'start' }); }
function selectConnection(a, b) {
  pauseTime();
  const route = findRoute(a, b);
  if (route) { selectedRoute = route.id; creating = false; render(); focusRoute(); }
  else { draft = { ...draft, a, b }; creating = true; render(); }
}
function ledger() {
  const records = [...state.ledger].reverse().slice(0, 24);
  return `<div class="table-wrap ledger"><table><thead><tr><th>日付</th><th>${t('transaction')}</th><th>港 / 航路</th><th>${t('amount')}</th></tr></thead><tbody>${records.map(e => `<tr><td>${e.day}日目</td><td>${t(e.category)}${e.good ? ` · ${GOODS.find(g => g.id === e.good).name}` : ''}${e.quantity ? ` ×${decimal(e.quantity)}` : ''}</td><td>${e.city ? CITIES[e.city].name : '—'}${e.routeId ? ` / #${e.routeId.split('-')[1]}` : ''}</td><td class="${tone(e.amount)}">${signed(e.amount)}</td></tr>`).join('') || `<tr><td colspan="4">${t('noEntry')}</td></tr>`}</tbody></table></div>`;
}
function chart() {
  const h = state.history;
  if (h.length < 2) return `<p class="muted small">${t('historyEmpty')}</p>`;
  const lo = Math.min(...h.map(v => v.cash)), hi = Math.max(...h.map(v => v.cash));
  const points = h.map((v, i) => `${i / (h.length - 1) * 600},${75 - (v.cash - lo) / Math.max(1, hi - lo) * 65}`).join(' ');
  return `<svg viewBox="0 0 600 85" class="chart" role="img" aria-label="現金推移 最低${money(lo)} 最高${money(hi)}"><polyline points="${points}" fill="none" stroke="#2c756b" stroke-width="2.5"/></svg><div class="section-top muted small"><span>${h[0].day}日目</span><span>最低 ${cash(lo)} / 最高 ${cash(hi)}</span><span>${state.day}日目</span></div>`;
}
function render() {
  if (!state.routes.some(r => r.id === selectedRoute)) selectedRoute = state.routes[0]?.id ?? null;
  const focused = document.activeElement;
  const restoreFocus = focused?.closest('form') ? { form: focused.closest('form').id, name: focused.name, value: focused.value } : null;
  const view = document.createElement('template');
  view.innerHTML = `<header><div class="brand"><div class="brand-icon">⚑</div><div><h1>SAILS <i>&</i> FLAGS</h1><span>${t('subtitle')}</span></div></div><div class="time"><span class="eyebrow">${t('prototype')}</span><strong>${date()}</strong><span class="small">${state.day}日目 · <span id="time-status">${running ? '進行中' : '一時停止中'}</span></span><div class="day-track" aria-hidden="true"><span id="day-progress"></span></div></div><div class="time-controls"><button data-action="play" class="primary" ${state.gameOver ? 'disabled' : ''}>${running ? 'Ⅱ ' + t('pause') : '▶ ' + t('play')}</button><select id="speed" aria-label="時間の進行速度">${[1, 4, 16].map(n => option(String(n), `${n}倍速`, String(speed))).join('')}</select></div></header>
  <main><div class="summary"><div><span>${t('cash')}</span><strong id="cash">${cash(state.cash)}</strong></div><div><span>${t('assets')}</span><strong>${cash(assets(state))}</strong></div><div><span>${t('operating')}</span><strong class="${tone(operatingProfit(state))}">${signed(operatingProfit(state))}</strong></div><div><span>${t('dailyCost')}</span><strong>${cash(fixedCost())}<small> / 日</small></strong></div><div class="save-buttons"><button data-action="save">${t('save')}</button><button data-action="load">${t('load')}</button><button data-action="reset" class="text-button">${t('reset')}</button></div></div>
  ${state.gameOver ? `<section class="warning danger" role="alert"><h2>${t('bankrupt')}</h2><p>${t('bankruptBody')}</p></section>` : state.cash < fixedCost() * 30 ? `<div class="warning" role="alert">${t('cashWarning')}</div>` : ''}
  <div class="layout"><div class="main-column"><section class="panel map-panel"><div class="section-top panel-heading"><div><p class="eyebrow">THE TRADING ATLAS</p><h2>${t('map')}</h2></div><span class="muted small">4 PORTS · 1700</span></div>${map()}<div class="map-caption"><span><i class="dot"></i> ${t('mapSub')}</span><span>${t('schematic')}</span></div></section>
  <section class="panel route-panel" id="route-panel"><div class="section-top"><div><p class="eyebrow">YOUR TRADE NETWORK</p><h2 id="route-panel-title" tabindex="-1">${t('fleet')}</h2></div><span class="badge">${state.ships.length}隻 / ${state.routes.length}航路</span></div><p class="muted small">${t('fleetSub')}</p><button data-action="new-route" ${state.gameOver ? 'disabled' : ''}>＋ 新規ルート</button><div id="routes">${routes()}</div></section>
  <section class="panel market-panel">${market()}</section>
  <section class="panel ledger-panel"><div class="section-top"><div><p class="eyebrow">COMPANY LEDGER</p><h2>${t('journal')}</h2></div><span class="muted small">${t('investments')} ${cash(-(state.totals.shipPurchase || 0) - (state.totals.licensePurchase || 0))}</span></div><p class="small muted">${t('ledgerNote')}</p><h3>${t('cashTrend')}</h3>${chart()}${ledger()}</section></div>
  <aside><section class="guide"><p class="eyebrow">CAPTAIN'S FIRST STEPS</p><h2>${t('guideTitle')}</h2><p>${t('guideBody')}</p><ol>${['guide1', 'guide2', 'guide3'].map((k, i) => `<li class="${[state.licenses.includes('spain'), state.ships.length > 0, state.routes.length > 0][i] ? 'done' : ''}">${t(k)}</li>`).join('')}</ol></section>
  <section class="panel"><p class="eyebrow">TRADING LICENSES</p><h2>${t('licenses')}</h2><p class="small muted">国名の色印は、地図上の所属都市の点と同じ色です。</p>${Object.entries(NATIONS).map(([id, n]) => `<div class="license"><div><strong class="nation-name"><span class="nation-color" style="background-color:${n.color}" aria-hidden="true"></span>${n.name}</strong><small>${cash(n.daily)} / 日 · 税 ${n.tax * 100}%</small></div><button data-action="license" data-id="${id}" ${state.licenses.includes(id) || state.cash < n.fee || state.gameOver ? 'disabled' : ''}>${state.licenses.includes(id) ? '✓ ' + t('owned') : cash(n.fee) + ' 取得'}</button></div>`).join('')}</section>
  <section class="panel"><p class="eyebrow">THE SHIPYARD</p><h2>船を購入</h2><p class="small muted">購入した船は共通の未使用船として保有し、任意のルートに配置できます。</p>${Object.entries(SHIPS).map(([id, v]) => `<div class="ship-offer"><div class="section-top"><h3>♧ ${v.name}</h3><strong>${cash(v.price)}</strong></div><p class="small muted">${t('capacity')} ${v.capacity} · ${t('range')} ${money(v.range)}海里<br>${t('speed')} ${v.speed}海里/日 · ${t('upkeep')} ${cash(v.daily)} / 日</p><button class="full" data-action="buy" data-id="${id}" ${state.cash < v.price || state.gameOver ? 'disabled' : ''}>${v.name}を${t('buy')}</button></div>`).join('')}<p class="small muted">未使用船にも維持費がかかります。</p>${state.ships.filter(s => !s.routeId).map(s => `<p class="small">⚓ ${SHIPS[s.type].name} #${s.id.split('-')[1]} · 未使用</p>`).join('')}</section>
  </aside></div>
  <footer>${t('footer')}<br><a href="Architecture.md" target="_blank">Architecture</a> · <a href="ImplementationNote.md" target="_blank">Implementation notes</a> · <a href="ExternalLibrary.md" target="_blank">Libraries & licenses</a></footer></main>
  ${creating ? `<dialog aria-labelledby="create-title">${setup()}</dialog>` : ''}
  ${editing ? `<dialog aria-labelledby="edit-title"><form id="edit-form"><h2 id="edit-title">${t('policy')}</h2>${policyFields(state.routes.find(r => r.id === editing))}<p class="small muted">航行中の積み荷は変更せず、次回出港時から適用します。</p><div class="buttons"><button class="primary">${t('apply')}</button><button type="button" data-action="cancel">${t('cancel')}</button></div></form></dialog>` : ''}
  ${confirmation ? `<dialog aria-labelledby="confirm-title"><h2 id="confirm-title">${confirmation === 'load' ? t('load') : t('reset')}</h2><p class="small">${t(confirmation === 'load' ? 'loadConfirm' : 'resetConfirm')}</p><div class="buttons"><button data-action="cancel" autofocus>キャンセル</button><button class="primary" data-action="confirm">${confirmation === 'load' ? '保存データを読み込む' : '新しい会社を設立'}</button></div></dialog>` : ''}`;
  // Preserve time controls so a daily update cannot close the speed selector
  // or steal focus from the pause button.
  if (app.querySelector('header')) {
    app.querySelector('.time').replaceWith(view.content.querySelector('.time'));
    const play = app.querySelector('[data-action="play"]');
    play.textContent = running ? 'Ⅱ ' + t('pause') : '▶ ' + t('play'); play.disabled = state.gameOver;
    app.querySelector('#speed').value = String(speed);
    app.querySelector('main').replaceWith(view.content.querySelector('main'));
    app.querySelectorAll('dialog').forEach(dialog => dialog.remove());
    app.append(...view.content.querySelectorAll('dialog'));
  } else app.append(view.content);
  const dialog = app.querySelector('dialog');
  if (dialog) {
    dialog.showModal();
    dialog.addEventListener('cancel', e => { e.preventDefault(); creating = false; editing = null; confirmation = null; pendingRestore = null; render(); focusRoute(); });
  }
  if (restoreFocus) {
    const elements = [...(document.getElementById(restoreFocus.form)?.elements || [])];
    const el = elements.find(e => e.name === restoreFocus.name && (e.type !== 'checkbox' || e.value === restoreFocus.value)); el?.focus();
  }
  animateTime();
}
function readDraft(form) {
  const data = new FormData(form);
  return { shipId: data.get('ship') ?? draft.shipId, a: data.get('from'), b: data.get('to'), margin: data.has('margin') ? Number(data.get('margin')) : draft.margin, allowed: data.has('margin') ? data.getAll('good') : draft.allowed };
}
app.addEventListener('input', e => {
  if (e.target.closest('#route-form')) {
    draft = readDraft(document.querySelector('#route-form'));
    const estimateEl = document.querySelector('#route-estimate');
    if (estimateEl) estimateEl.textContent = estimate(state.ships.find(s => s.id === draft.shipId)?.type, draft.a, draft.b);
  }
});
app.addEventListener('change', e => {
  if (e.target.id === 'speed') { const nextSpeed = Number(e.target.value), days = advanceTime(performance.now()); speed = nextSpeed; if (days) render(); }
  if (e.target.closest('#route-form') && ['from', 'to'].includes(e.target.name)) { draft = readDraft(e.target.form); render(); }
});
app.addEventListener('submit', e => {
  e.preventDefault();
  try {
    if (e.target.id === 'route-form') {
      draft = readDraft(e.target);
      const route = findRoute(draft.a, draft.b) ?? setRoute(state, draft.shipId, draft.a, draft.b, draft.allowed, draft.margin);
      selectedRoute = route.id; creating = false;
      notice('ルート情報を表示しました。船の追加はここから行えます。');
    }
    if (e.target.matches('.assign-form')) { assignShip(state, e.target.dataset.route, new FormData(e.target).get('ship')); notice('船を追加し、出港間隔を再調整しました。'); }
    if (e.target.id === 'edit-form') { const data = new FormData(e.target); updateRoute(state, editing, data.getAll('good'), Number(data.get('margin'))); editing = null; }
    render();
    if (e.target.id === 'route-form') focusRoute();
  } catch (error) { notice(error.message); }
});
app.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drag) { cancelDrag(); return; }
  if (!['Enter', ' '].includes(e.key)) return;
  const control = e.target.closest('[data-city], .ship-marker');
  if (control) { e.preventDefault(); control.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
app.addEventListener('click', e => {
  if (suppressPortClick) { suppressPortClick = false; return; }
  const port = e.target.closest('[data-city]'); if (port) { selectedCity = port.dataset.city; render(); return; }
  const button = e.target.closest('[data-action]'); if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'buy') buyShip(state, id);
    if (action === 'license') buyLicense(state, id);
    if (action === 'toggle') toggleRoute(state, id);
    if (action === 'release') removeRoute(state, id);
    if (action === 'release-ship') releaseShip(state, id);
    if (action === 'select-route') { pauseTime(); selectedRoute = id; }
    if (action === 'new-route') { pauseTime(); creating = true; }
    if (action === 'edit') { pauseTime(); editing = id; }
    if (action === 'cancel') { creating = false; editing = null; confirmation = null; pendingRestore = null; }
    if (action === 'play') { advanceTime(performance.now()); running = !running && !state.gameOver; }
    if (action === 'save') {
      try { localStorage.setItem(SAVE_KEY, serialize(state)); notice(t('saved')); } catch { notice(t('storageError')); }
    }
    if (action === 'load') {
      pauseTime();
      let raw; try { raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY); } catch { throw new Error(t('storageError')); }
      if (!raw) throw new Error(t('noSave'));
      pendingRestore = deserialize(raw); pendingMigration = JSON.parse(raw).version === 1; confirmation = 'load';
    }
    if (action === 'reset') { pauseTime(); confirmation = 'reset'; }
    if (action === 'confirm') {
      if (confirmation === 'load') { state = pendingRestore; notice(pendingMigration ? '旧セーブを復元し、同じ経路を統合しました。最初のルートの積載条件を引き継ぎ、停止中の船がある経路は全体を停止しています。旧セーブは保持しています。' : t('loaded')); }
      if (confirmation === 'reset') { state = createGame(); selectedCity = 'kingston'; }
      clock.reset(); selectedRoute = null; creating = false; editing = null; confirmation = null; pendingRestore = null;
    }
    render();
    if (['select-route', 'cancel'].includes(action)) focusRoute();
  } catch (error) { notice(error.message); }
});
function mapPoint(svg, event) {
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return { x: point.x, y: point.y };
}
function dropCity(event) {
  const port = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-city]');
  if (port) return port.dataset.city;
  const svg = drag.svg, point = mapPoint(svg, event);
  const tolerance = Math.max(18, 12 * 900 / svg.getBoundingClientRect().width);
  return Object.entries(CITIES).find(([, city]) => Math.hypot(city.x - point.x, city.y - point.y) <= tolerance)?.[0] ?? null;
}
function cancelDrag() {
  if (!drag) return;
  const { svg, pointerId } = drag;
  drag = null;
  if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
  svg.querySelector('#route-drag-preview').setAttribute('hidden', '');
  svg.querySelector('#route-drag-label').setAttribute('hidden', '');
  svg.querySelectorAll('.drop-target').forEach(port => port.classList.remove('drop-target'));
}
app.addEventListener('pointerdown', event => {
  // Freeze moving targets before mouse-up, including at 16x speed.
  if (event.target.closest('[data-action]') && !event.target.closest('header')) pauseTime();
  const port = event.target.closest('[data-city]');
  if (!port || event.button !== 0 || !event.isPrimary) return;
  pauseTime();
  const svg = port.closest('svg');
  drag = { svg, pointerId: event.pointerId, a: port.dataset.city, x: event.clientX, y: event.clientY, moved: false };
  svg.setPointerCapture(event.pointerId);
});
app.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6) drag.moved = true;
  if (!drag.moved) return;
  event.preventDefault();
  const b = dropCity(event), city = CITIES[drag.a], target = CITIES[b] ?? mapPoint(drag.svg, event);
  const line = drag.svg.querySelector('#route-drag-preview');
  for (const [key, value] of Object.entries({ x1: city.x, y1: city.y, x2: target.x, y2: target.y })) line.setAttribute(key, value);
  line.removeAttribute('hidden');
  const label = drag.svg.querySelector('#route-drag-label');
  label.textContent = b && b !== drag.a ? `${city.name} ⇄ ${CITIES[b].name} · ${findRoute(drag.a, b) ? 'ルート情報を表示' : '新規ルートを設定'}` : '終点都市で離してください';
  label.removeAttribute('hidden');
  drag.svg.querySelectorAll('[data-city]').forEach(port => port.classList.toggle('drop-target', port.dataset.city === b && b !== drag.a));
});
app.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { a, moved } = drag, b = dropCity(event);
  cancelDrag();
  if (moved) {
    suppressPortClick = true; setTimeout(() => { suppressPortClick = false; }, 0);
    if (b && b !== a) selectConnection(a, b);
    else notice('異なる都市までドラッグして離すと、ルートを選択できます。');
  } else { selectedCity = a; render(); }
});
app.addEventListener('pointercancel', cancelDrag);
app.addEventListener('lostpointercapture', cancelDrag);

function advanceTime(now) {
  const days = clock.advance(now, running, speed, () => { tick(state); return !state.gameOver; });
  if (state.gameOver) running = false;
  return days;
}
function pauseTime() {
  running = false;
  // Synchronize the timestamp without consuming paused wall time.
  clock.advance(performance.now(), false, speed, () => {});
  const button = app.querySelector('[data-action="play"]');
  if (button) button.textContent = '▶ ' + t('play');
  const status = app.querySelector('#time-status');
  if (status) status.textContent = '一時停止中';
}
app.addEventListener('focusin', e => { if (e.target.closest('form')) pauseTime(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelDrag(); pauseTime(); } });
function frame(now) {
  if (advanceTime(now)) render();
  animateTime();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);
