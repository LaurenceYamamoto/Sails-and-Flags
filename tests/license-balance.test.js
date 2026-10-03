import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,buyLicense,tick,serialize,deserialize,entry,openCircuit} from '../src/engine.js';
import {NATIONS} from '../src/data.js';
import {licenseTerms,licensePurchaseCost,revokeLicense} from '../src/security.js';
import {acquisitionQuote,acquireCompany,runCompetitor} from '../src/management.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('license purchases use the pre-purchase count and quoted fee, with no partial insufficient purchase',()=>{
 const s=createGame(42,{events:false});
 assert.equal(licenseTerms(s,'spain').fee,250);buyLicense(s,'spain');assert.equal(s.cash,4750);
 assert.equal(licenseTerms(s,'france').fee,900);buyLicense(s,'france');assert.equal(s.cash,3850);
 assert.equal(licenseTerms(s,'portugal').fee,2250);assert.equal(s.totals.licensePurchase,-1150);
 const poor=createGame(42,{events:false});entry(poor,'upkeep',-4751);const raw=serialize(poor);
 assert.throws(()=>buyLicense(poor,'spain'),/資金/);assert.equal(serialize(poor),raw);
 entry(poor,'sale',1);buyLicense(poor,'spain');assert.equal(poor.cash,0);assert.equal(poor.gameOver,false);
 const owned=serialize(s);assert.throws(()=>buyLicense(s,'spain'));assert.equal(serialize(s),owned);
});

test('upkeep is ten times the old rate for every nation and friendship, independent of license count',()=>{
 const s=createGame(42);
 for(const n of Object.keys(NATIONS))for(const friendship of [30,60,100]){
  s.diplomacy.friendship[n]=friendship;const factor=1+(60-friendship)/100;
  const one=licenseTerms(s,n);near(one.daily,NATIONS[n].daily*factor*10);near(one.tax,(15-friendship*.1)/100);
  near(one.fee,NATIONS[n].fee*factor);
  const many=licenseTerms(s,n,20);assert.equal(many.daily,one.daily);assert.equal(many.tax,one.tax);near(many.fee,NATIONS[n].fee*3**20*factor);
 }
 const quiet=createGame(42,{events:false});buyLicense(quiet,'spain');buyLicense(quiet,'france');const cash=quiet.cash;
 tick(quiet);assert.equal(quiet.totals.licenseDaily,-9);assert.equal(quiet.cash,cash-9);
 assert.deepEqual(deserialize(serialize(quiet)),quiet);
});

test('revocation lowers the current count for repurchase without changing upkeep',()=>{
 const s=createGame(42,{events:false});buyLicense(s,'spain');buyLicense(s,'france');
 revokeLicense(s,'spain');assert.equal(licenseTerms(s,'spain').fee,450);assert.equal(licenseTerms(s,'england').daily,5);
 s.world.enabled=true;s.diplomacy.friendship.spain=29;const raw=serialize(s);
 assert.throws(()=>buyLicense(s,'spain'),/友好度/);assert.equal(serialize(s),raw);
});

test('bulk license quote matches sequential purchases, skips owned licenses and duplicates',()=>{
 const s=createGame(42,{events:false});buyLicense(s,'england');const raw=serialize(s);
 assert.equal(licensePurchaseCost(s,['england','france','netherlands','france']),3600);assert.equal(serialize(s),raw);
 buyLicense(s,'france');buyLicense(s,'netherlands');assert.equal(s.totals.licensePurchase,-3850);
});

test('buyout quotes escalating missing licenses and accepts exact funds without partial failure',()=>{
 const s=createGame(42,{events:false}),q=acquisitionQuote(s,0);
 assert.deepEqual(q.missing,['france','netherlands']);assert.equal(q.licenseCost,1200);
 entry(s,'sale',q.required-1-s.cash);const before=serialize(s);assert.throws(()=>acquireCompany(s,0));assert.equal(serialize(s),before);
 entry(s,'sale',1);acquireCompany(s,0);near(s.cash,q.cash);assert.equal(s.totals.licensePurchase,-1200);
 assert.ok(s.licenses.includes('netherlands'));assert.deepEqual(deserialize(serialize(s)),s);
});

test('rival expansion pays the sequentially quoted license fees and keeps its reserve',()=>{
 const s=createGame(1700,{events:false}),c=s.competitors[0],original=structuredClone(c),cash=c.cash;
 s.day=c.day=31;runCompetitor(c);
 const missing=c.licenses.filter(n=>!original.licenses.includes(n));
 assert.ok(c.routes.length>original.routes.length);assert.ok(missing.length>0);
 near(-(c.totals.licensePurchase??0),licensePurchaseCost(original,missing));
 assert.ok(c.cash>=6000);assert.ok(c.cash<cash);
});

test('existing 2.4.0 save loads unchanged and uses the new rate only on subsequent days',()=>{
 const raw=readFileSync(new URL('../AgentNote/consumption-browser-fixture.json',import.meta.url),'utf8');
 const s=deserialize(raw);assert.deepEqual(JSON.parse(serialize(s)),JSON.parse(raw));
 const cash=s.cash;tick(s,{runCompetitors:false});assert.equal(s.cash,cash-5);
});

test('new companies start without licenses, can choose any first country, and tutorial purchases are affordable',()=>{
 const s=createGame(42,{events:false});assert.deepEqual(s.licenses,[]);assert.equal(s.cash,5000);assert.equal(s.totals.licensePurchase,undefined);
 assert.deepEqual(deserialize(serialize(s)),s);tick(s);assert.equal(s.cash,5000);assert.equal(s.totals.licenseDaily,undefined);
 for(const n of Object.keys(NATIONS))assert.equal(licenseTerms(s,n).fee,NATIONS[n].fee);
 const saved=serialize(s);assert.throws(()=>openCircuit(s,'sloop',['kingston','havana']));assert.equal(serialize(s),saved);
 buyLicense(s,'england');buyLicense(s,'spain');assert.equal(s.totals.licensePurchase,-1000);openCircuit(s,'sloop',['kingston','havana']);assert.equal(s.cash,2200);
 for(let i=0;i<30;i++)tick(s);assert.ok(s.routes[0].deliveries>0);assert.equal(s.gameOver,false);assert.deepEqual(deserialize(serialize(s)),s);
 const spanish=createGame(42,{events:false});buyLicense(spanish,'spain');openCircuit(spanish,'sloop',['santiago','sanjuan']);assert.deepEqual(spanish.licenses,['spain']);
});

test('fees triple at every ownership count including large holdings and bulk orders',()=>{
 const s=createGame(42,{events:false});
 for(let count=0;count<Object.keys(NATIONS).length;count++){
  const cost=licenseTerms(s,'spain',count).fee;assert.equal(cost,250*3**count);assert.ok(Number.isFinite(cost));
  if(count)assert.equal(cost,3*licenseTerms(s,'spain',count-1).fee);
 }
 const nations=Object.keys(NATIONS);const quoted=licensePurchaseCost(s,nations);entry(s,'sale',quoted);const cash=s.cash;for(const n of nations)buyLicense(s,n);near(cash-s.cash,quoted);assert.equal(s.licenses.length,nations.length);assert.deepEqual(deserialize(serialize(s)),s);
});

test('acquisition with many licenses preserves large quoted fees in management history and saves',()=>{
 const s=createGame(42,{events:false});entry(s,'sale',1e14);
 for(const n of Object.keys(NATIONS))if(!['france','netherlands'].includes(n))buyLicense(s,n);
 const q=acquisitionQuote(s,0),cash=s.cash;assert.ok(q.licenseCost>1e12);
 acquireCompany(s,0);near(s.cash,cash-q.price-q.licenseCost+q.cash);
 assert.equal(s.managementLog.find(e=>e.reason==='acquired').cost,q.price+q.licenseCost);
 assert.deepEqual(deserialize(serialize(s)),s);
 for(const cost of [-1,Infinity,NaN]){
  const corrupt=structuredClone(s);corrupt.managementLog.find(e=>e.reason==='acquired').cost=cost;
  assert.throws(()=>deserialize(serialize(corrupt)),/経営履歴/);
 }
});
