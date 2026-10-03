import {daysFor} from '../src/data.js';
import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buyShip, buyLicense, setRoute, assignShip, releaseShip, removeRoute, toggleRoute, updateRoute, routeShips, routeSchedule, nextDeparture, tick, serialize, deserialize, trade, assets } from '../src/engine.js';
import {createGame} from './baseline.js';
const legDays=daysFor('sloop','kingston','havana'),half=legDays+1,cycle=half*2;
const legacyRaw = readFileSync(new URL('./fixtures/v1-two-routes.json', import.meta.url), 'utf8');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function fleet(types = ['sloop', 'sloop'], ports = ['kingston', 'havana']) {
  const s = createGame();
  // Test funding uses the same accounting operation, keeping save balances valid.
  trade(s, 'kingston', 'food', 30000, 'sell'); buyLicense(s, 'spain');
  for (const type of types) setRoute(s, buyShip(s, type).id, ...ports);
  return { s, route: s.routes[0] };
}
function runScheduled(s, days) {
  const events = [];
  for (let i = 0; i < days; i++) {
    // Isolate the timetable from market saturation and skipped sailings.
    s.markets = createGame().markets;
    for (const route of s.routes) {
      s.markets[route.a].rum.stock = 330; s.markets[route.b].rum.stock = 65;
      s.markets[route.a].sugar.stock = 115; s.markets[route.b].sugar.stock = 350;
    }
    tick(s);
    for (const ship of s.ships) if (ship.voyage?.remaining === ship.voyage?.total && ship.voyage) events.push({ day: s.day, from: ship.voyage.from, ship: ship.id });
  }
  return events;
}
test('same pair in either direction is one route with shared policy and accounting', () => {
  const { s, route } = fleet(['sloop']);
  const extra = buyShip(s, 'sloop');
  const shared = setRoute(s, extra.id, 'havana', 'kingston', ['food'], 99);
  assert.equal(shared, route); assert.equal(s.routes.length, 1);
  assert.equal(routeShips(s, route).length, 2); assert.equal(route.minMargin, 10);
  assert.equal(extra.nextFrom, route.a); assert.equal('shipId' in route, false);
  updateRoute(s, route.id, ['rum'], 20); assert.deepEqual(route.allowed, ['rum']);
  for (let i = 0; i < 30; i++) tick(s);
  assert.equal(route.deliveries, s.ships.reduce((n, v) => n + v.voyages, 0));
  close(route.profit, s.ledger.filter(e => e.routeId === route.id).reduce((n, e) => n + e.amount, 0));
});
test('unused ownership has no port; purchase needs no license; reassignment needs no transfer', () => {
  const s = createGame(); s.licenses = [];
  const ship = buyShip(s, 'sloop');
  assert.equal('city' in ship, false); assert.equal(ship.nextFrom, null);
  assert.throws(() => setRoute(s, ship.id, 'cadiz', 'london'));
  buyLicense(s, 'spain'); buyLicense(s, 'england');
  const route = setRoute(s, ship.id, 'cadiz', 'london');
  removeRoute(s, route.id); assert.equal(ship.nextFrom, null);
  setRoute(s, ship.id, 'kingston', 'havana');
  tick(s); assert.equal(ship.voyage.from, 'kingston');
});
test('two ships depart at half-cycle intervals using navigable sailing days', () => {
  const { s, route } = fleet();
  assert.deepEqual(routeSchedule(s, route), { halfCycle: half, cycle, offsets: {kingston:0,havana:half}, stopOffsets:[0,half], interval: half });
  const events = runScheduled(s, 1+6*half);
  assert.deepEqual(events.filter(e => e.from === route.a).map(e => e.day), Array.from({length:7},(_,i)=>1+i*half));
  assert.deepEqual(events.filter(e => e.from === route.b).map(e => e.day), Array.from({length:6},(_,i)=>1+(i+1)*half));
});
test('non-divisible slots are evenly rounded; high fleets respect daily resolution', () => {
  for (const count of [3, 5, 14]) {
    const { s, route } = fleet(Array(count).fill('sloop'));
    const events = runScheduled(s, 48);
    for (const port of [route.a, route.b]) {
      const departures = events.filter(e => e.from === port).map(e => e.day);
      const gaps = departures.slice(1).map((day, i) => day - departures[i]);
      const target = cycle / count;
      assert.ok(gaps.length > count);
      assert.ok(gaps.every(n => n === Math.floor(target) || n === Math.ceil(target)));
    }
  }
});
test('mixed speed fleet uses a shared cycle and preserves actual voyage durations', () => {
  const { s, route } = fleet(['sloop', 'brig'], ['london', 'cadiz']);
  assert.equal(routeSchedule(s, route).cycle, 24);
  // Both directions have profitable loads, so missed slots cannot mask spacing.
  const events = runScheduled(s, 100);
  for (const ship of s.ships) {
    const fromA = events.filter(e => e.from === route.a && e.ship === ship.id).map(e => e.day);
    assert.ok(fromA.length >= 3);
    assert.ok(fromA.slice(1).every((day, i) => day - fromA[i] === 24));
  }
  const aDays = events.filter(e => e.from === route.a).map(e => e.day);
  assert.ok(aDays.slice(1).every((day, i) => day - aDays[i] === 12));
});
test('adding a ship preserves in-flight cargo and redistributes subsequent sailings', () => {
  const { s, route } = fleet(['sloop']); runScheduled(s, 2);
  const first = s.ships[0], voyage = structuredClone(first.voyage), cargo = structuredClone(first.cargo);
  const extra = buyShip(s, 'sloop'); assignShip(s, route.id, extra.id);
  assert.deepEqual(first.voyage, voyage); assert.deepEqual(first.cargo, cargo);
  assert.equal(nextDeparture(s, route, extra), s.day+1+half);
  const events = runScheduled(s, 60).filter(e => e.from === route.a && e.day >= 15).map(e => e.day);
  assert.ok(events.slice(1).every((day, i) => day - events[i] === half));
});
test('pause affects all ships, safe individual release works, resume reschedules', () => {
  const { s, route } = fleet(); runScheduled(s, half+1);
  toggleRoute(s, route.id);
  assert.equal(nextDeparture(s, route, s.ships[0]), null);
  assert.throws(() => releaseShip(s, s.ships[0].id));
  assert.throws(() => removeRoute(s, route.id));
  runScheduled(s, 10); assert.ok(s.ships.every(v => !v.voyage && v.cargo.length === 0));
  const deliveries = route.deliveries;
  const released = s.ships[1]; releaseShip(s, released.id);
  assert.equal(released.routeId, null); assert.equal(released.nextFrom, null);
  assert.equal(routeSchedule(s, route).interval, cycle); assert.equal(route.deliveries, deliveries);
  toggleRoute(s, route.id); runScheduled(s, 20); assert.ok(route.deliveries > deliveries);
  const copy = deserialize(serialize(s)); assert.deepEqual(s, copy);
});
test('no-opportunity departures skip slots instead of bunching on a later day', () => {
  const { s, route } = fleet(); updateRoute(s, route.id, ['rum'], 1000);
  tick(s); assert.equal(s.ships[0].voyage, null); assert.equal(s.ships[0].status, 'waiting');
  updateRoute(s, route.id, ['rum'], 0);
  const events = runScheduled(s, 4*half).filter(e => e.from === route.a).map(e => e.day);
  assert.deepEqual(events, Array.from({length:4},(_,i)=>1+(i+1)*half));
});
test('v1 migration merges reversed routes without changing cash, cargo or voyages', () => {
  const old = JSON.parse(legacyRaw), s = deserialize(legacyRaw), route = s.routes[0];
  assert.equal(s.version,15); assert.equal(s.routes.length, 1); assert.equal(s.ships.length, 2);
  close(s.cash, old.cash); close(assets(s), assets(old));
  assert.deepEqual(s.totals, old.totals); assert.deepEqual(s.history, old.history);
  assert.deepEqual(route.allowed, old.routes[0].allowed); assert.equal(route.minMargin, old.routes[0].minMargin);
  for (const key of ['profit', 'expenses', 'revenue', 'deliveries']) close(route[key], old.routes.reduce((n, r) => n + r[key], 0));
  for (let i = 0; i < s.ships.length; i++) {
    assert.deepEqual(s.ships[i].cargo, old.ships[i].cargo); assert.deepEqual(withoutSeaVersion(s.ships[i].voyage), old.ships[i].voyage);
    assert.equal(s.ships[i].routeId, route.id); assert.equal('city' in s.ships[i], false);
  }
  assert.ok(s.ledger.every(e => e.routeId === null || e.routeId === route.id));
  const copy = deserialize(serialize(s));
  for (let i = 0; i < 200; i++) { tick(s); tick(copy); }
  assert.deepEqual(s, copy); assert.equal(s.gameOver, false);
  assert.equal(JSON.parse(legacyRaw).version, 1);
});
test('migration does not reactivate a partially paused legacy route', () => {
  const old = JSON.parse(legacyRaw); old.routes[1].active = false;
  const s = deserialize(JSON.stringify(old)); assert.equal(s.routes[0].active, false);
  const deliveries = s.routes[0].deliveries;
  for (let i = 0; i < 20; i++) tick(s);
  assert.equal(s.routes[0].deliveries, deliveries + 2);
  assert.ok(s.ships.every(v => !v.voyage && v.cargo.length === 0));
});
test('a fleet waiting at the far end can resume tomorrow with evenly spaced slots', () => {
  const { s, route } = fleet();
  // Both ships have reached B before the user enables the route again.
  for (const ship of s.ships) { ship.nextFrom = route.b; ship.nextStop = 1; }
  toggleRoute(s, route.id); toggleRoute(s, route.id);
  assert.equal(nextDeparture(s, route, s.ships[0]), 1);
  assert.equal(nextDeparture(s, route, s.ships[1]), 1+half);
  assert.deepEqual(deserialize(serialize(s)), s);
});
test('save validation rejects duplicate pairs, orphan vessels and corrupt schedules', () => {
  const { s } = fleet();
  for (const mutate of [
    v => v.routes[0].scheduleEpoch = NaN,
    v => v.routes[0].scheduleEpoch = v.day + 2,
    v => v.ships[0].routeId = 'missing',
    v => v.ships[0].nextFrom = 'london',
    v => v.ships[0].city = 'havana',
    v => { const r = { ...v.routes[0], id: `route-${v.nextId++}` }; v.routes.push(r); v.ships[1].routeId = r.id; },
  ]) { const copy = structuredClone(s); mutate(copy); assert.throws(() => deserialize(serialize(copy))); }
  const invalidOld = JSON.parse(legacyRaw); invalidOld.routes[0].shipId = 'missing';
  assert.throws(() => deserialize(JSON.stringify(invalidOld)));
});
