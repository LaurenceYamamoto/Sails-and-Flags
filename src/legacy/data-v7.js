import {INLAND} from './land-data-v7.js';
import { PORT_GEOGRAPHY, project } from './geography-v7.js';
export const GOODS = [
  { id: 'sugar', name: '砂糖', base: 42 },
  { id: 'rum', name: 'ラム酒', base: 62 },
  { id: 'cloth', name: '織物', base: 85 },
  { id: 'tools', name: '工具', base: 105 },
  { id: 'food', name: '食料', base: 24 },
  { id: 'tobacco', name: 'タバコ', base: 72 },
  { id: 'timber', name: '木材', base: 35 },
  { id: 'cocoa', name: 'カカオ', base: 90 },
  { id: 'weapons', name: '武器', base: 125 },
];
export const NATIONS = {
  england: { name: 'イングランド', fee: 250, daily: 0.5, tax: 0.025, color: '#ef4444' },
  spain: { name: 'スペイン', fee: 250, daily: 0.5, tax: 0.025, color: '#facc15' },
  france: { name: 'フランス', fee: 300, daily: 0.6, tax: 0.03, color: '#60a5fa' },
  netherlands: { name: 'オランダ', fee: 300, daily: 0.6, tax: 0.02, color: '#fb923c' },
  portugal: { name: 'ポルトガル', fee: 250, daily: 0.5, tax: 0.025, color: '#4ade80' },
};
// Display coordinates are derived from geography.js; economic profiles are synthetic.
export const CITIES = {
  kingston: { name: 'キングストン', nation: 'england', supply: [1.5, 3.4, 0.55, 0.7, 2.5], demand: [2.4, 1.3, 2.2, 2.5, 2], stocks: [115, 330, 70, 60, 180] },
  havana: { name: 'ハバナ', nation: 'spain', supply: [3.6, 0.65, 0.6, 0.5, 2.8], demand: [1.3, 2.6, 2, 2, 2.1], stocks: [350, 65, 75, 65, 220] },
  london: { name: 'ロンドン', nation: 'england', supply: [0.55, 0.5, 3.7, 3.2, 2.7], demand: [3.2, 2.8, 1.3, 1.4, 2.4], stocks: [60, 65, 340, 300, 180] },
  cadiz: { name: 'カディス', nation: 'spain', supply: [0.8, 0.75, 2.8, 2.4, 3.4], demand: [2.8, 2.4, 1.5, 1.6, 1.7], stocks: [80, 70, 250, 240, 290] },
};
// Additional ports and their deliberately synthetic market profiles.
Object.assign(CITIES, {
  nantes: { name: 'ナント', nation: 'france' },
  amsterdam: { name: 'アムステルダム', nation: 'netherlands' },
  lisbon: { name: 'リスボン', nation: 'portugal' },
  santiago: { name: 'サンティアゴ', nation: 'spain' },
  santodomingo: { name: 'サントドミンゴ', nation: 'spain' },
  sanjuan: { name: 'サンフアン', nation: 'spain' },
  bridgetown: { name: 'ブリッジタウン', nation: 'england' },
  willemstad: { name: 'ウィレムスタット', nation: 'netherlands' },
});
const profiles = {
  nantes: [[60,65,290,230,190,60,350,60],[.5,.5,3,2.5,2.8,.4,3.5,.4],[2.8,2.6,1.5,1.6,2.5,2.4,1.4,2.1]],
  amsterdam: [[50,70,310,350,140,70,220,55],[.4,.6,3.3,3.8,1.8,.5,2.4,.4],[3,2.8,1.4,1.3,2.5,2.8,2,2.2]],
  lisbon: [[80,75,220,260,300,80,200,70],[.7,.6,2.4,2.8,3.6,.7,2.3,.6],[2.6,2.5,1.5,1.4,1.8,2.3,2,2]],
  santiago: [[300,190,65,65,200,360,220,130],[3.2,2,.5,.6,2.4,3.8,2.5,1.5],[1.4,1.6,2.3,2.5,2,1.2,1.8,1.8]],
  santodomingo: [[190,160,60,65,300,240,350,300],[2,1.8,.5,.6,3.4,2.5,3.7,3.3],[1.7,1.7,2.2,2.4,1.6,1.7,1.3,1.4]],
  sanjuan: [[210,190,65,60,280,320,180,120],[2.4,2,.5,.5,3.2,3.4,2,1.2],[1.5,1.6,2.4,2.6,1.7,1.3,2,1.8]],
  bridgetown: [[380,300,55,60,150,140,110,90],[4,3.3,.4,.5,1.6,1.4,1.2,.8],[1.2,1.3,2.6,2.6,2.3,1.7,2.2,1.8]],
  willemstad: [[120,130,220,190,100,180,150,330],[1.1,1.3,2.4,2.1,1,1.7,1.4,3.6],[2,2,1.8,1.9,2.6,2,2.3,1.3]],
};
for (const [id, city] of Object.entries(CITIES)) {
  Object.assign(city, PORT_GEOGRAPHY[id], project(PORT_GEOGRAPHY[id].lon, PORT_GEOGRAPHY[id].lat));
  if (profiles[id]) [city.stocks, city.supply, city.demand] = profiles[id];
  else { city.stocks.push(140, 160, 120); city.supply.push(1.5, 1.8, 1.3); city.demand.push(1.8, 1.9, 1.7); }
  const europe=city.lon>-20;
  city.stocks.push(europe?240:70);city.supply.push(europe?2.4:.5);city.demand.push(europe?1.6:1.3);
}
for(const [id,c] of Object.entries(INLAND)) CITIES[id]={...c,...project(c.lon,c.lat),name:c.mapName,inland:true,stocks:[60,65,80,75,360,60,340,80,65],supply:[.5,.5,.7,.6,3.8,.5,3.5,.7,.5],demand:[2.2,2.2,2.7,2.8,1.1,1.7,1.2,1.6,1.8]};
// Approximate nautical distances for gameplay; the six P1 distances stay fixed.
const coordinates = { kingston:[18,-76.8],havana:[23.1,-82.4],london:[51.5,0],cadiz:[36.5,-6.3],nantes:[47.2,-1.6],amsterdam:[52.4,4.9],lisbon:[38.7,-9.1],santiago:[20,-75.8],santodomingo:[18.5,-69.9],sanjuan:[18.5,-66.1],bridgetown:[13.1,-59.6],willemstad:[12.1,-68.9] };
export const SHIPS = {
  sloop: { name: 'スループ', mode: 'sea', price: 1800, capacity: 30, speed: 150, range: 1800, daily: 3, guns:6 },
  brig: { name: 'ブリッグ', mode: 'sea', price: 5200, capacity: 70, speed: 125, range: 5000, daily: 6, guns:12 },
  fluyt: { name: 'フリュート', mode: 'sea', price: 8500, capacity: 110, speed: 100, range: 5500, daily: 8, guns:4 },
};
export const LANES = [
  ['kingston', 'havana', 620], ['london', 'cadiz', 1300],
  ['kingston', 'london', 4100], ['kingston', 'cadiz', 3800],
  ['havana', 'london', 4200], ['havana', 'cadiz', 3900],
];
export function distance(a, b) {
  if (!Object.hasOwn(CITIES,a) || !Object.hasOwn(CITIES,b) || a === b || CITIES[a].inland || CITIES[b].inland) return Infinity;
  const fixed = LANES.find(l => l.includes(a) && l.includes(b)); if (fixed) return fixed[2];
  const [lat1,lon1] = coordinates[a].map(v=>v*Math.PI/180), [lat2,lon2] = coordinates[b].map(v=>v*Math.PI/180);
  const h = Math.sin((lat2-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin((lon2-lon1)/2)**2;
  return Math.max(80, Math.round(3440 * 2 * Math.asin(Math.min(1,Math.sqrt(h))) * 1.15 / 10)*10);
}
export function daysFor(type, a, b) { return Math.ceil(distance(a, b) / SHIPS[type].speed); }
