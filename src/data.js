import {FRENCH_CARIBBEAN_PORTS} from './french-caribbean-data.js';
import {TARANTO_PORTS} from './taranto-data.js';
import {SIBERIAN_CITIES} from './siberian-data.js';
import {ATLANTIC_CITIES,ATLANTIC_NATIONS} from './atlantic-expansion-data.js';
import {EUROPE_PORTS,EUROPE_INLAND,EUROPE_NATIONS} from './europe-expansion-data.js';
import {EXPANSION_PORTS} from './port-expansion-data.js';
import {localProduction} from './production-data.js';
import {CROSSING_PORTS} from './crossing-data.js';
import {WORLD_PORTS,WORLD_NATIONS,WORLD_GOODS,worldMarket} from './world-data.js';
import {CONTINENTAL_CITIES,CONTINENTAL_NATIONS} from './continental-data.js';
import {REGION_NATIONS,REGION_CITIES,REGION_GOODS,oilMarket} from './region-data.js';
import {seaRoute} from './sea-routing.js';
import {INLAND} from './land-data.js';
import { PORT_GEOGRAPHY, project } from './geography.js';
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
  england: { tradePort:'london', name: 'イングランド', fee: 250, daily: 0.5, tax: 0.025, color: '#ef4444' },
  spain: { tradePort:'cadiz', name: 'スペイン', fee: 250, daily: 0.5, tax: 0.025, color: '#facc15' },
  france: { tradePort:'nantes', name: 'フランス', fee: 300, daily: 0.6, tax: 0.03, color: '#60a5fa' },
  netherlands: { tradePort:'amsterdam', name: 'オランダ', fee: 300, daily: 0.6, tax: 0.02, color: '#fb923c' },
  portugal: { tradePort:'lisbon', name: 'ポルトガル', fee: 250, daily: 0.5, tax: 0.025, color: '#4ade80' },
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
  porto:{name:'Porto',nation:'portugal'},
  barcelona:{name:'Barcelona',nation:'spain'},
  marseille:{name:'Marseille',nation:'france'},
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
  porto:[[65,65,280,150,300,60,330,65],[.5,.5,3.2,1.6,3.4,.5,3.6,.5],[2.7,2.6,1.4,2.5,1.8,2.3,1.4,2.2]],
  barcelona:[[60,60,350,280,160,65,130,60],[.5,.5,3.8,3,1.8,.5,1.4,.5],[2.8,2.7,1.3,1.6,2.7,2.2,2.6,2.3]],
  marseille:[[65,70,250,320,220,70,160,65],[.5,.6,2.7,3.5,2.5,.6,1.7,.5],[2.9,2.6,1.8,1.4,2.1,2.4,2.6,2.2]],
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
Object.assign(NATIONS,REGION_NATIONS);
Object.assign(CITIES,structuredClone(REGION_CITIES));
for(const id of Object.keys(REGION_CITIES))Object.assign(CITIES[id],PORT_GEOGRAPHY[id],project(PORT_GEOGRAPHY[id].lon,PORT_GEOGRAPHY[id].lat));
GOODS.push(...REGION_GOODS);
for(const [id,c] of Object.entries(CITIES)){const m=oilMarket(id,c);c.stocks.push(m.stock);c.supply.push(m.production);c.demand.push(m.demand);}
Object.assign(NATIONS,WORLD_NATIONS);
Object.assign(NATIONS,CONTINENTAL_NATIONS);
Object.assign(NATIONS,EUROPE_NATIONS);
Object.assign(NATIONS,ATLANTIC_NATIONS);
GOODS.push(...WORLD_GOODS);
for(const [id,c] of Object.entries(CITIES))for(const g of WORLD_GOODS){const m=worldMarket(id,c,g);c.stocks.push(m.stock);c.supply.push(m.production);c.demand.push(m.demand);}
for(const [id,c] of Object.entries({...WORLD_PORTS,...CROSSING_PORTS,...EXPANSION_PORTS,...EUROPE_PORTS,...Object.fromEntries(Object.entries(EUROPE_INLAND).map(([id,c])=>[id,{...c,inland:true}])),...ATLANTIC_CITIES,...SIBERIAN_CITIES,...FRENCH_CARIBBEAN_PORTS,...TARANTO_PORTS})){
 const markets=GOODS.map(g=>worldMarket(id,c,g));
 CITIES[id]={...c,...project(c.lon,c.lat),name:c.mapName,stocks:markets.map(m=>m.stock),supply:markets.map(m=>m.production),demand:markets.map(m=>m.demand)};
}
// New inland economies use their own regional export profiles for every good.
for(const id of Object.keys(CONTINENTAL_CITIES)){
 const c=CITIES[id],markets=GOODS.map(g=>worldMarket(id,c,g));
 Object.assign(c,{stocks:markets.map(m=>m.stock),supply:markets.map(m=>m.production),demand:markets.map(m=>m.demand)});
}
for(const [id,c]of Object.entries(CITIES))c.supply=c.supply.map((n,i)=>localProduction(id,c,GOODS[i].id,n));
export const SHIPS = {
  galleon:{name:'ガレオン',nameEn:'Galleon',mode:'sea',price:14500,capacity:100,speed:105,range:10000,daily:10,guns:24},
  sloop: { name: 'スループ', mode: 'sea', price: 1800, capacity: 30, speed: 150, range: 1800, daily: 3, guns:6 },
  brig: { name: 'ブリッグ', mode: 'sea', price: 5200, capacity: 70, speed: 125, range: 5000, daily: 6, guns:12 },
  fluyt: { name: 'フリュート', mode: 'sea', price: 8500, capacity: 110, speed: 100, range: 5500, daily: 8, guns:4 },
};
export function distance(a,b){return seaRoute(a,b)?.nm??Infinity;}
export function daysFor(type, a, b) { return Math.ceil(distance(a, b) / SHIPS[type].speed); }
