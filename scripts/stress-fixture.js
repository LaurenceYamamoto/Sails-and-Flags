import {CITIES,NATIONS,distance,SHIPS} from '../src/data.js';
import {createGame,entry,buyLicense,openCircuit,circuitKey} from '../src/engine.js';

export function stressFixture(count=200) {
  const s=createGame(1700,{events:false}),keys=new Set();
  // Artificial capital isolates workload capacity from the economics of 200 overlapping routes.
  entry(s,'sale',100000000);s.companyName='Performance fixture';
  for(const id of Object.keys(NATIONS))if(!s.licenses.includes(id))buyLicense(s,id);
  const cities=Object.keys(CITIES).filter(id=>!CITIES[id].inland);
  outer:for(const a of cities)for(const b of cities)for(const c of cities){
    if(new Set([a,b,c]).size!==3)continue;
    const stops=[a,b,c],key=circuitKey(stops);
    if(keys.has(key)||stops.some((from,i)=>distance(from,stops[(i+1)%3])>SHIPS.fluyt.range))continue;
    keys.add(key);openCircuit(s,'fluyt',stops);
    if(s.routes.length===count)break outer;
  }
  if(s.ships.length!==count)throw Error('Unable to build stress fixture');
  return s;
}
