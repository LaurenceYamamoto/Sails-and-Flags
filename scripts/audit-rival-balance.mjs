import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
const rows=[];
for (const seed of [1700,1701,1702]) {
 call({op:'command',command:{action:'new',seed,events:process.argv.includes('--events')}});
 for(let month=0;month<=36;month++) {
  const g=JSON.parse(call({op:'save'}));
  if(month%3===0)rows.push({seed,day:g.day,companies:g.companies.slice(1).map(c=>({id:c.id,cash:Math.round(c.cash),bankrupt:c.bankrupt,posts:Object.keys(c.posts).length,routes:c.routes.length,ships:c.ships.length,deliveries:c.routes.reduce((n,r)=>n+r.transport.deliveries,0),totals:c.totals,tech:c.technology}))});
  if(month<36)call({op:'command',command:{action:'tick',days:30}});
 }
}
fs.writeFileSync(process.argv[2]||'AgentNote/rival-balance-audit.json',JSON.stringify(rows,null,2)+'\n');
for(const r of rows.filter(r=>r.seed===1700))console.log(r.day,r.companies.map(c=>`${c.id}: ${c.cash} (${c.posts} posts, ${c.routes} routes) ${c.bankrupt?'BANKRUPT':''}`).join('; '));
