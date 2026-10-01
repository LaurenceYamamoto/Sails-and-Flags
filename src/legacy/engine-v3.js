import { GOODS, CITIES, NATIONS, SHIPS, distance, daysFor } from '../data.js';
import { deserialize as readLegacy } from './engine-v2.js';
export const SAVE_VERSION = 3;
export const MAX_STOPS = 12;
// The closing return is implicit; accept it explicitly in route input as well.
export function normalizeStops(stops) {
  return Array.isArray(stops) && stops.length > 1 && stops.at(-1) === stops[0] ? stops.slice(0,-1) : stops;
}
const stopIndex = (route, ship) => ship.nextStop ?? route.stops.indexOf(ship.nextFrom);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function price(good, stock) { return GOODS.find(g => g.id === good).base * (0.35 + 180 / (stock + 60)); }
// Antiderivative of the price curve: additive over adjacent inventory intervals.
function integral(good, low, high) {
  return GOODS.find(g => g.id === good).base * (0.35 * (high - low) + 180 * Math.log((high + 60) / (low + 60)));
}
export function quote(good, stock, quantity, side) {
  check(finite(stock) && stock >= 0 && finite(quantity) && quantity >= 0, '在庫・数量が不正です。');
  check(GOODS.some(g => g.id === good) && ['buy', 'sell'].includes(side), '売買条件が不正です。');
  const q = side === 'buy' ? Math.min(quantity, stock) : quantity;
  return { quantity: q, value: side === 'buy' ? integral(good, stock - q, stock) : integral(good, stock, stock + q) };
}
export function createGame(seed = 1700) {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const markets = Object.fromEntries(Object.entries(CITIES).map(([id, c]) => [id, Object.fromEntries(GOODS.map((g, i) => [g.id, { stock: c.stocks[i] * (0.98 + random() * 0.04), production: c.supply[i], demand: c.demand[i] }]))]));
  const state = { version: SAVE_VERSION, seed: seed >>> 0, rng, day: 0, cash: 5000, initialCash: 5000, licenses: ['england'], ships: [], routes: [], markets, ledger: [], totals: {}, history: [{ day: 0, cash: 5000, assets: 5000 }], nextId: 1, gameOver: false, competitors: [] };
  state.competitors = createCompetitors(markets);
  return state;
}
function entry(s, category, amount, routeId = null, details = {}) {
  s.cash += amount;
  s.totals[category] = (s.totals[category] || 0) + amount;
  s.ledger.push({ day: s.day, category, amount, routeId, ...details });
  if (s.ledger.length > 600) s.ledger.shift();
  const route = s.routes.find(r => r.id === routeId);
  if (route) {
    route.profit += amount;
    if (amount < 0) route.expenses -= amount;
    else route.revenue += amount;
  }
  if (s.cash < 0) s.gameOver = true;
}
function playing(s) { check(!s.gameOver, '破産後は操作できません。新しいゲームを開始してください。'); }
export function buyLicense(s, nation) {
  playing(s);
  check(NATIONS[nation] && !s.licenses.includes(nation), '取得済み、または無効な免許です。');
  check(s.cash >= NATIONS[nation].fee, '免許の取得資金が不足しています。');
  s.licenses.push(nation); entry(s, 'licensePurchase', -NATIONS[nation].fee, null, { nation });
}
export function buyShip(s, type) {
  playing(s);
  check(s.ships.length < 200, '試作版の保有船上限（200隻）に達しました。');
  check(Object.hasOwn(SHIPS, type), '船種を確認してください。');
  check(s.cash >= SHIPS[type].price, '船の購入資金が不足しています。');
  const ship = { id: `ship-${s.nextId++}`, type, routeId: null, nextFrom: null, readyDay: 0, status: 'idle', voyage: null, cargo: [], voyages: 0 };
  s.ships.push(ship); entry(s, 'shipPurchase', -SHIPS[type].price, null, { shipId: ship.id });
  return ship;
}
export function setRoute(s, shipId, a, b, allowed = GOODS.map(g => g.id), minMargin = 10) {
  return setCircuit(s, shipId, [a,b], allowed, minMargin);
}
export function setCircuit(s, shipId, stops, allowed = GOODS.map(g => g.id), minMargin = 10) {
  playing(s);
  stops = normalizeStops(stops);
  const ship = s.ships.find(v => v.id === shipId);
  check(ship && !ship.routeId && !ship.voyage, '未使用の船を選んでください。');
  validateStops(stops);
  const [a,b] = stops;
  check(stops.every(c => s.licenses.includes(CITIES[c].nation)), '全寄港地の交易免許が必要です。');
  check(routeLegs({stops}).every(([from,to])=>distance(from,to)<=SHIPS[ship.type].range), 'この船の航続距離を超えています。');
  validatePolicy(allowed, minMargin);
  // Rotations share a service; reversing a circuit with 3+ ports changes its direction.
  let route = s.routes.find(r => circuitKey(r.stops) === circuitKey(stops));
  if (!route) {
    route = { id: `route-${s.nextId++}`, a, b, stops:[...stops], allowed: [...allowed], minMargin, active: true, started: s.day, profit: 0, expenses: 0, revenue: 0, deliveries: 0, lastForecast: 0, lastActual: null, scheduleEpoch: s.day + 1 };
    s.routes.push(route);
  }
  assignShip(s, route.id, ship.id);
  return route;
}

function validateStops(stops) { check(Array.isArray(stops) && stops.length >= 2 && stops.length <= MAX_STOPS && stops.every((c,i)=>Object.hasOwn(CITIES,c) && c!==stops[(i+1)%stops.length]), '寄港順は2～12回で指定し、同じ港を連続させないでください。'); }
export function circuitKey(stops) { stops=normalizeStops(stops); return stops.map((_,i)=>[...stops.slice(i),...stops.slice(0,i)].join(':')).sort()[0]; }
export function routeLegs(route) { const stops=normalizeStops(route.stops ?? [route.a,route.b]); return stops.map((from,i)=>[from,stops[(i+1)%stops.length]]); }
export function nextPort(route, from, index=route.stops.indexOf(from)) { return route.stops[(index+1)%route.stops.length]; }
export function routeShips(s, route) { return s.ships.filter(v => v.routeId === route.id); }
export function routeSchedule(s, route) {
  const fleet = routeShips(s, route);
  let cycle=0; const offsets={}, stopOffsets=[];
  for (const [from,to] of routeLegs(route)) { stopOffsets.push(cycle); offsets[from]??=cycle; cycle += Math.max(...fleet.map(v=>daysFor(v.type,from,to)))+1; }
  return { halfCycle: stopOffsets[1], cycle, offsets, stopOffsets, interval: cycle / fleet.length };
}
// One repeating slot per ship at each end. Floor-spaced slots differ by at most
// one day; faster ships wait for their slot rather than catching the slower ones.
export function nextDeparture(s, route, ship, notBefore = s.day + 1) {
  if (!route.active) return null;
  const fleet = routeShips(s, route), { cycle, stopOffsets } = routeSchedule(s, route);
  const index = (stopIndex(route,ship)+(ship.voyage?1:0))%route.stops.length;
  const ready = ship.voyage ? s.day + ship.voyage.remaining + 1 : ship.readyDay;
  const phase = Math.floor(fleet.indexOf(ship) * cycle / fleet.length);
  const first = route.scheduleEpoch + phase + stopOffsets[index];
  return first + Math.max(0, Math.ceil((Math.max(notBefore, ready) - first) / cycle)) * cycle;
}
function reschedule(s, route) {
  const first = routeShips(s, route)[0];
  // Anchor the timetable at the leading ship's next leg. A fleet waiting at B
  // can begin tomorrow instead of wasting an additional half-cycle at startup.
  route.scheduleEpoch = s.day + 1 - routeSchedule(s, route).stopOffsets[stopIndex(route,first)];
}
export function assignShip(s, routeId, shipId) {
  playing(s);
  const route = s.routes.find(r => r.id === routeId), ship = s.ships.find(v => v.id === shipId);
  check(route && ship && ship.routeId === null && !ship.voyage, 'ルートと未使用の船を選んでください。');
  check(routeLegs(route).every(([a,b])=>distance(a,b)<=SHIPS[ship.type].range), 'この船の航続距離を超えています。');
  ship.routeId = route.id; ship.nextFrom = route.a; ship.readyDay = s.day + 1; ship.status = 'ready';
  ship.nextStop = 0;
  reschedule(s, route);
}
function unassign(ship) {
  ship.routeId = null; ship.nextFrom = null; ship.readyDay = 0; ship.status = 'idle';
  delete ship.nextStop;
}
export function releaseShip(s, shipId) {
  playing(s);
  const ship = s.ships.find(v => v.id === shipId);
  check(ship?.routeId && !ship.voyage, '航行中は解除できません。停止して到着を待ってください。');
  const route = s.routes.find(r => r.id === ship.routeId);
  unassign(ship);
  if (routeShips(s, route).length) reschedule(s, route);
  else s.routes = s.routes.filter(r => r.id !== route.id);
}
function validatePolicy(allowed, margin) {
  check(Array.isArray(allowed) && allowed.length > 0 && new Set(allowed).size === allowed.length && allowed.every(id => GOODS.some(g => g.id === id)), '許可品目を1つ以上選んでください。');
  check(finite(margin) && margin >= 0 && margin <= 1000, '最低価格差は0～1000%で指定してください。');
}
export function updateRoute(s, id, allowed, margin) {
  playing(s); validatePolicy(allowed, margin);
  const r = s.routes.find(r => r.id === id); check(r, '航路が存在しません。');
  r.allowed = [...allowed]; r.minMargin = margin;
}
export function toggleRoute(s, id) {
  playing(s); const r = s.routes.find(r => r.id === id); check(r, '航路が存在しません。'); r.active = !r.active;
  if (r.active) reschedule(s, r);
}
export function removeRoute(s, id) {
  playing(s); const r = s.routes.find(r => r.id === id); check(r, '航路が存在しません。');
  const fleet = routeShips(s, r);
  check(fleet.every(v => !v.voyage), '航行中は解除できません。停止して到着を待ってください。');
  fleet.forEach(unassign); s.routes = s.routes.filter(v => v.id !== id);
}
export function trade(s, city, good, requested, side, routeId = null) {
  playing(s); check(CITIES[city] && s.licenses.includes(CITIES[city].nation), '交易免許が必要です。');
  const market = s.markets[city][good]; check(market, '品目が不正です。');
  const rate = NATIONS[CITIES[city].nation].tax;
  let q = quote(good, market.stock, requested, side);
  if (side === 'buy' && q.value * (1 + rate) > s.cash) {
    let low = 0, high = q.quantity;
    for (let i = 0; i < 50; i++) { const mid = (low + high) / 2; if (quote(good, market.stock, mid, side).value * (1 + rate) <= s.cash) low = mid; else high = mid; }
    q = quote(good, market.stock, low, side);
  }
  market.stock += side === 'buy' ? -q.quantity : q.quantity;
  entry(s, side === 'buy' ? 'purchase' : 'sale', (side === 'buy' ? -1 : 1) * q.value, routeId, { city, good, quantity: q.quantity });
  entry(s, 'tax', -q.value * rate, routeId, { city, good });
  return { quantity: q.quantity, total: q.value * (side === 'buy' ? 1 + rate : 1 - rate) };
}
// Exact integer-load search. Suffix DP bounds prune the search; cash remains a hard constraint.
export function optimizeLoad(s, from, to, capacity, budget, allowed, minMargin = 0) {
  const buyTax = 1 + NATIONS[CITIES[from].nation].tax, sellTax = 1 - NATIONS[CITIES[to].nation].tax;
  const options = allowed.map(good => {
    const source = s.markets[from][good].stock, target = s.markets[to][good].stock;
    const values = [{ quantity: 0, cost: 0, profit: 0 }];
    for (let q = 1; q <= Math.min(capacity, Math.floor(source)); q++) {
      const cost = quote(good, source, q, 'buy').value * buyTax;
      const sale = quote(good, target, q, 'sell').value * sellTax;
      const marginalCost = cost - values[q - 1].cost;
      const marginalSale = sale - (values[q - 1].profit + values[q - 1].cost);
      if (marginalSale <= marginalCost || (marginalSale / marginalCost - 1) * 100 + 1e-9 < minMargin) break;
      values.push({ quantity: q, cost, profit: sale - cost });
    }
    return { good, values };
  });
  const bounds = Array.from({ length: options.length + 1 }, () => Array(capacity + 1).fill(0));
  for (let i = options.length - 1; i >= 0; i--) for (let room = 0; room <= capacity; room++) {
    bounds[i][room] = Math.max(...options[i].values.filter(o => o.quantity <= room).map(o => o.profit + bounds[i + 1][room - o.quantity]));
  }
  // A fractional cash-only knapsack is another admissible upper bound. This
  // prevents expensive enumeration when all goods are profitable but cash is low.
  const cashBounds = options.map((_, index) => {
    const units = options.slice(index).flatMap(({ values }) => values.slice(1).map((v, i) => ({ cost: v.cost - values[i].cost, profit: v.profit - values[i].profit }))).sort((a, b) => b.profit / b.cost - a.profit / a.cost);
    const prefix = [{ cost: 0, profit: 0 }];
    for (const unit of units) { const last = prefix.at(-1); prefix.push({ cost: last.cost + unit.cost, profit: last.profit + unit.profit }); }
    return { units, prefix };
  });
  function cashBound(i, available) {
    if (i === options.length) return 0;
    const { units, prefix } = cashBounds[i];
    let low = 0, high = units.length;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (prefix[mid].cost <= available) low = mid; else high = mid - 1; }
    return prefix[low].profit + (low < units.length ? (available - prefix[low].cost) * units[low].profit / units[low].cost : 0);
  }
  let best = { profit: 0, cost: 0, cargo: [] };
  function search(i, room, cost, profit, cargo) {
    if (profit + Math.min(bounds[i][room], cashBound(i, budget - cost)) <= best.profit + 1e-9) return;
    if (i === options.length) { best = { profit, cost, cargo }; return; }
    const { good, values } = options[i];
    const candidates = values.filter(o => o.quantity <= room && cost + o.cost <= budget).sort((a, b) => b.profit + bounds[i + 1][room - b.quantity] - a.profit - bounds[i + 1][room - a.quantity]);
    for (const o of candidates) search(i + 1, room - o.quantity, cost + o.cost, profit + o.profit, o.quantity ? [...cargo, { good, quantity: o.quantity }] : cargo);
  }
  search(0, capacity, 0, 0, []); return best;
}
function depart(s, ship, route) {
  const from = ship.nextFrom, index=stopIndex(route,ship), to = nextPort(route, from, index);
  const days = daysFor(ship.type, from, to);
  const daily = s.ships.reduce((sum, v) => sum + SHIPS[v.type].daily, 0) + s.licenses.reduce((sum, n) => sum + NATIONS[n].daily, 0);
  const reserve = daily * (days + 1);
  const load = optimizeLoad(s, from, to, SHIPS[ship.type].capacity, Math.max(0, s.cash - reserve), route.allowed, route.minMargin);
  if (!load.cargo.length || load.profit <= SHIPS[ship.type].daily * days) {
    const futureLegs = routeLegs(route).filter((_,i)=>i!==index);
    const profitableLater = futureLegs.some(([a,b])=>optimizeLoad(s,a,b,SHIPS[ship.type].capacity,Math.max(0,s.cash-reserve*2),route.allowed,route.minMargin).profit > SHIPS[ship.type].daily * (days+daysFor(ship.type,a,b)));
    if (!profitableLater) { ship.status = 'waiting'; return; }
    load.cargo = []; load.cost = 0; load.profit = 0;
  }
  ship.cargo = load.cargo.map(item => ({ ...item, ...trade(s, from, item.good, item.quantity, 'buy', route.id) }));
  route.lastForecast = load.profit - SHIPS[ship.type].daily * days;
  ship.voyage = { from, to, remaining: days, total: days, cost: load.cost, forecast: route.lastForecast };
  ship.status = ship.cargo.length ? 'sailing' : 'empty';
}
export function tick(s, { updateMarkets = true, runCompetitors = true } = {}) {
  if (s.gameOver) return;
  s.day++;
  if (updateMarkets) for (const city of Object.values(s.markets)) for (const [good, m] of Object.entries(city)) {
    m.stock += m.production;
    const base = GOODS.find(g => g.id === good).base;
    const consumption = m.demand * Math.max(0.25, Math.min(3, base / price(good, m.stock)));
    m.stock = Math.max(0, m.stock - consumption);
  }
  for (const n of s.licenses) { entry(s, 'licenseDaily', -NATIONS[n].daily, null, { nation: n }); if (s.gameOver) return; }
  for (const ship of s.ships) {
    entry(s, 'upkeep', -SHIPS[ship.type].daily, ship.routeId, { shipId: ship.id });
    if (s.gameOver) return;
  }
  for (const ship of s.ships) {
    const route = s.routes.find(r => r.id === ship.routeId);
    if (!route) continue;
    if (ship.voyage) {
      ship.voyage.remaining--;
      if (ship.voyage.remaining === 0) {
        let revenue = 0;
        for (const item of ship.cargo) revenue += trade(s, ship.voyage.to, item.good, item.quantity, 'sell', route.id).total;
        route.lastActual = revenue - ship.voyage.cost - ship.voyage.total * SHIPS[ship.type].daily;
        ship.nextStop = (stopIndex(route,ship)+1)%route.stops.length;
        route.deliveries++; ship.voyages++; ship.nextFrom = ship.voyage.to; ship.voyage = null; ship.cargo = []; ship.status = 'ready'; ship.readyDay = s.day + 1;
      }
      // One day in port after arrival. No duplicate sale/departure in the same tick.
    } else if (route.active && nextDeparture(s, route, ship, s.day) === s.day) depart(s, ship, route);
  }
  if (runCompetitors) for (const competitor of s.competitors ?? []) {
    competitor.markets = s.markets;
    tick(competitor, {updateMarkets:false,runCompetitors:false});
  }
  s.history.push({ day: s.day, cash: s.cash, assets: assets(s) });
  if (s.history.length > 365) s.history.shift();
}
export function assets(s) {
  return s.cash + s.ships.reduce((sum, ship) => sum + SHIPS[ship.type].price + ship.cargo.reduce((v, c) => v + c.total, 0), 0);
}
export function operatingProfit(s) { return ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily'].reduce((sum, key) => sum + (s.totals[key] || 0), 0); }
function createCompetitors(markets) {
  return [['Channel Company',['nantes','amsterdam']],['Antilles Company',['santiago','sanjuan']]].map(([name,stops])=>{
    const company={version:SAVE_VERSION,name,seed:1700,rng:1700,day:0,cash:5000,initialCash:5000,licenses:[...new Set(stops.map(c=>CITIES[c].nation))],ships:[],routes:[],markets,ledger:[],totals:{},history:[],nextId:1,gameOver:false,competitors:[]};
    const ship=buyShip(company,'sloop'); setCircuit(company,ship.id,stops);
    return company;
  });
}
export function serialize(s) { return JSON.stringify(s, (key,value)=>key==='competitors' ? value.map(({markets,...company})=>company) : value); }
export function deserialize(raw, nested = false) {
  check(typeof raw === 'string' && raw.length <= 5_000_000, 'セーブデータが大きすぎます。');
  const s = JSON.parse(raw);
  if (s && [1,2].includes(s.version) && !nested) {
    const old=readLegacy(raw), expanded=createGame(old.seed);
    for (const [city,goods] of Object.entries(old.markets)) Object.assign(expanded.markets[city],goods);
    const migrated={...old,version:SAVE_VERSION,markets:expanded.markets,competitors:expanded.competitors};
    for (const r of migrated.routes) r.stops=[r.a,r.b];
    for (const c of migrated.competitors) { c.day=migrated.day; for(const ship of c.ships) ship.readyDay=c.day+1; for(const route of c.routes) {route.started=c.day;route.scheduleEpoch=c.day+1;} }
    return deserialize(serialize(migrated));
  }
  check(s && s.version === SAVE_VERSION, '対応していないセーブ形式です。');

  check(Number.isSafeInteger(s.day) && s.day >= 0 && finite(s.cash) && s.initialCash === 5000 && typeof s.gameOver === 'boolean' && s.gameOver === (s.cash < 0), '会社情報が不正です。');
  check(Number.isSafeInteger(s.nextId) && s.nextId > 0 && Number.isInteger(s.seed) && Number.isInteger(s.rng), '識別子・シードが不正です。');
  check(Array.isArray(s.licenses) && new Set(s.licenses).size === s.licenses.length && s.licenses.every(n => Object.hasOwn(NATIONS, n)), '免許が不正です。');
  check(s.markets && Object.keys(s.markets).length === Object.keys(CITIES).length && Object.keys(s.markets).every(id => Object.hasOwn(CITIES,id)), '市場データが不正です。');
  for (const market of Object.values(s.markets)) check(market && Object.keys(market).length===GOODS.length && Object.keys(market).every(id=>GOODS.some(g=>g.id===id)), '市場データが不正です。');
  for (const id of Object.keys(CITIES)) for (const g of GOODS) {
    const m = s.markets?.[id]?.[g.id]; check(m && ['stock', 'production', 'demand'].every(k => finite(m[k]) && m[k] >= 0), '市場データが不正です。');
  }
  check(Array.isArray(s.ships) && Array.isArray(s.routes) && s.ships.length <= 200 && s.routes.length <= 200, '船・航路の数が不正です。');
  const ids = [...s.ships, ...s.routes].map(v => v.id);
  check(ids.every(id => /^(ship|route)-[1-9]\d*$/.test(id) && Number(id.split('-')[1]) < s.nextId) && new Set(ids).size === ids.length, '識別子が重複または不正です。');
  for (const r of s.routes) {
    validatePolicy(r.allowed, r.minMargin);
    validateStops(r.stops);
    check(r.a===r.stops[0] && r.b===r.stops[1] && r.stops.every(c => s.licenses.includes(CITIES[c].nation)), '航路の港・免許が不正です。');
    check(typeof r.active === 'boolean' && ['profit', 'expenses', 'revenue', 'lastForecast', 'started', 'deliveries'].every(k => finite(r[k])) && (r.lastActual === null || finite(r.lastActual)), '航路の収支が不正です。');
    const fleet = routeShips(s, r);
    check(fleet.length > 0 && fleet.every(v => SHIPS[v.type] && routeLegs(r).every(([a,b])=>distance(a,b) <= SHIPS[v.type].range)), '航路と船の対応が不正です。');
    check(!Object.hasOwn(r, 'shipId') && Number.isSafeInteger(r.scheduleEpoch) && r.scheduleEpoch >= 1 - Math.max(...routeSchedule(s, r).stopOffsets) && r.scheduleEpoch <= s.day + 1, '運航時刻表が不正です。');
  }
  check(new Set(s.routes.map(r => circuitKey(r.stops))).size === s.routes.length, '同じ経路が重複しています。');
  for (const v of s.ships) {
    check(Object.hasOwn(SHIPS, v.type) && Array.isArray(v.cargo) && Number.isInteger(v.voyages) && v.voyages >= 0, '船が不正です。');
    const r = s.routes.find(r => r.id === v.routeId);
    check(!Object.hasOwn(v, 'city') && Number.isSafeInteger(v.readyDay) && v.readyDay >= 0 && v.readyDay <= s.day + 1, '船の運航状態が不正です。');
    check(v.routeId === null ? v.nextFrom === null && v.status === 'idle' && v.readyDay === 0 : r && r.stops.includes(v.nextFrom) && ['ready', 'waiting', 'sailing', 'empty'].includes(v.status), '船の割当が不正です。');
    // Old v3 saves had unique ports, so their cursor is unambiguous. Revisited
    // ports require an explicit cursor; never guess which occurrence was saved.
    check(v.nextStop === undefined ? !r || new Set(r.stops).size===r.stops.length : r && Number.isInteger(v.nextStop) && v.nextStop>=0 && v.nextStop<r.stops.length && r.stops[v.nextStop]===v.nextFrom, '船の寄港順が不正です。');
    check(v.voyage ? ['sailing', 'empty'].includes(v.status) : !['sailing', 'empty'].includes(v.status), '船の航行状態が不正です。');
    check(v.cargo.every(c => GOODS.some(g => g.id === c.good) && finite(c.quantity) && c.quantity > 0 && finite(c.total) && c.total >= 0) && new Set(v.cargo.map(c => c.good)).size === v.cargo.length && v.cargo.reduce((sum, c) => sum + c.quantity, 0) <= SHIPS[v.type].capacity + 1e-8, '積み荷が不正です。');
    if (v.voyage) {
      const w = v.voyage;
      check(r && w.from === v.nextFrom && nextPort(r,w.from,stopIndex(r,v))===w.to && w.total === daysFor(v.type, w.from, w.to) && Number.isInteger(w.remaining) && w.remaining > 0 && w.remaining <= w.total && finite(w.cost) && w.cost >= 0 && finite(w.forecast), '航海データが不正です。');
    } else check(v.cargo.length === 0, '停泊中の積み荷が不正です。');
  }
  const categories = ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily', 'licensePurchase', 'shipPurchase'];
  check(s.totals && Object.entries(s.totals).every(([k, v]) => categories.includes(k) && finite(v)), '会計集計が不正です。');
  check(Math.abs(s.initialCash + Object.values(s.totals).reduce((a, b) => a + b, 0) - s.cash) < 0.001, '会計残高が一致しません。');
  check(Array.isArray(s.ledger) && s.ledger.length <= 600 && s.ledger.every(e => categories.includes(e.category) && finite(e.amount) && Number.isInteger(e.day) && e.day >= 0 && e.day <= s.day && (e.routeId === null || /^route-[1-9]\d*$/.test(e.routeId)) && (!e.city || Object.hasOwn(CITIES, e.city)) && (!e.good || GOODS.some(g => g.id === e.good)) && (e.quantity === undefined || finite(e.quantity) && e.quantity >= 0)), '取引履歴が不正です。');
  check(s.ledger.every(e => (e.shipId===undefined || typeof e.shipId==='string' && /^ship-[1-9]\d*$/.test(e.shipId)) && (e.nation===undefined || Object.hasOwn(NATIONS,e.nation))), '取引履歴が不正です。');
  check(Array.isArray(s.history) && s.history.length <= 365 && s.history.every(h => finite(h.cash) && finite(h.assets) && Number.isInteger(h.day) && h.day >= 0 && h.day <= s.day), '資産履歴が不正です。');

  check(Array.isArray(s.competitors) && s.competitors.length <= 2 && (!nested || s.competitors.length===0), '競合データが不正です。');
  for (let i=0;i<s.competitors.length;i++) {
    const c=s.competitors[i]; check(typeof c.name==='string' && c.name.length<=80 && c.day<=s.day && (s.gameOver || c.gameOver || c.day===s.day), '競合情報が不正です。');
    c.markets=s.markets; s.competitors[i]=deserialize(JSON.stringify(c),true); s.competitors[i].markets=s.markets;
  }
  return s;
}
