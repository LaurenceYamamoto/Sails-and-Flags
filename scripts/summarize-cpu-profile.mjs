// CPU samples diagnose hot functions; benchmark timings are collected without
// profiling. Inlining means these are not exact causal cost percentages.
import fs from 'node:fs';
const profile=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const totals=new Map();
for(const node of profile.nodes){
 const name=node.callFrame.functionName.replace(/\[[0-9a-f]+\]/g,'');
 totals.set(name,(totals.get(name)??0)+(node.hitCount??0));
}
console.log(JSON.stringify({samples:profile.samples.length,durationMs:(profile.endTime-profile.startTime)/1000,
 functions:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,40)
  .map(([name,samples])=>({name,samples,percent:100*samples/profile.samples.length}))},null,2));
