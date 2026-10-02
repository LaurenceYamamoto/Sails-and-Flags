import {CITIES} from './data.js';
import {ROADS} from './land-data.js';
import {createGame,entry,SAVE_VERSION} from './engine.js';

// The caller validates against the frozen v7 rules before reaching this function.
// Do not map unrelated cities to each other: return affected vehicles and assets.
export function migrateNetwork(s){
  const fresh=createGame(s.seed);
  for(const c of [s,...s.competitors]){
    const removed=new Set(c.routes.filter(r=>r.stops.some(id=>!Object.hasOwn(CITIES,id))).map(r=>r.id));
    let refund=0;
    for(const v of c.ships)if(removed.has(v.routeId)){
      refund+=v.cargo.reduce((sum,item)=>sum+item.total,0);
      Object.assign(v,{routeId:null,nextFrom:null,status:'idle',readyDay:0,voyage:null,cargo:[]});delete v.nextStop;
    }
    for(const [id,d] of Object.entries(s.world.development))if(!Object.hasOwn(CITIES,id)&&d.owner===c.industry.id)refund+=d.basis+d.invested+d.taxPool;
    for(const [id,d] of Object.entries(s.world.roads))if(!Object.hasOwn(ROADS,id)&&d.owner===c.industry.id)refund+=d.basis+d.invested+d.tollPool;
    c.routes=c.routes.filter(r=>!removed.has(r.id));
    if(refund)entry(c,'networkCompensation',refund);
    // Bankrupt rivals stop ticking. Resume at the world's date if the refund
    // clears their debt; do not simulate the paused interval a second time.
    if(c!==s&&c.gameOver&&c.cash>=0)c.day=s.day;
    c.gameOver=c.cash<0;c.version=SAVE_VERSION;
    if(removed.size||refund)c.networkMigration={removedRoutes:removed.size,refund};
  }
  for(const id of Object.keys(s.markets))if(!Object.hasOwn(CITIES,id)){delete s.markets[id];delete s.world.development[id];}
  for(const id of Object.keys(CITIES))if(!Object.hasOwn(s.markets,id)){s.markets[id]=fresh.markets[id];s.world.development[id]=fresh.world.development[id];}
  for(const id of Object.keys(s.world.roads))if(!Object.hasOwn(ROADS,id))delete s.world.roads[id];
  for(const id of Object.keys(ROADS))if(!Object.hasOwn(s.world.roads,id))s.world.roads[id]=fresh.world.roads[id];
  return s;
}
