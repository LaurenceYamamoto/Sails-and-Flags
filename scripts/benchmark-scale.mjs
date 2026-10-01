import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {stressFixture} from './stress-fixture.js';
import {tick,serialize,deserialize} from '../src/engine.js';
const s=stressFixture(),times=[];
for(let i=0;i<365;i++){const start=performance.now();tick(s);times.push(performance.now()-start);}
const start=performance.now(),raw=serialize(s);deserialize(raw);const recoveryMs=performance.now()-start;
times.sort((a,b)=>a-b);
const report={node:process.version,platform:process.platform,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/1024**3),ships:s.ships.length,routes:s.routes.length,days:s.day,p95TickMs:times[Math.floor(times.length*.95)],maxTickMs:times.at(-1),saveBytes:Buffer.byteLength(raw),serializeAndValidateMs:recoveryMs};
console.log(JSON.stringify(report,null,2));
if(report.p95TickMs>50||recoveryMs>1000||s.day!==365)process.exitCode=1;
