import {CITIES,GOODS} from './data.js';
import {CONTINENTAL_CITIES,CONTINENTAL_ROADS,CONTINENTAL_NATIONS} from './continental-data.js';
import {createWorld,RULES} from './security.js';
// Only called after the frozen v11 reader has validated the complete old save.
export function migrateContinents(s){
 for(const id of Object.keys(CONTINENTAL_CITIES)){
  const c=CITIES[id];
  s.markets[id]=Object.fromEntries(GOODS.map((g,i)=>[g.id,{stock:c.stocks[i],production:c.supply[i],demand:c.demand[i]}]));
  s.world.development[id]={owner:'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0};
 }
 for(const id of Object.keys(CONTINENTAL_ROADS))s.world.roads[id]={owner:'state',basis:0,quality:0,security:0,invested:0,dailyRoad:0,dailySecurity:0,tollPool:0};
 s.world.pairs.push(...createWorld(s.day,s.seed).pairs.filter(p=>CONTINENTAL_NATIONS[p.a]||CONTINENTAL_NATIONS[p.b]));
 for(const c of [s,...s.competitors]){
  c.version=12;
  for(const n of Object.keys(CONTINENTAL_NATIONS)){
   c.diplomacy.friendship[n]=RULES.initial;c.diplomacy.investment[n]=0;c.diplomacy.tradeToday[n]=0;
   c.diplomacy.lastChange[n]={trade:0,enemies:0,investment:0};
  }
 }
 return s;
}
