import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createGame,buyLicense,openCircuit,tick,serialize,deserialize,assets,buyShip,assignShip} from '../src/engine.js';
import {setAutomation,setRouteAutomationShip} from '../src/management.js';
import {setDiplomacyInvestment} from '../src/security.js';
import {setTechnologyInvestment,buyShipyard,researchDesign,buyDevelopmentRight,setCityInvestment} from '../src/industry.js';

// Normal starting money, decisions made through the same public actions as the UI.
export function validateCampaign(seed,days=365*50) {
  let s=createGame(seed);buyLicense(s,'spain');openCircuit(s,'sloop',['kingston','havana']);
  setTechnologyInvestment(s,'shipbuilding',6);setTechnologyInvestment(s,'seafaring',2);
  const times=[],events={},decisions={},seenEvents=new Set(),seenDecisions=new Set();
  let built=false,developed=false,automated=false,restores=0,maxShips=1,maxRoutes=1;
  const start=performance.now();
  for(let day=0;day<days;day++) {
    const copy=day%365===0?deserialize(serialize(s)):null;
    const before=performance.now();tick(s);times.push(performance.now()-before);
    assert.equal(s.day,day+1,`seed ${seed} stopped at day ${s.day}`);
    assert.equal(s.gameOver,false,`seed ${seed} bankruptcy at ${s.day}`);
    if(copy){tick(copy);assert.deepEqual(copy,s,`seed ${seed} restore day ${s.day}`);restores++;}
    if(!s.industry.shipyard&&s.industry.technology.shipbuilding>=5&&s.cash>14000)buyShipyard(s);
    if(s.industry.shipyard&&!built&&s.cash>18000){const id=researchDesign(s,'sloop',{cargo:500,speed:800,guns:300,range:400,upkeep:600});assignShip(s,s.routes[0].id,buyShip(s,id).id);setRouteAutomationShip(s,s.routes[0].id,id);built=true;}
    if(!developed&&s.cash>22000){buyDevelopmentRight(s,'kingston');setCityInvestment(s,'kingston',1,1);developed=true;}
    if(built&&developed&&!automated){setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:5200,minCash:9000,expandThreshold:5,shrinkThreshold:0});automated=true;}
    // Long sea passages change cash flow. Stop discretionary investment when
    // the same visible cash reserve used by automation is under pressure.
    if(built&&developed){const invest=s.cash>12000;setTechnologyInvestment(s,'shipbuilding',invest?6:0);setTechnologyInvestment(s,'seafaring',invest?2:0);setCityInvestment(s,'kingston',invest?1:0,invest?1:0);}
    // A visible friendship buffer is a player-manageable policy, not privileged war knowledge.
    for(const nation of s.licenses)setDiplomacyInvestment(s,nation,s.diplomacy.friendship[nation]<55?.25:0);
    maxShips=Math.max(maxShips,s.ships.length);maxRoutes=Math.max(maxRoutes,s.routes.length);
    for(const e of [...s.world.events,...s.incidents]){const id=JSON.stringify(e);if(!seenEvents.has(id)){seenEvents.add(id);events[e.kind]=(events[e.kind]??0)+1;}}
    for(const e of s.managementLog){const id=JSON.stringify(e);if(!seenDecisions.has(id)){seenDecisions.add(id);decisions[e.reason]=(decisions[e.reason]??0)+1;}}
    assert.ok(s.automation.spent<=s.automation.monthlyBudget);
    if(day%365===0) {
      for(const c of [s,...s.competitors]) {
        const balance=c.initialCash+Object.values(c.totals).reduce((a,b)=>a+b,0);
        assert.ok(Math.abs(balance-c.cash)<Math.max(1e-5,Math.abs(c.cash)*1e-10),`accounting: ${seed}/${day}`);
        assert.ok(Number.isFinite(assets(c)));if(c.strategy)assert.ok(c.routes.length<=50);
      }
      for(const city of Object.values(s.markets))for(const market of Object.values(city))assert.ok(Number.isFinite(market.stock)&&market.stock>=0);
    }
  }
  assert.ok(built&&developed&&automated,'All investment and automation systems must actually be exercised');
  assert.ok(events.war>0&&events.peace>0&&events.raided>0);
  assert.ok(decisions.expanded>0);
  const raw=serialize(s);assert.deepEqual(deserialize(raw),s);
  times.sort((a,b)=>a-b);
  return {seed,days:s.day,elapsedMs:performance.now()-start,p95TickMs:times[Math.floor(times.length*.95)],maxTickMs:times.at(-1),cash:s.cash,assets:assets(s),ships:s.ships.length,maxShips,maxRoutes,firstRankDay:s.firstRankDay,restores,saveBytes:Buffer.byteLength(raw),events,decisions,competitors:s.competitors.map(c=>({name:c.name,bankrupt:c.gameOver,ships:c.ships.length,assets:assets(c)}))};
}
