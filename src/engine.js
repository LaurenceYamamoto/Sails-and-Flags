import { GOODS, CITIES, NATIONS, SHIPS, distance, daysFor } from './data.js';
export const SAVE_VERSION = 2;
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
  return { version: SAVE_VERSION, seed: seed >>> 0, rng, day: 0, cash: 5000, initialCash: 5000, licenses: ['england'], ships: [], routes: [], markets, ledger: [], totals: {}, history: [{ day: 0, cash: 5000, assets: 5000 }], nextId: 1, gameOver: false };
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
  playing(s);
  const ship = s.ships.find(v => v.id === shipId);
  check(ship && !ship.routeId && !ship.voyage, '未使用の船を選んでください。');
  check(Object.hasOwn(CITIES, a) && Object.hasOwn(CITIES, b) && a !== b, '異なる2港を選んでください。');
  check([a, b].every(c => s.licenses.includes(CITIES[c].nation)), '両方の港の交易免許が必要です。');
  check(distance(a, b) <= SHIPS[ship.type].range, 'この船の航続距離を超えています。');
  validatePolicy(allowed, minMargin);
  // Both directions belong to the same service. Existing policy always wins.
  let route = s.routes.find(r => routeKey(r.a, r.b) === routeKey(a, b));
  if (!route) {
    route = { id: `route-${s.nextId++}`, a, b, allowed: [...allowed], minMargin, active: true, started: s.day, profit: 0, expenses: 0, revenue: 0, deliveries: 0, lastForecast: 0, lastActual: null, scheduleEpoch: s.day + 1 };
    s.routes.push(route);
  }
  assignShip(s, route.id, ship.id);
  return route;
}
const routeKey = (a, b) => [a, b].sort().join(':');
export function routeShips(s, route) { return s.ships.filter(v => v.routeId === route.id); }
export function routeSchedule(s, route) {
  const fleet = routeShips(s, route);
  const halfCycle = Math.max(...fleet.map(v => daysFor(v.type, route.a, route.b))) + 1;
  return { halfCycle, cycle: halfCycle * 2, interval: halfCycle * 2 / fleet.length };
}
// One repeating slot per ship at each end. Floor-spaced slots differ by at most
// one day; faster ships wait for their slot rather than catching the slower ones.
export function nextDeparture(s, route, ship, notBefore = s.day + 1) {
  if (!route.active) return null;
  const fleet = routeShips(s, route), { cycle, halfCycle } = routeSchedule(s, route);
  const from = ship.voyage?.to ?? ship.nextFrom;
  const ready = ship.voyage ? s.day + ship.voyage.remaining + 1 : ship.readyDay;
  const phase = Math.floor(fleet.indexOf(ship) * cycle / fleet.length);
  const first = route.scheduleEpoch + phase + (from === route.b ? halfCycle : 0);
  return first + Math.max(0, Math.ceil((Math.max(notBefore, ready) - first) / cycle)) * cycle;
}
function reschedule(s, route) {
  const first = routeShips(s, route)[0];
  // Anchor the timetable at the leading ship's next leg. A fleet waiting at B
  // can begin tomorrow instead of wasting an additional half-cycle at startup.
  route.scheduleEpoch = s.day + 1 - (first.nextFrom === route.b ? routeSchedule(s, route).halfCycle : 0);
}
export function assignShip(s, routeId, shipId) {
  playing(s);
  const route = s.routes.find(r => r.id === routeId), ship = s.ships.find(v => v.id === shipId);
  check(route && ship && ship.routeId === null && !ship.voyage, 'ルートと未使用の船を選んでください。');
  check(distance(route.a, route.b) <= SHIPS[ship.type].range, 'この船の航続距離を超えています。');
  ship.routeId = route.id; ship.nextFrom = route.a; ship.readyDay = s.day + 1; ship.status = 'ready';
  reschedule(s, route);
}
function unassign(ship) {
  ship.routeId = null; ship.nextFrom = null; ship.readyDay = 0; ship.status = 'idle';
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
  const from = ship.nextFrom, to = from === route.a ? route.b : route.a;
  const days = daysFor(ship.type, from, to);
  const daily = s.ships.reduce((sum, v) => sum + SHIPS[v.type].daily, 0) + s.licenses.reduce((sum, n) => sum + NATIONS[n].daily, 0);
  const reserve = daily * (days + 1);
  const load = optimizeLoad(s, from, to, SHIPS[ship.type].capacity, Math.max(0, s.cash - reserve), route.allowed, route.minMargin);
  if (!load.cargo.length || load.profit <= SHIPS[ship.type].daily * days) {
    const reverse = optimizeLoad(s, to, from, SHIPS[ship.type].capacity, Math.max(0, s.cash - reserve * 2), route.allowed, route.minMargin);
    if (reverse.profit <= SHIPS[ship.type].daily * days * 2) { ship.status = 'waiting'; return; }
    load.cargo = []; load.cost = 0; load.profit = 0;
  }
  ship.cargo = load.cargo.map(item => ({ ...item, ...trade(s, from, item.good, item.quantity, 'buy', route.id) }));
  route.lastForecast = load.profit - SHIPS[ship.type].daily * days;
  ship.voyage = { from, to, remaining: days, total: days, cost: load.cost, forecast: route.lastForecast };
  ship.status = ship.cargo.length ? 'sailing' : 'empty';
}
export function tick(s) {
  if (s.gameOver) return;
  s.day++;
  for (const city of Object.values(s.markets)) for (const [good, m] of Object.entries(city)) {
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
        route.deliveries++; ship.voyages++; ship.nextFrom = ship.voyage.to; ship.voyage = null; ship.cargo = []; ship.status = 'ready'; ship.readyDay = s.day + 1;
      }
      // One day in port after arrival. No duplicate sale/departure in the same tick.
    } else if (route.active && nextDeparture(s, route, ship, s.day) === s.day) depart(s, ship, route);
  }
  s.history.push({ day: s.day, cash: s.cash, assets: assets(s) });
  if (s.history.length > 365) s.history.shift();
}
export function assets(s) {
  return s.cash + s.ships.reduce((sum, ship) => sum + SHIPS[ship.type].price + ship.cargo.reduce((v, c) => v + c.total, 0), 0);
}
export function operatingProfit(s) { return ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily'].reduce((sum, key) => sum + (s.totals[key] || 0), 0); }
export function serialize(s) { return JSON.stringify(s); }
export function deserialize(raw) {
  check(typeof raw === 'string' && raw.length <= 5_000_000, 'セーブデータが大きすぎます。');
  const s = JSON.parse(raw);
  check(s && [1, SAVE_VERSION].includes(s.version), '対応していないセーブ形式です。');
  const legacy = s.version === 1;
  check(Number.isSafeInteger(s.day) && s.day >= 0 && finite(s.cash) && s.initialCash === 5000 && typeof s.gameOver === 'boolean' && s.gameOver === (s.cash < 0), '会社情報が不正です。');
  check(Number.isSafeInteger(s.nextId) && s.nextId > 0 && Number.isInteger(s.seed) && Number.isInteger(s.rng), '識別子・シードが不正です。');
  check(Array.isArray(s.licenses) && new Set(s.licenses).size === s.licenses.length && s.licenses.every(n => Object.hasOwn(NATIONS, n)), '免許が不正です。');
  for (const id of Object.keys(CITIES)) for (const g of GOODS) {
    const m = s.markets?.[id]?.[g.id]; check(m && ['stock', 'production', 'demand'].every(k => finite(m[k]) && m[k] >= 0), '市場データが不正です。');
  }
  check(Array.isArray(s.ships) && Array.isArray(s.routes) && s.ships.length <= 200 && s.routes.length <= 200, '船・航路の数が不正です。');
  const ids = [...s.ships, ...s.routes].map(v => v.id);
  check(ids.every(id => /^(ship|route)-[1-9]\d*$/.test(id) && Number(id.split('-')[1]) < s.nextId) && new Set(ids).size === ids.length, '識別子が重複または不正です。');
  for (const r of s.routes) {
    validatePolicy(r.allowed, r.minMargin);
    check(Object.hasOwn(CITIES, r.a) && Object.hasOwn(CITIES, r.b) && r.a !== r.b && [r.a, r.b].every(c => s.licenses.includes(CITIES[c].nation)), '航路の港・免許が不正です。');
    check(typeof r.active === 'boolean' && ['profit', 'expenses', 'revenue', 'lastForecast', 'started', 'deliveries'].every(k => finite(r[k])) && (r.lastActual === null || finite(r.lastActual)), '航路の収支が不正です。');
    if (legacy) {
      check(['ready', 'waiting', 'sailing', 'empty'].includes(r.status), '航路の状態が不正です。');
      const ship = s.ships.find(v => v.id === r.shipId);
      check(ship && ship.routeId === r.id && SHIPS[ship.type] && distance(r.a, r.b) <= SHIPS[ship.type].range, '航路と船の対応が不正です。');
    } else {
      const fleet = routeShips(s, r);
      check(fleet.length > 0 && fleet.every(v => SHIPS[v.type] && distance(r.a, r.b) <= SHIPS[v.type].range), '航路と船の対応が不正です。');
      check(!Object.hasOwn(r, 'shipId') && Number.isSafeInteger(r.scheduleEpoch) && r.scheduleEpoch >= 1 - routeSchedule(s, r).halfCycle && r.scheduleEpoch <= s.day + 1, '運航時刻表が不正です。');
    }
  }
  if (!legacy) check(new Set(s.routes.map(r => routeKey(r.a, r.b))).size === s.routes.length, '同じ経路が重複しています。');
  for (const v of s.ships) {
    check(Object.hasOwn(SHIPS, v.type) && Array.isArray(v.cargo) && Number.isInteger(v.voyages) && v.voyages >= 0, '船が不正です。');
    const r = s.routes.find(r => r.id === v.routeId);
    if (legacy) {
      check(Object.hasOwn(CITIES, v.city) && (v.routeId === null || (r && r.shipId === v.id && [r.a, r.b].includes(v.city))), '船の割当が不正です。');
    } else {
      check(!Object.hasOwn(v, 'city') && Number.isSafeInteger(v.readyDay) && v.readyDay >= 0 && v.readyDay <= s.day + 1, '船の運航状態が不正です。');
      check(v.routeId === null ? v.nextFrom === null && v.status === 'idle' && v.readyDay === 0 : r && [r.a, r.b].includes(v.nextFrom) && ['ready', 'waiting', 'sailing', 'empty'].includes(v.status), '船の割当が不正です。');
      check(v.voyage ? ['sailing', 'empty'].includes(v.status) : !['sailing', 'empty'].includes(v.status), '船の航行状態が不正です。');
    }
    check(v.cargo.every(c => GOODS.some(g => g.id === c.good) && finite(c.quantity) && c.quantity > 0 && finite(c.total) && c.total >= 0) && new Set(v.cargo.map(c => c.good)).size === v.cargo.length && v.cargo.reduce((sum, c) => sum + c.quantity, 0) <= SHIPS[v.type].capacity + 1e-8, '積み荷が不正です。');
    if (v.voyage) {
      const w = v.voyage;
      check(r && w.from === (legacy ? v.city : v.nextFrom) && [r.a, r.b].includes(w.to) && w.from !== w.to && w.total === daysFor(v.type, w.from, w.to) && Number.isInteger(w.remaining) && w.remaining > 0 && w.remaining <= w.total && finite(w.cost) && w.cost >= 0 && finite(w.forecast), '航海データが不正です。');
    } else check(v.cargo.length === 0, '停泊中の積み荷が不正です。');
  }
  const categories = ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily', 'licensePurchase', 'shipPurchase'];
  check(s.totals && Object.entries(s.totals).every(([k, v]) => categories.includes(k) && finite(v)), '会計集計が不正です。');
  check(Math.abs(s.initialCash + Object.values(s.totals).reduce((a, b) => a + b, 0) - s.cash) < 0.001, '会計残高が一致しません。');
  check(Array.isArray(s.ledger) && s.ledger.length <= 600 && s.ledger.every(e => categories.includes(e.category) && finite(e.amount) && Number.isInteger(e.day) && e.day >= 0 && e.day <= s.day && (e.routeId === null || /^route-[1-9]\d*$/.test(e.routeId)) && (!e.city || Object.hasOwn(CITIES, e.city)) && (!e.good || GOODS.some(g => g.id === e.good)) && (e.quantity === undefined || finite(e.quantity) && e.quantity >= 0)), '取引履歴が不正です。');
  check(Array.isArray(s.history) && s.history.length <= 365 && s.history.every(h => finite(h.cash) && finite(h.assets) && Number.isInteger(h.day) && h.day >= 0 && h.day <= s.day), '資産履歴が不正です。');
  if (legacy) return deserialize(serialize(migrateV1(s)));
  return s;
}

function migrateV1(s) {
  const grouped = new Map(), idMap = new Map();
  // Creation order is the stable tie-breaker for conflicting legacy policies.
  for (const old of s.routes) {
    const key = routeKey(old.a, old.b);
    let route = grouped.get(key);
    if (!route) {
      route = { ...old, scheduleEpoch: s.day + 1 };
      delete route.shipId; delete route.status;
      grouped.set(key, route);
    } else {
      for (const key of ['profit', 'expenses', 'revenue', 'deliveries']) route[key] += old[key];
      route.started = Math.min(route.started, old.started);
      route.active = route.active && old.active;
    }
    idMap.set(old.id, route.id);
  }
  for (const ship of s.ships) {
    ship.nextFrom = ship.routeId ? ship.city : null;
    ship.routeId = idMap.get(ship.routeId) ?? null;
    ship.readyDay = ship.routeId ? s.day + 1 : 0;
    ship.status = ship.voyage ? (ship.cargo.length ? 'sailing' : 'empty') : ship.routeId ? 'ready' : 'idle';
    delete ship.city;
  }
  for (const e of s.ledger) if (idMap.has(e.routeId)) e.routeId = idMap.get(e.routeId);
  s.routes = [...grouped.values()]; s.version = SAVE_VERSION;
  for (const route of s.routes) reschedule(s, route);
  return s;
}
