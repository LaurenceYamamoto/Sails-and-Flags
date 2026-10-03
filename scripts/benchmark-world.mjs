import {performance} from 'node:perf_hooks';
import {stressFixture} from './stress-fixture.js';
import {CITIES,NATIONS,distance} from '../src/data.js';
import {entry,buyLicense,buyShip,assignShip,routeShips,openCircuit,circuitKey,tick,serialize,deserialize} from '../src/engine.js';
const state=stressFixture(201),ports=Object.keys(CITIES).filter(id=>!CITIES[id].inland);
// Artificial capital isolates worst-case workload, not economic balance.
for(const c of state.competitors){
 entry(c,'sale',100000000);
 for(const n of Object.keys(NATIONS))if(!c.licenses.includes(n))buyLicense(c,n);
 outer:for(const [i,a] of ports.entries())for(const b of ports.slice(i+1)){
  if(c.routes.length===50)break outer;
  if(distance(a,b)<=10000&&!c.routes.some(r=>circuitKey(r.stops)===circuitKey([a,b])))openCircuit(c,'galleon',[a,b]);
 }
 for(const r of c.routes)while(routeShips(c,r).length<3)assignShip(c,r.id,buyShip(c,'galleon').id);
}
const initialRivals=state.competitors.map(c=>({routes:c.routes.length,ships:c.ships.length}));
const times=[];
for(let day=0;day<365;day++){const start=performance.now();tick(state);times.push(performance.now()-start);}
const start=performance.now(),raw=serialize(state);deserialize(raw);const saveMs=performance.now()-start;
times.sort((a,b)=>a-b);
const report={node:process.version,days:state.day,playerRoutes:state.routes.length,playerShips:state.ships.length,initialRivals,rivals:state.competitors.map(c=>({routes:c.routes.length,ships:c.ships.length})),p95TickMs:times[Math.floor(times.length*.95)],maxTickMs:times.at(-1),serializeAndValidateMs:saveMs,saveBytes:Buffer.byteLength(raw)};
console.log(JSON.stringify(report,null,2));
if(state.day!==365||report.p95TickMs>50||saveMs>1000||state.competitors.some(c=>c.routes.length>50))process.exitCode=1;
