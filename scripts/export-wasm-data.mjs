// Build-time conversion only. The browser never imports the reference JS engine.
import fs from 'node:fs';
import {CITIES,NATIONS,GOODS,SHIPS} from '../src/data.js';
import {ROADS,WAGONS,roadPoints} from '../src/land-data.js';
import {HULLS,HULL_LEVELS} from '../src/industry.js';
import {COMPANY_STARTS} from '../src/region-data.js';
import {SHIP_NAMES} from '../src/identity.js';
import {DEMAND_REGIONS,DEMAND_CLIMATES,demandProfile} from '../src/demand-data.js';
import {seaRoute,seaLines} from '../src/sea-routing.js';
import {LAND} from '../assets/maps/world-land.js';
import {project} from '../src/geography.js';
fs.mkdirSync('wasm-core/data',{recursive:true});
const nations=Object.entries(NATIONS).map(([id,n])=>({id,...n}));
const cities=Object.entries(CITIES).map(([id,c])=>{
 const p=demandProfile(id,c),cl=DEMAND_CLIMATES[p.climate];
 return {id,...c,region:p.region,nation:nations.findIndex(n=>n.id===c.nation),inland:!!c.inland,
  modifiers:GOODS.map(g=>(DEMAND_REGIONS[p.region].goods[g.id]??1)*(cl.goods[g.id]??1)),
  seasons:GOODS.map(g=>(cl.winter[g.id]??0)*(p.south?-1:1))};
});
const index=id=>cities.findIndex(c=>c.id===id),paths={},distances=cities.map(()=>cities.map(()=>null));
for(let a=0;a<cities.length;a++)for(let b=a+1;b<cities.length;b++)if(!cities[a].inland&&!cities[b].inland){
 const r=seaRoute(cities[a].id,cities[b].id);if(r){distances[a][b]=distances[b][a]=r.nm;paths[a+':'+b]=seaLines(cities[a].id,cities[b].id);}
}
const roads=Object.entries(ROADS).map(([id,r])=>({id,...r,a:index(r.a),b:index(r.b),nations:r.nations.map(n=>nations.findIndex(x=>x.id===n)),points:roadPoints(r.a,r.b)}));
const specs=Object.entries({...SHIPS,wagon:{...WAGONS.wagon,roughness:.1},caravan:{name:'キャラバン',nameEn:'Caravan',mode:'land',price:900,capacity:22,speed:30,range:2500,daily:1.6,guns:0,roughness:.8},corvette:HULLS.corvette}).map(([id,s])=>({id,...s,level:HULL_LEVELS[id]??0}));
const starts=COMPANY_STARTS.map(c=>({...c,stops:c.stops.map(index)}));
const land=LAND.map(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>{const p=project(lon,lat);return `${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join('')+'Z').join('')).join('');
fs.writeFileSync('wasm-core/data/world.json',JSON.stringify({cities,regions:Object.entries(DEMAND_REGIONS).map(([id,r])=>({id,name:r.label[0],nameEn:r.label[1]})),nations,goods:GOODS,roads,specs,starts,shipNames:SHIP_NAMES,distances,paths,land}));
console.log(`Exported ${cities.length} cities, ${nations.length} nations, ${roads.length} roads`);
