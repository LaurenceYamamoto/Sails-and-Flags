import {COMPANY_STARTS} from './region-data-v13.js';
import {migrateCrossings} from './crossing-migration-v13.js';
import {initializeRoads,travelDistance,canServe,routeNations,roadDays,roadToll,payRoadToll,validateLand} from './land-v13.js';
import {ROADS,roadBetween,WAGONS} from './land-data-v13.js';
import {distance as oldSeaDistance} from './data-v8.js';
import {RETIRED_CITIES,RETIRED_ROADS} from './retired-network-v13.js';
import {shipName,validName} from './identity-v13.js';
import {initializeIndustry,initializeDevelopment,shipSpec,shipCatalog,shipDaily,sailingDays,canProduce,advanceIndustry,industryDaily,marketFactors,recordCityTax,rightsAssets,validateIndustry} from './industry-v13.js';
import { GOODS, CITIES, NATIONS, SHIPS, distance, daysFor } from './data-v13.js';
import { deserialize as readLegacy } from './engine-v12.js';
import { initializeManagement, initializeRoute, runAutomation, runCompetitor, recordRank, validateManagement, PROFILES, monthFor } from './management-v13.js';
import {createWorld,initializeSecurity,initializeRouteSecurity,licenseTerms,recordTrade,advanceWorld,advanceDiplomacy,demandMultiplier,checkAttack,runReplacements,validateSecurity,RULES} from './security-v13.js';
export const SAVE_VERSION = 13;
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
export function createGame(seed = 1700, {events=true}={}) {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const markets = Object.fromEntries(Object.entries(CITIES).map(([id, c]) => [id, Object.fromEntries(GOODS.map((g, i) => [g.id, { stock: c.stocks[i] * (0.98 + random() * 0.04), production: c.supply[i], demand: c.demand[i] }]))]));
  const state = { version: SAVE_VERSION, seed: seed >>> 0, rng, day: 0, cash: 5000, initialCash: 5000, licenses: ['england'], ships: [], routes: [], markets, ledger: [], totals: {}, history: [{ day: 0, cash: 5000, assets: 5000 }], nextId: 1, gameOver: false, competitors: [] };
  initializeManagement(state);initializeSecurity(state,createWorld(0,seed,events));
  initializeDevelopment(state.world);initializeRoads(state.world);initializeIndustry(state,'player');
  state.competitors = createCompetitors(markets,state.world);
  return state;
}
export function entry(s, category, amount, routeId = null, details = {}) {
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
  check(licenseTerms(s,nation).canBuy,'友好度30以上で交易免許を取得できます。');
  check(s.cash >= licenseTerms(s,nation).fee, '免許の取得資金が不足しています。');
  s.licenses.push(nation); entry(s, 'licensePurchase', -licenseTerms(s,nation).fee, null, { nation });
}
export function buyShip(s, type) {
  playing(s);
  check(Boolean(shipSpec(s,type)), '船種を確認してください。');
  check(canProduce(s,type),'研究済み設計と造船設備が必要です。');
  check(s.cash >= shipSpec(s,type).price, '船の購入資金が不足しています。');
  const ship = { id: `ship-${s.nextId++}`, type, routeId: null, nextFrom: null, readyDay: 0, status: 'idle', voyage: null, cargo: [], voyages: 0 };
  ship.name=shipName(s,ship);
  s.ships.push(ship); entry(s, (Object.hasOwn(SHIPS,type)||Object.hasOwn(WAGONS,type))?'shipPurchase':'shipConstruction', -shipSpec(s,type).price, null, { shipId: ship.id });
  return ship;
}
export function setRoute(s, shipId, a, b, allowed = GOODS.map(g => g.id), minMargin = 10) {
  return setCircuit(s, shipId, [a,b], allowed, minMargin);
}
function validateCircuit(s,type,stops,allowed,minMargin) {
  validateStops(stops);
  check(Boolean(shipSpec(s,type)), '船種を確認してください。');
  if(shipSpec(s,type).mode==='land')check(routeLegs({stops}).every(([a,b])=>roadBetween(a,b)), 'すべての区間に道路が必要です。');
  check(routeNations({stops,mode:shipSpec(s,type).mode}).every(n => s.licenses.includes(n)), '全寄港地の交易免許が必要です。');
  check(routeLegs({stops}).every(([from,to])=>travelDistance(s,type,from,to)<=shipSpec(s,type).range), 'この船の航続距離を超えています。');
  validatePolicy(allowed,minMargin);
}
// The UI and submission use the same quote. No funds, IDs or ships change
// until every opening condition has been checked against the current state.
export function quoteCircuitOpening(s,type,stops,allowed=GOODS.map(g=>g.id),minMargin=10) {
  const idle=s.ships.find(v=>!v.routeId&&!v.voyage&&v.type===type);
  const cost=Boolean(shipSpec(s,type))?(idle?0:shipSpec(s,type).price):null;
  const result={shipId:idle?.id??null,cost,remaining:cost===null?null:s.cash-cost,existingRouteId:null,error:null};
  try {
    playing(s);stops=normalizeStops(stops);validateStops(stops);
    const existing=s.routes.find(r=>(r.mode??'sea')===shipSpec(s,type)?.mode&&circuitKey(r.stops)===circuitKey(stops));
    if(existing)return {...result,shipId:null,cost:0,remaining:s.cash,existingRouteId:existing.id};
    validateCircuit(s,type,stops,allowed,minMargin);
    check(idle||canProduce(s,type),'研究済み設計と造船設備が必要です。');
    check(!s.strategy||s.routes.length<50,'競合会社の航路上限（50航路）に達しました。');
    check(s.cash>=cost,'船の購入資金が不足しています。');
  } catch(error) {result.error=error.message;}
  return result;
}
export function openCircuit(s,type,stops,allowed=GOODS.map(g=>g.id),minMargin=10) {
  const q=quoteCircuitOpening(s,type,stops,allowed,minMargin);
  check(!q.error,q.error);
  if(q.existingRouteId)return s.routes.find(r=>r.id===q.existingRouteId);
  const shipId=q.shipId??buyShip(s,type).id;
  return setCircuit(s,shipId,stops,allowed,minMargin);
}
export function setCircuit(s, shipId, stops, allowed = GOODS.map(g => g.id), minMargin = 10) {
  playing(s);
  stops = normalizeStops(stops);
  const ship = s.ships.find(v => v.id === shipId);
  check(ship && !ship.routeId && !ship.voyage, '未使用の船を選んでください。');
  validateCircuit(s,ship.type,stops,allowed,minMargin);
  const [a,b] = stops;
  // Rotations share a service; reversing a circuit with 3+ ports changes its direction.
  let route = s.routes.find(r => (r.mode??'sea')===shipSpec(s,ship.type).mode && circuitKey(r.stops) === circuitKey(stops));
  if (!route) {
    check(!s.strategy||s.routes.length<50,'競合会社の航路上限（50航路）に達しました。');
    route = { id: `route-${s.nextId++}`, a, b, mode:shipSpec(s,ship.type).mode, stops:[...stops], allowed: [...allowed], minMargin, active: true, started: s.day, profit: 0, expenses: 0, revenue: 0, deliveries: 0, lastForecast: 0, lastActual: null, scheduleEpoch: s.day + 1 };
    initializeRoute(route,s.day,ship.type);initializeRouteSecurity(route);
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
  const assigned = routeShips(s, route),fleet=assigned.length?assigned:[{type:route.autoShipType}];
  let cycle=0; const offsets={}, stopOffsets=[];
  for (const [from,to] of routeLegs(route)) { stopOffsets.push(cycle); offsets[from]??=cycle; cycle += Math.max(...fleet.map(v=>sailingDays(s,v.type,from,to)))+1; }
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
export function reschedule(s, route) {
  const first = routeShips(s, route)[0];
  if(!first){route.scheduleEpoch=s.day+1;return;}
  // Anchor the timetable at the leading ship's next leg. A fleet waiting at B
  // can begin tomorrow instead of wasting an additional half-cycle at startup.
  route.scheduleEpoch = s.day + 1 - routeSchedule(s, route).stopOffsets[stopIndex(route,first)];
}
export function assignShip(s, routeId, shipId) {
  playing(s);
  const route = s.routes.find(r => r.id === routeId), ship = s.ships.find(v => v.id === shipId);
  check(route && ship && ship.routeId === null && !ship.voyage, 'ルートと未使用の船を選んでください。');
  check(canServe(s,ship.type,route), 'この船の航続距離を超えています。');
  ship.routeId = route.id; ship.nextFrom = route.a; ship.readyDay = s.day + 1; ship.status = 'ready';
  ship.nextStop = 0;
  if(route.pendingReplacements.length)route.pendingReplacements.shift();
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
  playing(s); const r = s.routes.find(r => r.id === id); check(r, '航路が存在しません。');
  if(!r.active)check([...routeShips(s,r).map(v=>v.type),r.autoShipType,...r.pendingReplacements].every(type=>canServe(s,type,r)), 'この船の航続距離を超えています。');
  r.active = !r.active;if(r.active)delete r.rangeReview;
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
  const rate = licenseTerms(s,CITIES[city].nation).tax;
  let q = quote(good, market.stock, requested, side);
  if (side === 'buy' && q.value * (1 + rate) > s.cash) {
    let low = 0, high = q.quantity;
    for (let i = 0; i < 50; i++) { const mid = (low + high) / 2; if (quote(good, market.stock, mid, side).value * (1 + rate) <= s.cash) low = mid; else high = mid; }
    q = quote(good, market.stock, low, side);
  }
  market.stock += side === 'buy' ? -q.quantity : q.quantity;
  entry(s, side === 'buy' ? 'purchase' : 'sale', (side === 'buy' ? -1 : 1) * q.value, routeId, { city, good, quantity: q.quantity });
  entry(s, 'tax', -q.value * rate, routeId, { city, good });
  recordTrade(s,CITIES[city].nation,q.value);recordCityTax(s,city,q.value*rate);
  return { quantity: q.quantity, total: q.value * (side === 'buy' ? 1 + rate : 1 - rate) };
}
// Integer loading with admissible bounds and a deterministic 2,000-node work
// budget. Concave greedy seeds guarantee a feasible result even on large markets.
export function optimizeLoad(s, from, to, capacity, budget, allowed, minMargin = 0) {
  if(capacity<=0||budget<=0||!allowed.length)return {profit:0,cost:0,cargo:[]};
  const buyTax = 1 + licenseTerms(s,CITIES[from].nation).tax, sellTax = 1 - licenseTerms(s,CITIES[to].nation).tax;
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
  }).filter(o=>o.values.length>1);
  const bounds=Array.from({length:options.length+1},()=>Array(capacity+1).fill(0));
  // Marginal profits are decreasing within each good. Sorting those units is
  // the exact capacity-only bound, without the previous cubic convolution.
  for(let i=0;i<options.length;i++){
    const units=options.slice(i).flatMap(({values})=>values.slice(1).map((v,j)=>v.profit-values[j].profit)).sort((a,b)=>b-a);
    for(let room=1;room<=capacity;room++)bounds[i][room]=bounds[i][room-1]+(units[room-1]??0);
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
  for(const exponent of [0,.5,1]){
    const quantities=options.map(()=>0);let cost=0,profit=0;
    for(let room=0;room<capacity;room++){
      let chosen=-1,score=-Infinity;
      options.forEach(({values},i)=>{const q=quantities[i];if(q+1>=values.length)return;const dc=values[q+1].cost-values[q].cost,dp=values[q+1].profit-values[q].profit;if(cost+dc<=budget&&dp/Math.pow(dc,exponent)>score){chosen=i;score=dp/Math.pow(dc,exponent);}});
      if(chosen<0)break;const values=options[chosen].values,q=quantities[chosen]++;
      cost+=values[q+1].cost-values[q].cost;profit+=values[q+1].profit-values[q].profit;
    }
    if(profit>best.profit)best={profit,cost,cargo:options.flatMap((o,i)=>quantities[i]?[{good:o.good,quantity:quantities[i]}]:[])};
  }
  let nodes=0;
  function search(i, room, cost, profit, cargo) {
    if(++nodes>2000)return;
    if (profit + Math.min(bounds[i][room], cashBound(i, budget - cost)) <= best.profit + 1e-9) return;
    if (i === options.length) { best = { profit, cost, cargo }; return; }
    const { good, values } = options[i];
    const candidates = values.filter(o => o.quantity <= room && cost + o.cost <= budget).sort((a, b) => b.profit + bounds[i + 1][room - b.quantity] - a.profit - bounds[i + 1][room - a.quantity]);
    for (const o of candidates) {if(nodes>=2000)break;search(i + 1, room - o.quantity, cost + o.cost, profit + o.profit, o.quantity ? [...cargo, { good, quantity: o.quantity }] : cargo);}
  }
  search(0, capacity, 0, 0, []); return best;
}
function depart(s, ship, route) {
  const from = ship.nextFrom, index=stopIndex(route,ship), to = nextPort(route, from, index);
  const days = sailingDays(s,ship.type, from, to);
  const daily = s.ships.reduce((sum, v) => sum + shipDaily(s,v.type), 0) + s.licenses.reduce((sum, n) => sum + licenseTerms(s,n).daily, 0);
  const reserve = (daily+s.routes.reduce((n,r)=>n+r.escorts*RULES.escortDaily,0)+Object.values(s.diplomacy.investment).reduce((a,b)=>a+b,0)+industryDaily(s)) * (days + 1);
  const toll=route.mode==='land'?roadToll(s,from,to):0;
  if(s.cash<toll){ship.status='waiting';return;}
  const load = optimizeLoad(s, from, to, shipSpec(s,ship.type).capacity, Math.max(0, s.cash - reserve - toll), route.allowed, route.minMargin);
  if (!load.cargo.length || load.profit <= shipDaily(s,ship.type) * days + toll) {
    const futureLegs = routeLegs(route).filter((_,i)=>i!==index);
    const profitableLater = futureLegs.some(([a,b])=>optimizeLoad(s,a,b,shipSpec(s,ship.type).capacity,Math.max(0,s.cash-reserve*2),route.allowed,route.minMargin).profit > shipDaily(s,ship.type) * (days+sailingDays(s,ship.type,a,b))+toll+(route.mode==='land'?roadToll(s,a,b):0));
    if (!profitableLater) { ship.status = 'waiting'; return; }
    load.cargo = []; load.cost = 0; load.profit = 0;
  }
  ship.cargo = load.cargo.map(item => ({ ...item, ...trade(s, from, item.good, item.quantity, 'buy', route.id) }));
  const tollPaid=payRoadToll(s,route,from,to);
  route.lastForecast = load.profit - shipDaily(s,ship.type) * days - tollPaid;
  ship.voyage = { from, to, remaining: days, total: days, cost: load.cost, forecast: route.lastForecast };
  if(route.mode==='land')Object.assign(ship.voyage,{roadQuality:s.world.roads[roadBetween(from,to)[0]].quality,toll:tollPaid});
  ship.status = ship.cargo.length ? 'sailing' : 'empty';
}
export function tick(s, { updateMarkets = true, runCompetitors = true } = {}) {
  if (s.gameOver) return;
  s.day++;
  if(s.automation.month!==monthFor(s.day)){s.automation.month=monthFor(s.day);s.automation.spent=0;}
  if(updateMarkets)advanceWorld(s);advanceDiplomacy(s);advanceIndustry(s);
  if (updateMarkets) for (const [cityId,city] of Object.entries(s.markets)) for (const [good, m] of Object.entries(city)) {
    const factors=marketFactors(s,cityId,good);
    m.stock += m.production*factors.production;
    const base = GOODS.find(g => g.id === good).base;
    const consumption = m.demand * factors.demand * demandMultiplier(s,CITIES[cityId].nation,good) * Math.max(0.25, Math.min(3, base / price(good, m.stock)));
    m.stock = Math.max(0, m.stock - consumption);
  }
  for (const n of s.licenses) { entry(s, 'licenseDaily', -licenseTerms(s,n).daily, null, { nation: n }); if (s.gameOver) return; }
  for (const ship of s.ships) {
    entry(s, 'upkeep', -shipDaily(s,ship.type), ship.routeId, { shipId: ship.id });
    if(ship.voyage)ship.voyage.upkeep=(ship.voyage.upkeep??(ship.voyage.total-ship.voyage.remaining)*shipDaily(s,ship.type))+shipDaily(s,ship.type);
    const r=s.routes.find(r=>r.id===ship.routeId);if(r)r.transport.upkeep+=shipDaily(s,ship.type);
    if (s.gameOver) return;
  }
  for(const r of s.routes)if(r.escorts){entry(s,'escort',-r.escorts*RULES.escortDaily,r.id);if(s.gameOver)return;}
  for (const ship of [...s.ships]) {
    const route = s.routes.find(r => r.id === ship.routeId);
    if (!route) continue;
    if (ship.voyage) {
      if(checkAttack(s,route,ship))continue;
      ship.voyage.remaining--;
      if (ship.voyage.remaining === 0) {
        let revenue = 0;
        for (const item of ship.cargo) revenue += trade(s, ship.voyage.to, item.good, item.quantity, 'sell', route.id).total;
        const saleTax=revenue/(1-licenseTerms(s,CITIES[ship.voyage.to].nation).tax)-revenue;
        route.transport.sales+=revenue+saleTax;route.transport.costs+=ship.voyage.cost+saleTax;route.transport.deliveries++;
        route.lastActual = revenue - (ship.voyage.toll??0) - ship.voyage.cost - (ship.voyage.lostCost??0) - (ship.voyage.upkeep??ship.voyage.total*shipDaily(s,ship.type));
        ship.nextStop = (stopIndex(route,ship)+1)%route.stops.length;
        route.deliveries++; ship.voyages++; ship.nextFrom = ship.voyage.to; ship.voyage = null; ship.cargo = []; ship.status = 'ready'; ship.readyDay = s.day + 1;
      }
      // One day in port after arrival. No duplicate sale/departure in the same tick.
    } else if (route.active && nextDeparture(s, route, ship, s.day) === s.day) depart(s, ship, route);
  }
  runReplacements(s);runAutomation(s);if(s.strategy)runCompetitor(s);
  if (runCompetitors) for (const competitor of s.competitors ?? []) {
    competitor.markets = s.markets;competitor.world=s.world;
    tick(competitor, {updateMarkets:false,runCompetitors:false});
  }
  if(!s.strategy)recordRank(s);
  s.history.push({ day: s.day, cash: s.cash, assets: assets(s) });
  if (s.history.length > 365) s.history.shift();
}
export function assets(s) {
  return s.cash + rightsAssets(s) + s.ships.reduce((sum, ship) => sum + shipSpec(s,ship.type).price + ship.cargo.reduce((v, c) => v + c.total, 0), 0);
}
export function operatingProfit(s) { return ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily','escort','developmentIncome','roadToll','roadIncome'].reduce((sum, key) => sum + (s.totals[key] || 0), 0); }
export function createCompetitors(markets,world) {
  return COMPANY_STARTS.map(def=>createCompetitor(def,markets,world));
}
export function createCompetitor({name,stops,kind,id},markets,world){
    const company={version:SAVE_VERSION,name,seed:1700,rng:1700,day:0,cash:5000,initialCash:5000,licenses:[...new Set(stops.map(c=>CITIES[c].nation))],ships:[],routes:[],markets,ledger:[],totals:{},history:[],nextId:1,gameOver:false,competitors:[]};
    company.cash=company.initialCash=PROFILES[kind].cash;initializeManagement(company,kind);initializeSecurity(company,world);initializeIndustry(company,id);
    const ship=buyShip(company,'sloop'); setCircuit(company,ship.id,stops);
    return company;
}
export function serialize(s) { return JSON.stringify(s, (key,value)=>key==='competitors' ? value.map(({markets,world,...company})=>company) : value); }
export function deserialize(raw, nested = false) {
  check(typeof raw === 'string' && raw.length <= 50_000_000, 'セーブデータが大きすぎます。');
  const s = JSON.parse(raw);
  if (s && [1,2,3,4,5,6,7,8,9,10,11,12].includes(s.version) && !nested) return deserialize(serialize(migrateCrossings(readLegacy(raw))));
  check(s && s.version === SAVE_VERSION, '対応していないセーブ形式です。');
  validateIndustry(s,true);
  check(s.networkMigration===undefined||s.networkMigration&&Number.isInteger(s.networkMigration.removedRoutes)&&s.networkMigration.removedRoutes>=0&&s.networkMigration.removedRoutes<=200&&finite(s.networkMigration.refund)&&s.networkMigration.refund>=0,'都市再編の移行記録が不正です。');
  check(s.companyName===undefined||validName(s.companyName),'会社名が不正です。');

  check(Number.isSafeInteger(s.day) && s.day >= 0 && finite(s.cash) && (s.initialCash === 5000 || nested && s.initialCash===25000) && typeof s.gameOver === 'boolean' && s.gameOver === (s.cash < 0), '会社情報が不正です。');
  check(Number.isSafeInteger(s.nextId) && s.nextId > 0 && Number.isInteger(s.seed) && Number.isInteger(s.rng), '識別子・シードが不正です。');
  check(Array.isArray(s.licenses) && new Set(s.licenses).size === s.licenses.length && s.licenses.every(n => Object.hasOwn(NATIONS, n)), '免許が不正です。');
  check(s.markets && Object.keys(s.markets).length === Object.keys(CITIES).length && Object.keys(s.markets).every(id => Object.hasOwn(CITIES,id)), '市場データが不正です。');
  for (const market of Object.values(s.markets)) check(market && Object.keys(market).length===GOODS.length && Object.keys(market).every(id=>GOODS.some(g=>g.id===id)), '市場データが不正です。');
  for (const id of Object.keys(CITIES)) for (const g of GOODS) {
    const m = s.markets?.[id]?.[g.id]; check(m && ['stock', 'production', 'demand'].every(k => finite(m[k]) && m[k] >= 0), '市場データが不正です。');
  }
  check(Array.isArray(s.ships) && Array.isArray(s.routes) && (!nested || s.routes.length <= 50), '船・航路の数が不正です。');
  const ids = [...s.ships, ...s.routes].map(v => v.id);
  check(ids.every(id => /^(ship|route)-[1-9]\d*$/.test(id) && Number(id.split('-')[1]) < s.nextId) && new Set(ids).size === ids.length, '識別子が重複または不正です。');
  for (const r of s.routes) {
    validatePolicy(r.allowed, r.minMargin);
    check(r.rangeReview===undefined||r.rangeReview===true&&r.mode==='sea'&&!r.active,'航路の運航状態が不正です。');
    validateStops(r.stops);
    check(['sea','land'].includes(r.mode) && r.a===r.stops[0] && r.b===r.stops[1] && routeNations(r).every(n => s.licenses.includes(n)), '航路の港・免許が不正です。');
    check(typeof r.active === 'boolean' && ['profit', 'expenses', 'revenue', 'lastForecast', 'started', 'deliveries'].every(k => finite(r[k])) && (r.lastActual === null || finite(r.lastActual)), '航路の収支が不正です。');
    const fleet = routeShips(s, r);
    check((fleet.length > 0 || Array.isArray(r.pendingReplacements)&&r.pendingReplacements.length>0) && fleet.every(v => canServe(s,v.type,r)||r.rangeReview&&shipSpec(s,v.type)?.mode==='sea'), '航路と船の対応が不正です。');
    check(!Object.hasOwn(r, 'shipId') && Number.isSafeInteger(r.scheduleEpoch) && r.scheduleEpoch >= 1 - (r.mode==='land'?routeLegs(r).slice(0,-1).reduce((n,[a,b])=>n+Math.max(...(fleet.length?fleet.map(v=>v.type):[r.autoShipType]).map(type=>roadDays(s,type,a,b,0)))+1,0):Math.max(...routeSchedule(s, r).stopOffsets)) && r.scheduleEpoch <= s.day + 1, '運航時刻表が不正です。');
  }
  check(new Set(s.routes.map(r => r.mode+':'+circuitKey(r.stops))).size === s.routes.length, '同じ経路が重複しています。');
  for (const v of s.ships) {
    check(Boolean(shipSpec(s,v.type)) && Array.isArray(v.cargo) && Number.isInteger(v.voyages) && v.voyages >= 0, '船が不正です。');
    check(v.name===undefined||validName(v.name),'船名が不正です。');
    const departureType=v.voyage?.departureType??v.type;check(Boolean(shipSpec(s,departureType)),'航海時の船種が不正です。');
    const r = s.routes.find(r => r.id === v.routeId);
    check(!Object.hasOwn(v, 'city') && Number.isSafeInteger(v.readyDay) && v.readyDay >= 0 && v.readyDay <= s.day + 1, '船の運航状態が不正です。');
    check(v.routeId === null ? v.nextFrom === null && v.status === 'idle' && v.readyDay === 0 : r && r.stops.includes(v.nextFrom) && ['ready', 'waiting', 'sailing', 'empty'].includes(v.status), '船の割当が不正です。');
    // Old v3 saves had unique ports, so their cursor is unambiguous. Revisited
    // ports require an explicit cursor; never guess which occurrence was saved.
    check(v.nextStop === undefined ? !r || new Set(r.stops).size===r.stops.length : r && Number.isInteger(v.nextStop) && v.nextStop>=0 && v.nextStop<r.stops.length && r.stops[v.nextStop]===v.nextFrom, '船の寄港順が不正です。');
    check(v.voyage ? ['sailing', 'empty'].includes(v.status) : !['sailing', 'empty'].includes(v.status), '船の航行状態が不正です。');
    check(v.cargo.every(c => GOODS.some(g => g.id === c.good) && finite(c.quantity) && c.quantity > 0 && finite(c.total) && c.total >= 0) && new Set(v.cargo.map(c => c.good)).size === v.cargo.length && v.cargo.reduce((sum, c) => sum + c.quantity, 0) <= shipSpec(s,departureType).capacity + 1e-8, '積み荷が不正です。');
    if (v.voyage) {
      const w = v.voyage;
      check(w.seaDistanceVersion===undefined||r?.mode==='sea'&&w.seaDistanceVersion===8,'航海データが不正です。');
      const seaDistance=w.seaDistanceVersion===8?oldSeaDistance(w.from,w.to):distance(w.from,w.to);
      check(r && w.from === v.nextFrom && nextPort(r,w.from,stopIndex(r,v))===w.to && (r.mode==='sea'?seaDistance:travelDistance(s,departureType,w.from,w.to))<=shipSpec(s,departureType).range && shipSpec(s,departureType).mode===r.mode && (r.mode==='land'?finite(w.roadQuality)&&w.roadQuality>=0&&w.roadQuality<=1e12&&finite(w.toll)&&w.toll>=0&&w.total===roadDays(s,departureType,w.from,w.to,w.roadQuality):w.total===Math.ceil(seaDistance/shipSpec(s,departureType).speed)) && Number.isInteger(w.remaining) && w.remaining > 0 && w.remaining <= w.total && finite(w.cost) && w.cost >= 0 && finite(w.forecast) && (w.upkeep===undefined||finite(w.upkeep)&&w.upkeep>=0) && (w.lostCost===undefined||finite(w.lostCost)&&w.lostCost>=0), '航海データが不正です。');
    } else check(v.cargo.length === 0, '停泊中の積み荷が不正です。');
  }
  const categories = ['purchase', 'sale', 'tax', 'upkeep', 'licenseDaily', 'licensePurchase', 'shipPurchase', 'shipSale', 'acquisition', 'acquiredCash','escort','diplomacyInvestment','technologyInvestment','shipyardPurchase','designResearch','shipConstruction','developmentPurchase','developmentSale','cityInvestment','developmentIncome','roadPurchase','roadSale','roadInvestment','roadToll','roadIncome','networkCompensation'];
  check(s.totals && Object.entries(s.totals).every(([k, v]) => categories.includes(k) && finite(v)), '会計集計が不正です。');
  // Cash and category totals accumulate in different orders. At large balances,
  // ordinary IEEE-754 rounding can exceed a fixed thousandth after many trades.
  // Use the same relative tolerance as the long-running accounting invariant;
  // never rewrite the saved cash or the ledger to make an import pass.
  check(Math.abs(s.initialCash + Object.values(s.totals).reduce((a, b) => a + b, 0) - s.cash) < Math.max(0.001,Math.abs(s.cash)*1e-10), '会計残高が一致しません。');
  check(Array.isArray(s.ledger) && s.ledger.length <= 600 && s.ledger.every(e => categories.includes(e.category) && finite(e.amount) && Number.isInteger(e.day) && e.day >= 0 && e.day <= s.day && (e.routeId === null || /^route-[1-9]\d*$/.test(e.routeId)) && (e.road===undefined||(Object.hasOwn(ROADS,e.road)||Object.hasOwn(RETIRED_ROADS,e.road))) && (!e.city || (Object.hasOwn(CITIES, e.city)||Object.hasOwn(RETIRED_CITIES,e.city))) && (!e.good || GOODS.some(g => g.id === e.good)) && (e.quantity === undefined || finite(e.quantity) && e.quantity >= 0)), '取引履歴が不正です。');
  check(s.ledger.every(e => (e.shipId===undefined || typeof e.shipId==='string' && /^ship-[1-9]\d*$/.test(e.shipId)) && (e.nation===undefined || Object.hasOwn(NATIONS,e.nation))), '取引履歴が不正です。');
  check(Array.isArray(s.history) && s.history.length <= 365 && s.history.every(h => finite(h.cash) && finite(h.assets) && Number.isInteger(h.day) && h.day >= 0 && h.day <= s.day), '資産履歴が不正です。');

  check(Array.isArray(s.competitors) && s.competitors.length <= COMPANY_STARTS.length && (!nested || s.competitors.length===0), '競合データが不正です。');
  for (let i=0;i<s.competitors.length;i++) {
    const c=s.competitors[i]; check(typeof c.name==='string' && c.name.length<=80 && c.day<=s.day && (s.gameOver || c.gameOver || c.day===s.day), '競合情報が不正です。');
    c.markets=s.markets;c.world=s.world; s.competitors[i]=deserialize(JSON.stringify(c),true); s.competitors[i].markets=s.markets;s.competitors[i].world=s.world;
  }
  validateLand(s,nested);validateManagement(s,nested);validateSecurity(s,nested);validateIndustry(s,nested);
  return s;
}
