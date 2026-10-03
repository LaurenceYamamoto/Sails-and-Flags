import {CITIES,GOODS} from './data-v13.js';
import {CROSSING_PORTS,CROSSING_ROADS} from './crossing-data-v13.js';
// Only runs after the frozen v12 reader has validated the original save.
export function migrateCrossings(s){
 for(const id of Object.keys(CROSSING_PORTS)){
  const c=CITIES[id];
  s.markets[id]=Object.fromEntries(GOODS.map((g,i)=>[g.id,{stock:c.stocks[i],production:c.supply[i],demand:c.demand[i]}]));
  s.world.development[id]={owner:'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0};
 }
 for(const id of Object.keys(CROSSING_ROADS))s.world.roads[id]={owner:'state',basis:0,quality:0,security:0,invested:0,dailyRoad:0,dailySecurity:0,tollPool:0};
 for(const c of [s,...s.competitors])c.version=13;
 return s;
}
