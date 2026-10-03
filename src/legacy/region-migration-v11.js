import {CITIES,GOODS} from './data-v11.js';
import {REGION_CITIES,REGION_NATIONS,REGION_COMPANY,oilMarket} from './region-data-v11.js';
import {SAVE_VERSION,createCompetitor} from './engine-v11.js';
import {createWorld,RULES} from './security-v11.js';
import {monthFor} from './management-v11.js';

// Called only after the frozen v9 validator has accepted the entire old save.
// Additive content does not spend the player's money or advance any RNG.
export function migrateRegion(s){
  for(const [id,c] of Object.entries(CITIES)){
    if(Object.hasOwn(REGION_CITIES,id))s.markets[id]=Object.fromEntries(GOODS.map((g,i)=>[g.id,{stock:c.stocks[i],production:c.supply[i],demand:c.demand[i]}]));
    else s.markets[id].oliveOil=oilMarket(id,c);
  }
  for(const id of Object.keys(REGION_CITIES))s.world.development[id]={owner:'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0};
  s.world.pairs.push(...createWorld(s.day,s.seed).pairs.filter(p=>Object.hasOwn(REGION_NATIONS,p.a)||Object.hasOwn(REGION_NATIONS,p.b)));
  for(const c of [s,...s.competitors]){
    c.version=SAVE_VERSION;
    for(const n of Object.keys(REGION_NATIONS)){
      c.diplomacy.friendship[n]=RULES.initial;c.diplomacy.investment[n]=0;c.diplomacy.tradeToday[n]=0;
      c.diplomacy.lastChange[n]={trade:0,enemies:0,investment:0};
    }
  }
  const rival=createCompetitor(REGION_COMPANY,s.markets,s.world);
  rival.day=s.day;rival.automation.month=monthFor(s.day);rival.strategy.lastMonth=monthFor(s.day);
  for(const e of rival.ledger)e.day=s.day;
  for(const r of rival.routes){r.started=s.day;r.scheduleEpoch=s.day+1;r.cooldownUntil=s.day;r.transport.since=s.day;}
  for(const v of rival.ships)v.readyDay=s.day+1;
  s.competitors.push(rival);
  return s;
}
