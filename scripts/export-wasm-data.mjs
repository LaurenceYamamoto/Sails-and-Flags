import {INDOCHINA_ROADS} from '../src/indochina-data.js';
import {ASIA_ADDED_ROADS} from '../src/asia-road-revisions.js';
import {ASIA_ROADS} from '../src/asia-expansion-data.js';
import {layoutAddedCities} from './layout-map-cities.mjs';
// Build-time conversion only. The browser never imports the reference JS engine.
import fs from 'node:fs';
import {CITIES,NATIONS,GOODS,SHIPS} from '../src/data.js';
import {ROADS,ROAD_SLOTS,WAGONS,roadPoints} from '../src/land-data.js';
import {HULLS,HULL_LEVELS} from '../src/industry.js';
import {RIVAL_STARTS} from '../src/rival-starts.js';
import {SHIP_NAMES} from '../src/identity.js';
import {DEMAND_REGIONS,DEMAND_CLIMATES,demandProfile} from '../src/demand-data.js';
import {seaRoute,seaLines} from '../src/sea-routing.js';
import {LAND} from '../assets/maps/world-land.js';
import {project} from '../src/geography.js';
import {landSegment} from '../src/world-geometry.js';
import {COASTAL_ROAD_VIA} from '../src/coastal-road-data.js';
import {KOREA_ROADS} from '../src/korea-expansion-data.js';
fs.mkdirSync('wasm-core/data',{recursive:true});
const nations=Object.entries(NATIONS).map(([id,n])=>({id,...n}));
const cities=Object.entries(CITIES).map(([id,c])=>{
 const p=demandProfile(id,c),cl=DEMAND_CLIMATES[p.climate];
 return {id,...c,region:p.region,nation:nations.findIndex(n=>n.id===c.nation),inland:!!c.inland,
  modifiers:GOODS.map(g=>(DEMAND_REGIONS[p.region].goods[g.id]??1)*(cl.goods[g.id]??1)),
  seasons:GOODS.map(g=>(cl.winter[g.id]??0)*(p.south?-1:1))};
});
layoutAddedCities(cities);
const index=id=>cities.findIndex(c=>c.id===id),paths={},distances=cities.map(()=>cities.map(()=>null));
for(let a=0;a<cities.length;a++)for(let b=a+1;b<cities.length;b++)if(!cities[a].inland&&!cities[b].inland){
 const r=seaRoute(cities[a].id,cities[b].id);if(r){distances[a][b]=distances[b][a]=r.nm;paths[a+':'+b]=seaLines(cities[a].id,cities[b].id);}
}
const roads=Object.entries(ROAD_SLOTS).map(([id,r])=>({id,...r,a:index(r.a),b:index(r.b),nations:r.nations.map(n=>nations.findIndex(x=>x.id===n)),points:roadPoints(r.a,r.b)}));
// Check the actual map endpoints, including city presentation offsets.
for(const id of [...Object.keys(COASTAL_ROAD_VIA),...Object.keys(KOREA_ROADS),...Object.keys(ASIA_ROADS),...Object.keys(ASIA_ADDED_ROADS),...Object.keys(INDOCHINA_ROADS)]){
 const r=roads.find(r=>r.id===id);if(r.retired)continue;const points=r.points.map(p=>({...p}));
 for(const [at,ci] of [[0,r.a],[points.length-1,r.b]]){const c=cities[ci];points[at]={x:c.displayX??c.x,y:c.displayY??c.y};}
 const coordinates=points.map(p=>[p.x/2.5-180,90-p.y/2.5]);
 for(let i=1;i<coordinates.length;i++)if(!landSegment(coordinates[i-1],coordinates[i]))throw Error(`Road crosses water: ${id}, segment ${i}`);
}
const specs=Object.entries({...SHIPS,wagon:{...WAGONS.wagon,roughness:.1},caravan:{name:'キャラバン',nameEn:'Caravan',mode:'land',price:900,capacity:22,speed:30,range:2500,daily:1.6,guns:0,roughness:.8},corvette:HULLS.corvette}).map(([id,s])=>({id,...s,level:HULL_LEVELS[id]??0}));
const starts=RIVAL_STARTS.map(c=>{
 const licenses=c.licenses.map(id=>nations.findIndex(n=>n.id===id));
 if(licenses.some(n=>n<0)||new Set(licenses).size!==licenses.length)throw Error('Invalid starting licenses: '+c.id);
 let fleetCost=0;
 const routes=c.routes.map(r=>{
  const stops=r.stops.map(index),spec=specs.find(s=>s.id===r.kind);
  if(!spec||stops.length<2||stops.length>12||stops.some(i=>i<0)||!Number.isInteger(r.fleet)||r.fleet<1)throw Error('Invalid starting fleet: '+c.id);
  for(let i=0;i<stops.length;i++){
   const a=stops[i],b=stops[(i+1)%stops.length],road=roads.find(r=>!r.retired&&((r.a===a&&r.b===b)||(r.a===b&&r.b===a)));
   const distance=spec.mode==='land'?road?.km:distances[a][b];
   const required=spec.mode==='land'?road?.nations:[cities[a].nation,cities[b].nation];
   if(a===b||distance==null||distance>spec.range||!required?.every(n=>licenses.includes(n)))throw Error('Unserviceable starting route: '+c.id+' '+cities[a].id+' / '+cities[b].id);
  }
  fleetCost+=spec.price*r.fleet;return {...r,stops};
 });
 if(!Number.isFinite(c.capital)||fleetCost>=c.capital)throw Error('Insufficient starting capital: '+c.id);
 return {...c,licenses,routes};
});
const land=LAND.map(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>{const p=project(lon,lat);return `${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join('')+'Z').join('')).join('');
fs.writeFileSync('wasm-core/data/world.json',JSON.stringify({cities,regions:Object.entries(DEMAND_REGIONS).map(([id,r])=>({id,name:r.label[0],nameEn:r.label[1]})),nations,goods:GOODS,roads,specs,starts,shipNames:SHIP_NAMES,distances,paths,land}));
console.log(`Exported ${cities.length} cities, ${nations.length} nations, ${roads.length} roads`);
