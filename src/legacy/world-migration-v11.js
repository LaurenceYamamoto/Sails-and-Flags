import {CITIES,GOODS} from './data-v11.js';
import {WORLD_PORTS,WORLD_NATIONS,WORLD_GOODS,worldMarket} from './world-data-v11.js';
import {createWorld,RULES} from './security-v11.js';
// Input must first pass the immutable v10 validator. No RNG, time, cash,
// existing cargo policies, old market values or active voyages are changed.
export function migrateWorld(s){
  for(const [id,c] of Object.entries(CITIES)){
    if(WORLD_PORTS[id]){
      s.markets[id]=Object.fromEntries(GOODS.map((g,i)=>[g.id,{stock:c.stocks[i],production:c.supply[i],demand:c.demand[i]}]));
      s.world.development[id]={owner:'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0};
    }else for(const g of WORLD_GOODS)s.markets[id][g.id]=worldMarket(id,c,g);
  }
  s.world.pairs.push(...createWorld(s.day,s.seed).pairs.filter(p=>WORLD_NATIONS[p.a]||WORLD_NATIONS[p.b]));
  for(const c of [s,...s.competitors]){
    c.version=11;
    for(const n of Object.keys(WORLD_NATIONS)){
      c.diplomacy.friendship[n]=RULES.initial;c.diplomacy.investment[n]=0;c.diplomacy.tradeToday[n]=0;
      c.diplomacy.lastChange[n]={trade:0,enemies:0,investment:0};
    }
  }return s;
}
