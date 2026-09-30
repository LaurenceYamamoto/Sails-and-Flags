export const GOODS = [
  { id: 'sugar', name: '砂糖', base: 42 },
  { id: 'rum', name: 'ラム酒', base: 62 },
  { id: 'cloth', name: '織物', base: 85 },
  { id: 'tools', name: '工具', base: 105 },
  { id: 'food', name: '食料', base: 24 },
];
export const NATIONS = {
  england: { name: 'イングランド', fee: 250, daily: 0.5, tax: 0.025, color: '#ef4444' },
  spain: { name: 'スペイン', fee: 250, daily: 0.5, tax: 0.025, color: '#facc15' },
};
// Coordinates on an original schematic map, not navigational geography.
export const CITIES = {
  kingston: { name: 'キングストン', nation: 'england', x: 221, y: 359, supply: [1.5, 3.4, 0.55, 0.7, 2.5], demand: [2.4, 1.3, 2.2, 2.5, 2], stocks: [115, 330, 70, 60, 180] },
  havana: { name: 'ハバナ', nation: 'spain', x: 168, y: 307, supply: [3.6, 0.65, 0.6, 0.5, 2.8], demand: [1.3, 2.6, 2, 2, 2.1], stocks: [350, 65, 75, 65, 220] },
  london: { name: 'ロンドン', nation: 'england', x: 751, y: 98, supply: [0.55, 0.5, 3.7, 3.2, 2.7], demand: [3.2, 2.8, 1.3, 1.4, 2.4], stocks: [60, 65, 340, 300, 180] },
  cadiz: { name: 'カディス', nation: 'spain', x: 717, y: 203, supply: [0.8, 0.75, 2.8, 2.4, 3.4], demand: [2.8, 2.4, 1.5, 1.6, 1.7], stocks: [80, 70, 250, 240, 290] },
};
export const SHIPS = {
  sloop: { name: 'スループ', mode: 'sea', price: 1800, capacity: 30, speed: 150, range: 1800, daily: 3 },
  brig: { name: 'ブリッグ', mode: 'sea', price: 5200, capacity: 70, speed: 125, range: 5000, daily: 6 },
};
export const LANES = [
  ['kingston', 'havana', 620], ['london', 'cadiz', 1300],
  ['kingston', 'london', 4100], ['kingston', 'cadiz', 3800],
  ['havana', 'london', 4200], ['havana', 'cadiz', 3900],
];
export function distance(a, b) { return LANES.find(l => l.includes(a) && l.includes(b))?.[2] ?? Infinity; }
export function daysFor(type, a, b) { return Math.ceil(distance(a, b) / SHIPS[type].speed); }
