import {trimLegacyNations} from './legacy-nations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CITIES,GOODS} from '../src/data.js';
import {SIBERIAN_CITIES,SIBERIAN_ROADS} from '../src/siberian-data.js';
import {ROADS,roadBetween} from '../src/land-data.js';
import {PORT_APPROACHES,onLand} from '../src/sea-routing.js';
import {demandProfile} from '../src/demand-data.js';
import {bridge} from '../src/wasm-bridge.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
async function engine(){const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};}

test('Siberian and Mongolian towns connect Moscow, Beijing and Yakutsk with land-serviceable fur corridors',()=>{
 assert.equal(Object.keys(SIBERIAN_CITIES).length,14);assert.equal(Object.keys(SIBERIAN_ROADS).length,17);assert.equal(w.cities.length,274);assert.equal(w.roads.length,303);assert.equal(w.nations.length,48);
 assert.equal(w.cities[209].id,'kungur');assert.equal(w.cities[222].id,'yakutsk');
 const reached=new Set(['moscow']);for(let changed=true;changed;){changed=false;for(const r of Object.values(ROADS))if(reached.has(r.a)||reached.has(r.b))for(const id of [r.a,r.b])if(!reached.has(id)){reached.add(id);changed=true;}}
 for(const id of [...Object.keys(SIBERIAN_CITIES),'beijing'])assert.ok(reached.has(id),id);
 for(const [id,r]of Object.entries(SIBERIAN_ROADS)){assert.ok(r.km>0&&r.km<=2000,id);assert.ok(r.nations.every(n=>['russia','qing'].includes(n)));assert.equal(roadBetween(r.b,r.a)[0],id);}
 assert.deepEqual(SIBERIAN_ROADS.kyakhta_urga.nations,['russia','qing']);assert.equal(SIBERIAN_ROADS.urga_kalgan.climate,'arid');
 assert.equal(CITIES.kalgan.mapName,'張家口');assert.equal(CITIES.urga.mapName,'庫倫');
 for(const id of Object.keys(SIBERIAN_CITIES)){assert.equal(CITIES[id].inland,true);assert.equal(PORT_APPROACHES[id],undefined);}
});

test('Northern fur producers have stronger supply and import tea, silk and porcelain; display spacing is preserved',()=>{
 const good=id=>GOODS.findIndex(g=>g.id===id),get=id=>w.cities.find(c=>c.id===id),s=get('santiagodechile'),v=get('valparaiso'),minimum=Math.hypot(s.x-v.x,s.y-v.y);
 for(const id of Object.keys(SIBERIAN_CITIES)){
  const c=CITIES[id],d=get(id),p={x:d.displayX,y:d.displayY};assert.ok(c.demand.every(x=>x>0),id);
  for(const g of ['tea','silk','porcelain','spices','coffee'])assert.equal(c.supply[good(g)],0,id+' '+g);
  if(c.exports.includes('fur'))assert.ok(c.supply[good('fur')]>=3.2,id);
  assert.ok(onLand([p.x/2.5-180,90-p.y/2.5]));assert.ok(Math.hypot(p.x-c.x,p.y-c.y)<=3);
  for(const b of w.cities)if(b.id!==id){const q=b.id==='lima'?{x:b.x+1.7,y:b.y-1.7}:{x:b.displayX??b.x,y:b.displayY??b.y};assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=minimum-1e-9,id+' / '+b.id);}
  if(c.nation==='russia')assert.deepEqual(demandProfile(id,c),{region:'siberia',climate:'cold',south:false});
 }
 assert.ok(CITIES.yakutsk.supply[good('fur')]>CITIES.kyakhta.supply[good('fur')]);assert.equal(CITIES.beijing.supply[good('fur')],0);
 assert.ok(CITIES.hangzhou.supply[good('tea')]>3); // Existing Chinese tea sources remain available.
});

test('3.3.2 saves append Siberian markets and roads without altering any old state or diplomatic pairs',async()=>{
 const e=await engine(),old=e.save();old.city_version=4;trimLegacyNations(old);old.markets.length=209*e.data.goods.length;old.development.length=209;old.roads.length=202;old.markets[0].stock+=99;old.pairs[0].relation=10;old.pairs[0].until=60;old.roads[0].quality=2;
 e.load(old);const after=e.save();assert.equal(after.city_version,15);assert.equal(after.development.length,274);assert.equal(after.roads.length,303);const back=structuredClone(after);back.city_version=4;trimLegacyNations(back);back.markets.length=old.markets.length;back.development.length=209;back.roads.length=202;assert.deepEqual(back,old);
 assert.deepEqual(back.pairs,old.pairs);assert.deepEqual(back.companies,old.companies);
 for(const mutate of [g=>g.markets.pop(),g=>g.roads.push(g.roads[0]),g=>g.city_version=16,g=>g.development.pop()]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('Caravans operate all Siberian corridors and the cross-border circuit requires both licenses',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const g=e.save();g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;e.load(g);
 const city=id=>e.data.cities.findIndex(c=>c.id===id),nation=id=>e.data.nations.findIndex(n=>n.id===id),border=['kyakhta','urga'].map(city),q=()=>e.query({query:'opening',kind:'caravan',stops:border});
 assert.deepEqual([...q().missing].sort((a,b)=>a-b),[nation('russia'),nation('qing')].sort((a,b)=>a-b));e.cmd({action:'license',nation:nation('russia')});assert.deepEqual(q().missing,[nation('qing')]);
 assert.throws(()=>e.cmd({action:'openRoute',kind:'caravan',stops:border,allowed:[18],margin:10}));e.cmd({action:'license',nation:nation('qing')});
 for(const r of Object.values(SIBERIAN_ROADS)){const stops=[r.a,r.b].map(city);e.cmd({action:'openRoute',kind:'caravan',stops,allowed:e.data.goods.map((_,i)=>i),margin:10});}
 const stops=['irkutsk','verkhneudinsk','kyakhta','urga','kyakhta','verkhneudinsk'].map(city);e.cmd({action:'openRoute',kind:'caravan',stops,allowed:e.data.goods.map((_,i)=>i),margin:10});
 for(let n=0;n<400;){const days=Math.min(31,400-n);e.cmd({action:'tick',days});n+=days;}
 const saved=e.save();assert.equal(saved.companies[0].routes.length,18);assert.ok(saved.companies[0].routes.some(r=>r.deliveries>0));assert.ok(saved.companies[0].totals.sale>0);assert.ok(saved.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0));e.load(saved);assert.deepEqual(e.save(),saved);
});

test('Fur-only feeder and border services actually sell Siberian furs in Qing territory',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const g=e.save();g.companies[0].cash+=1e6;g.companies[0].initial_cash+=1e6;e.load(g);
 const fur=e.data.goods.findIndex(g=>g.id==='fur');for(const id of ['russia','qing'])e.cmd({action:'license',nation:e.data.nations.findIndex(n=>n.id===id)});
 // Feeder capacity must supply Kyakhta's own consumption before onward export.
 for(const [ids,count]of [[['verkhneudinsk','kyakhta'],8],[['kyakhta','urga'],4]])for(let i=0;i<count;i++)e.cmd({action:'openRoute',kind:'caravan',stops:ids.map(id=>e.data.cities.findIndex(c=>c.id===id)),allowed:[fur],margin:10});
 let soldInQing=false;for(let i=0;i<12;i++){e.cmd({action:'tick',days:31});soldInQing ||= e.save().companies[0].ledger.some(l=>l.category==='sale'&&l.detail.startsWith('urga · fur · '));}
 assert.ok(soldInQing,'fur cargo must be unloaded and sold in Urga');const p=e.save().companies[0];assert.equal(p.routes.length,2);assert.ok(p.routes.every(r=>r.deliveries>0));e.load(e.save());
});
