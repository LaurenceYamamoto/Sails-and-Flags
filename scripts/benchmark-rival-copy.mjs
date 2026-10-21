// Do not run builds/tests at the same time as this benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const baseline='sites/rival-copy-before';
// Keep the original local snapshot; on another checkout restore the published
// baseline directly from Git without changing the working tree or text bytes.
if(!fs.existsSync(baseline+'/engine_bg.wasm')){
 const prefix='assets/wasm/shared/';
 const files=execFileSync('git',['ls-tree','-r','--name-only','4.1.6','--',prefix],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 if(!files.length)throw Error('The 4.1.6 baseline branch is required');
 for(const file of files){
  const target=path.join(baseline,file.slice(prefix.length));
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,execFileSync('git',['show',`4.1.6:${file}`],{maxBuffer:32*1024*1024}));
 }
}
const scenarios=[['600',{BENCH_SHIPS_PER_ROUTE:'10'}],['2400',{BENCH_SHIPS_PER_ROUTE:'40'}],['warehouse',{BENCH_SHIPS_PER_ROUTE:'10',BENCH_WAREHOUSE:'1'}],['warehouse2400',{BENCH_SHIPS_PER_ROUTE:'40',BENCH_WAREHOUSE:'1'}]];
if(process.env.BENCH_SAVE)scenarios.push(['provided',{BENCH_SAVE:process.env.BENCH_SAVE}]);
const results=[];
for(const [name,env] of scenarios){
 const result=JSON.parse(execFileSync(process.execPath,['scripts/benchmark-shared-optimization.mjs'],{
  encoding:'utf8',maxBuffer:16*1024*1024,timeout:1800000,
  env:{...process.env,BENCH_SAVE:'',BENCH_WAREHOUSE:'0',BENCH_SHIPS_PER_ROUTE:'10',BENCH_BEFORE:'sites/rival-copy-before',...env},stdio:['ignore','pipe','inherit']}));
 results.push({scenario:name,...result});
 fs.writeFileSync(`sites/rival-copy-benchmark-${name}.json`,JSON.stringify(result,null,2)+'\n');
}
fs.writeFileSync('AgentNote/2026-10-21-rival-copy-benchmark.json',JSON.stringify({baseline:'4.1.6 f6f6e61086b3da6ee41f6e87abcf6968901861ff',results},null,2)+'\n');
for(const r of results){
 const avg=label=>{const rows=r.rows.filter(x=>x.label===label);return rows.reduce((a,x)=>a+x.meanMs,0)/rows.length;};
 console.log(JSON.stringify({scenario:r.scenario,before:avg('before/adaptive'),after:avg('after/adaptive'),reductionPercent:100*(1-avg('after/adaptive')/avg('before/adaptive')),exact:r.exactAllModesMatch}));
}
