import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bridge} from '../src/wasm-bridge.js';
import {catalog,LANGUAGES,setLanguage,getLanguage,t,tx,nameOf,cityName,defaultCompanyName} from '../src/i18n.js';
import {traditionalTranslations} from '../src/translation-traditional.js';
import {cityNames} from '../src/city-names.js';
import {errorRows} from '../src/translation-errors.js';
import {diagnostic,eventText,ledgerDetail} from '../src/wasm-messages.js';
import {visibleRoutes} from '../src/wasm-lists.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const placeholders=s=>[...s.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();

test('all active UI phrases, accounting categories and catalog entities have complete translations',()=>{
 setLanguage('en');const required=new Set();
 for(const file of ['src/wasm-app.js','src/wasm-map.js','src/wasm-messages.js','src/wasm-charts.js']){
  const source=fs.readFileSync(file,'utf8');
  for(const m of source.matchAll(/\btx\('(?:[^'\\]|\\.)*',\s*'((?:[^'\\]|\\.)*)'/g))required.add(m[1].replaceAll("\\'","'"));
  for(const m of source.matchAll(/\bt\('([^']+)'/g))required.add(t(m[1]));
 }
 for(const group of ['nations','regions','goods','specs','starts'])for(const entity of world[group])required.add(nameOf(entity));
 for(const file of fs.readdirSync('wasm-core/src')){
  const source=fs.readFileSync('wasm-core/src/'+file,'utf8');
  for(const m of source.matchAll(/self\.entry\(\s*\w+,\s*"(\w+)"/g))required.add(t(m[1]));
 }
 for(const key of required){
  assert.ok(catalog[key],`Missing key: ${key}`);assert.equal(catalog[key].length,4,key);
  for(const text of [...catalog[key],traditionalTranslations[key]]){assert.equal(typeof text,'string',key);assert.ok(text.trim(),key);assert.deepEqual(placeholders(text),placeholders(key),key);}
 }
 assert.deepEqual(Object.keys(traditionalTranslations).sort(),Object.keys(catalog).sort());
});

test('East Asian cities use the requested script on maps, lists and route searches',()=>{
 for(const c of world.cities.filter(c=>/[\u3400-\u9fff]/.test(c.mapName??'')))assert.ok(cityNames[c.id],c.id);
 for(const lang of Object.keys(LANGUAGES)){
  setLanguage(lang);
  for(const [id,names]of Object.entries(cityNames)){
   const city=world.cities.find(c=>c.id===id);assert.ok(city,id);
   const label=cityName(city);assert.equal(nameOf(city),label);
   if(['en','fr','es'].includes(lang))assert.doesNotMatch(label,/[\u3400-\u9fff]/);
   if(lang==='ko')assert.match(label,/[가-힣]/);
   const routes=[{id:1,started:0,stops:[0],fleet:[],profit:0}];assert.equal(visibleRoutes(routes,[city],'opened',label.slice(0,2)).length,1);
  }
  assert.equal(cityName({id:'london',mapName:'London'}),'London');
 }
 setLanguage('ja');assert.equal(cityName({id:'guangzhou'}),'広州');
 setLanguage('zh-CN');assert.equal(cityName({id:'guangzhou'}),'广州');
 setLanguage('zh-TW');assert.equal(cityName({id:'guangzhou'}),'廣州');assert.equal(cityName({id:'jingdezhen'}),'景德鎮');
 setLanguage('ko');assert.equal(cityName({id:'hanseong'}),'한성');
});

test('Wasm stores localized new-company names and preserves renamed companies through save/load',async()=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));const call=bridge(instance);
 const cmd=command=>call({op:'command',command});
 for(const lang of Object.keys(LANGUAGES)){
  setLanguage(lang);const expected=defaultCompanyName();cmd({action:'new',name:expected});
  assert.equal(call({op:'view'}).companies[0].name,expected);
  if(lang!=='ja')assert.notEqual(expected,'あなたの会社');
 }
 const before=call({op:'save'});assert.throws(()=>cmd({action:'new',name:' '}));assert.equal(call({op:'save'}),before);
 cmd({action:'rename',kind:'company',name:'My 商会 & Co'});const saved=call({op:'save'});
 setLanguage('en');call({op:'load',text:saved});assert.equal(call({op:'view'}).companies[0].name,'My 商会 & Co');
 cmd({action:'new'});assert.equal(call({op:'view'}).companies[0].name,'Your company');
 const researchSave=JSON.parse(call({op:'save'}));researchSave.companies[0].technology[0]=100;call({op:'load',text:JSON.stringify(researchSave)});
 cmd({action:'research',kind:'sloop',budgets:[1,0,0,0,0]});const spec=call({op:'view'}).catalog.find(s=>s.id.startsWith('design-'));
 assert.match(nameOf(spec),/^Sloop design #/);
 setLanguage('zh-TW');assert.doesNotMatch(nameOf(spec),/Sloop|design/);
});

test('events, errors and ledger details follow language changes without translating custom names',()=>{
 for(const lang of ['en','zh-CN','zh-TW','ko','fr','es']){
  setLanguage(lang);for(const [ja]of errorRows)assert.notEqual(diagnostic(ja),ja);
  const event=eventText({kind:'war',message:'england / spain 開戦'},world);assert.doesNotMatch(event,/開戦|england|spain/);
  const warning=eventText({kind:'warning',message:'Custom & 商会: englandの友好度が低下しています'},world);assert.ok(warning.startsWith('Custom & 商会'));assert.doesNotMatch(warning,/の友好度/);
  assert.doesNotMatch(ledgerDetail({category:'purchase',detail:'guangzhou · sugar · 5'},world,world.specs,[]),/guangzhou|sugar/);
  assert.equal(ledgerDetail({category:'acquisition',detail:'Custom sugar'},world,[],[]),'Custom sugar');
 }
 setLanguage('en');assert.equal(getLanguage(),'en');setLanguage('unsupported');assert.equal(getLanguage(),'en');
 assert.equal(nameOf({id:'design-1',name:'スループ 設計 #1',nameEn:' design #1'}),'Sloop design #1');
 assert.equal(nameOf({id:'design-2',name:'Sugar',nameEn:'Sugar'}),'Sugar');
});

test('worker boot uses the locale default only when no save can be restored',async()=>{
 async function boot(saves){
  let name='Your company',resets=0;const messages=[];
  const core=request=>{
   if(request.op==='load'){if(request.text==='broken')throw Error('invalid');name=request.text;}
   if(request.op==='command'){name=request.command.name;resets++;}
   return request.op==='view'?{companies:[{name}]}:{};
  };
  const context=vm.createContext({bridge:()=>core,IndexedSaves:class{async list(){return saves;}async read(id){return saves.find(s=>s.id===id).text;}},fetch:()=>{},WebAssembly:{instantiateStreaming:async()=>({instance:{}})},postMessage:m=>messages.push(m)});
  vm.runInContext(fs.readFileSync('src/game-worker.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
  context.onmessage({data:{id:1,op:'boot',name:'Votre compagnie'}});
  await vm.runInContext('queue',context);
  const reply=messages.find(m=>m.id===1);assert.ok(reply.ok);return {name:reply.value.view.companies[0].name,resets};
 }
 assert.deepEqual(await boot([]),{name:'Votre compagnie',resets:1});
 assert.deepEqual(await boot([{id:'valid',text:'My 商会',savedAt:1,day:2}]),{name:'My 商会',resets:0});
 assert.deepEqual(await boot([{id:'bad',text:'broken',savedAt:2},{id:'good',text:'Saved company',savedAt:1,day:3}]),{name:'Saved company',resets:0});
});
