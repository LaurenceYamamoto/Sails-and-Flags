import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { GOODS, SHIPS, CITIES, NATIONS, daysFor } from '../src/data.js';
import { quote, trade, price, buyShip, buyLicense, setRoute, updateRoute, toggleRoute, removeRoute, optimizeLoad, tick, serialize, deserialize, assets, operatingProfit } from '../src/engine.js';
import {createGame} from './baseline.js';
const close = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function scenario(seed = 1700, type = 'sloop', a = 'kingston', b = 'havana') {
  const s = createGame(seed); buyLicense(s, 'spain');
  if (type === 'brig') { s.cash += 8000; s.initialCash += 8000; }
  const ship = buyShip(s, type); const route = setRoute(s, ship.id, a, b);
  return { s, ship, route };
}
test('integrated prices: split and bulk trades agree including tax and cash', () => {
  for (const side of ['buy', 'sell']) for (const g of GOODS) {
    const s = createGame(), split = createGame();
    trade(s, 'kingston', g.id, 19, side);
    trade(split, 'kingston', g.id, 7, side); trade(split, 'kingston', g.id, 12, side);
    close(s.cash, split.cash); close(s.markets.kingston[g.id].stock, split.markets.kingston[g.id].stock);
    assert.equal(s.gameOver, false);
  }
});
test('short stock and cash result in partial fills, no negative inventory', () => {
  const s = createGame(); s.markets.kingston.food.stock = 2.5;
  const before = s.cash; const fill = trade(s, 'kingston', 'food', 100, 'buy');
  close(fill.quantity, 2.5); close(before - s.cash, fill.total); close(s.markets.kingston.food.stock, 0);
  s.cash = 1; const poor = trade(s, 'kingston', 'tools', 50, 'buy');
  assert.ok(poor.quantity < 1 && s.cash >= 0); assert.ok(s.markets.kingston.tools.stock >= 0);
});
test('same-market buy and sell cannot create money; invalid trades are rejected', () => {
  const s = createGame(), before = s.cash;
  trade(s, 'kingston', 'rum', 20, 'buy'); trade(s, 'kingston', 'rum', 20, 'sell');
  assert.ok(s.cash < before);
  assert.throws(() => quote('rum', 10, -1, 'buy')); assert.throws(() => quote('rum', 10, 1, 'bad'));
});
test('optimizer agrees with exhaustive enumeration under constrained cash', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = createGame(seed), allowed = ['sugar', 'rum', 'food'];
    // Several profitable goods with unequal prices exercise the cash constraint.
    for (const g of allowed) { s.markets.kingston[g].stock = 250 + seed * 2; s.markets.havana[g].stock = 50 + seed; }
    const capacity = 7, budget = 80 + seed * 23;
    const plan = optimizeLoad(s, 'kingston', 'havana', capacity, budget, allowed, 0);
    let best = 0;
    for (let a = 0; a <= capacity; a++) for (let b = 0; b <= capacity - a; b++) for (let c = 0; c <= capacity - a - b; c++) {
      let cost = 0, value = 0;
      for (const [i, q] of [a, b, c].entries()) { const g = allowed[i]; cost += quote(g, s.markets.kingston[g].stock, q, 'buy').value * 1.05; value += quote(g, s.markets.havana[g].stock, q, 'sell').value * .91; }
      if (cost <= budget) best = Math.max(best, value - cost);
    }
    close(plan.profit, best); assert.ok(plan.cost <= budget);
  }
});
test('loading honors allowed goods, margin, stock, capacity and operating reserve', () => {
  const { s, ship, route } = scenario(); updateRoute(s, route.id, ['rum'], 10); const cashBefore = s.cash;
  tick(s);
  assert.ok(ship.voyage); assert.ok(ship.cargo.every(c => c.good === 'rum'));
  assert.ok(ship.cargo.reduce((sum, c) => sum + c.quantity, 0) <= SHIPS.sloop.capacity);
  assert.ok(s.cash >= 4 * 6); assert.ok(s.cash < cashBefore);
  assert.equal(optimizeLoad(s, 'kingston', 'havana', 30, 1000, ['rum'], 1000).cargo.length, 0);
  assert.throws(() => updateRoute(s, route.id, [], 0)); assert.throws(() => updateRoute(s, route.id, ['rum'], NaN));
});
test('licenses, range and duplicate assignment are enforced without ship location', () => {
  const s = createGame(), ship = buyShip(s, 'sloop');
  assert.throws(() => setRoute(s, ship.id, 'kingston', 'havana'));
  buyLicense(s, 'spain'); assert.throws(() => setRoute(s, ship.id, 'kingston', 'london'));
  assert.equal('city' in ship, false);
  setRoute(s, ship.id, 'cadiz', 'london'); assert.throws(() => setRoute(s, ship.id, 'kingston', 'havana'));
});
test('pause finishes voyage, sells cargo once, permits release and reassignment', () => {
  const { s, ship, route } = scenario(); tick(s); toggleRoute(s, route.id);
  assert.throws(() => removeRoute(s, route.id));
  for (let i = 0; i < daysFor('sloop','kingston','havana'); i++) tick(s);
  assert.equal(ship.nextFrom, 'havana'); assert.equal(ship.voyage, null); assert.equal(ship.cargo.length, 0); assert.equal(route.deliveries, 1);
  const sales = s.totals.sale; tick(s); assert.equal(s.totals.sale, sales);
  removeRoute(s, route.id); assert.equal(ship.routeId, null);
  setRoute(s, ship.id, 'havana', 'kingston'); tick(s); assert.ok(ship.voyage);
});
test('empty return and no-opportunity waiting rules', () => {
  const { s, ship, route } = scenario(); updateRoute(s, route.id, ['rum'], 10);
  for (let i = 0; i < daysFor('sloop','kingston','havana')+2; i++) tick(s);
  assert.ok(ship.voyage); assert.equal(ship.cargo.length, 0); assert.equal(ship.status, 'empty');
  const waiting = scenario(); updateRoute(waiting.s, waiting.route.id, ['rum'], 1000); tick(waiting.s);
  assert.equal(waiting.ship.voyage, null); assert.equal(waiting.ship.status, 'waiting');
});
test('in-transit save restoration gives identical future, no lost or duplicated cargo', () => {
  const { s } = scenario(); for (let i = 0; i < 3; i++) tick(s);
  const restored = deserialize(serialize(s)); assert.deepEqual(s, restored);
  for (let i = 0; i < 130; i++) { tick(s); tick(restored); }
  assert.deepEqual(s, restored);
});
test('save rejects incompatible, malformed and inconsistent states without modifying live game', () => {
  const { s } = scenario(); tick(s); const original = serialize(s);
  const mutations = [v => v.version++, v => v.cash = null, v => v.markets.havana.rum.stock = -1, v => v.ships.push(v.ships[0]), v => v.ships[0].routeId = 'missing', v => v.ships[0].voyage.remaining = 0, v => v.ships[0].cargo[0].quantity = 999, v => v.cash += 100, v => v.routes[0].allowed = ['bad']];
  for (const mutate of mutations) { const v = JSON.parse(original); mutate(v); assert.throws(() => deserialize(JSON.stringify(v))); }
  assert.throws(() => deserialize('{')); assert.equal(serialize(s), original);
});
test('cash exhaustion ends game immediately, even with valuable assets', () => {
  const { s, ship } = scenario(); s.cash = .1; tick(s);
  assert.equal(s.gameOver, true); assert.ok(assets(s) > 0); assert.equal(ship.voyage, null);
  const frozen = serialize(s); tick(s); assert.equal(serialize(s), frozen); assert.throws(() => buyShip(s, 'sloop'));
});
test('cashflow, asset value and purchases are not double counted', () => {
  const { s } = scenario(); close(assets(s), 4000); close(operatingProfit(s), 0);
  for (let i = 0; i < 100; i++) tick(s);
  close(s.cash, s.initialCash + Object.values(s.totals).reduce((sum, n) => sum + n, 0));
  close(operatingProfit(s), s.cash - 5000 + 1800 + 1000);
  assert.ok(s.routes[0].lastActual !== null);
});
test('multiple ships remain distinct through simultaneous trades and save restoration', () => {
  const { s, ship } = scenario();
  for (let i = 0; i < 120; i++) tick(s);
  const second = buyShip(s, 'sloop'); setRoute(s, second.id, 'kingston', 'havana');
  for (let i = 0; i < 60; i++) tick(s);
  assert.equal(s.gameOver, false); assert.notEqual(ship.id, second.id);
  assert.equal(s.routes.length, 1); assert.ok(second.voyages > 0);
  const restored = deserialize(serialize(s));
  for (let i = 0; i < 120; i++) { tick(s); tick(restored); }
  assert.deepEqual(s, restored);
});
test('markets respond to repeated trading and demand reacts to price', () => {
  const { s } = scenario(), untouched = createGame();
  for (let i = 0; i < 120; i++) { tick(s); tick(untouched); }
  assert.ok(price('rum', s.markets.kingston.rum.stock) > price('rum', untouched.markets.kingston.rum.stock));
  assert.ok(price('rum', s.markets.havana.rum.stock) < price('rum', untouched.markets.havana.rum.stock));
  const cheap = createGame(), dear = createGame();
  cheap.markets.kingston.rum.stock = 500; dear.markets.kingston.rum.stock = 10;
  tick(cheap); tick(dear);
  const c = cheap.markets.kingston.rum, d = dear.markets.kingston.rum;
  assert.ok(500 + c.production - c.stock > 10 + d.production - d.stock);
});
test('tutorial earns the price of a second ship from trading profits', t => {
  const { s, route } = scenario(); let firstProfitDay = null;
  for (let i = 0; i < 365 && operatingProfit(s) < 1800; i++) { tick(s); if (firstProfitDay === null && operatingProfit(s) > 0) firstProfitDay = s.day; }
  assert.equal(s.gameOver, false); assert.ok(operatingProfit(s) >= 1800); assert.ok(route.deliveries >= 2);
  buyShip(s, 'sloop'); assert.equal(s.ships.length, 2);
  t.diagnostic(JSON.stringify({ firstProfitDay, secondShipDay: s.day, cashAfterPurchase: s.cash, earned: operatingProfit(s) }));
});
test('short and Atlantic routes run with reserves and measurable real versus forecast returns', t => {
  for (const [type, a, b] of [['sloop', 'kingston', 'havana'], ['brig', 'kingston', 'london']]) {
    const { s, ship, route } = scenario(1700, type, a, b); const start = performance.now();
    for (let i = 0; i < 365; i++) tick(s);
    assert.equal(s.gameOver, false); assert.ok(route.deliveries > 2); assert.ok(Number.isFinite(route.lastActual));
    t.diagnostic(JSON.stringify({ type, oneWayDays: daysFor(type, a, b), deliveries: route.deliveries, profit: route.profit, cash: s.cash, ms: performance.now() - start }));
  }
});
test('ten-year runs stay valid and deterministic across multiple seeds', t => {
  const start = performance.now();
  for (const seed of [1, 42, 1700]) {
    const { s } = scenario(seed), copy = deserialize(serialize(s));
    for (let day = 0; day < 3650; day++) {
      tick(s); tick(copy);
      assert.equal(s.gameOver, false);
      for (const city of Object.values(s.markets)) for (const [g, m] of Object.entries(city)) assert.ok(m.stock >= 0 && Number.isFinite(price(g, m.stock)) && price(g, m.stock) > 0);
    }
    assert.deepEqual(s, copy); assert.deepEqual(s, deserialize(serialize(s)));
    t.diagnostic(`seed ${seed}: cash=${s.cash.toFixed(2)}, voyages=${s.ships[0].voyages}`);
  }
  t.diagnostic(`10-year × 6 runs: ${(performance.now() - start).toFixed(0)}ms`);
});
