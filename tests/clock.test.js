import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, voyageProgress } from '../src/clock.js';
import { createGame, tick, buyShip, buyLicense, setRoute } from '../src/engine.js';

test('16x advances daily throughout the second rather than in a 16-day burst', () => {
  const clock = createClock(), updates = [];
  for (let frame = 0; frame <= 60; frame++) clock.advance(frame * 1000 / 60, true, 16, () => { updates.push(frame); });
  assert.equal(updates.length, 16);
  assert.ok(updates[0] <= 4);
  assert.ok(updates.every((frame, i) => i === 0 || frame - updates[i - 1] <= 4));
});

test('pause, resume and speed changes preserve fractional time without catch-up', () => {
  const clock = createClock(); let days = 0;
  const step = (now, running, speed) => clock.advance(now, running, speed, () => { days++; });
  step(0, true, 1); step(250, true, 1);
  step(10000, false, 1); step(10250, false, 16);
  assert.equal(clock.fraction, 0.25); assert.equal(days, 0);
  step(10281.25, true, 16);
  assert.equal(clock.fraction, 0.75); assert.equal(days, 0);
  step(10300, true, 16);
  assert.equal(days, 1); assert.ok(Math.abs(clock.fraction - 0.05) < 1e-9);
  step(999999, true, 16);
  assert.equal(days, 1);
  clock.reset(); assert.equal(clock.fraction, 0);
  step(1000000, true, 16); assert.equal(days, 1);
});

test('game over stops pending daily updates', () => {
  const clock = createClock(); let days = 0;
  clock.advance(0, true, 16, () => {});
  clock.advance(250, true, 16, () => { days++; return false; });
  assert.equal(days, 1); assert.equal(clock.fraction, 0);
});

test('ship positions interpolate between days without changing voyage state', () => {
  const voyage = { total: 5, remaining: 4 };
  assert.equal(voyageProgress(voyage, 0), 0.2);
  assert.equal(voyageProgress(voyage, 0.5), 0.3);
  assert.equal(voyageProgress({ total: 5, remaining: 1 }, 1), 1);
  assert.equal(voyageProgress(null, 0.5), 0);
  assert.deepEqual(voyage, { total: 5, remaining: 4 });
});

test('continuous clock gives identical trading, cargo and accounting at every speed', () => {
  const initial = createGame(); buyLicense(initial, 'spain');
  const ship = buyShip(initial, 'sloop'); setRoute(initial, ship.id, 'kingston', 'havana');
  const expected = structuredClone(initial); for (let day = 0; day < 120; day++) tick(expected);
  for (const speed of [1, 4, 16]) {
    const state = structuredClone(initial), clock = createClock();
    for (let frame = 0; frame <= 120 * 60 / speed; frame++) {
      clock.advance(frame * 1000 / 60, true, speed, () => { tick(state); return !state.gameOver; });
    }
    assert.deepEqual(state, expected);
  }
});
