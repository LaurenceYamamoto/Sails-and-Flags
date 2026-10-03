import { performance } from 'node:perf_hooks';
import { createGame, buyLicense, buyShip, setRoute, tick, operatingProfit } from '../src/engine.js';
const s = createGame(); buyLicense(s, 'england'); buyLicense(s, 'spain'); const ship = buyShip(s, 'sloop'); setRoute(s, ship.id, 'kingston', 'havana');
let firstProfit = null, reinvestment = null;
const times = [], start = performance.now();
for (let i = 0; i < 3650; i++) {
  const before = performance.now(); tick(s); times.push(performance.now() - before);
  if (firstProfit === null && operatingProfit(s) > 0) firstProfit = s.day;
  if (reinvestment === null && operatingProfit(s) >= 1800) reinvestment = s.day;
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, days: s.day, elapsedMs: performance.now() - start, medianTickMs: times[1825], p95TickMs: times[Math.floor(times.length * .95)], maxTickMs: times.at(-1), firstProfitableDay: firstProfit, secondShipEarnedDay: reinvestment, cash: s.cash, bankrupt: s.gameOver, deliveries: s.routes[0].deliveries, saveBytes: Buffer.byteLength(JSON.stringify(s)) }, null, 2));
