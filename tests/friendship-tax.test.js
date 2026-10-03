import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,entry,trade,quote,serialize,deserialize} from '../src/engine.js';
import {NATIONS} from '../src/data.js';
import {licenseTerms,revokeLicense} from '../src/security.js';
import {renderDiplomacy} from '../src/security-view.js';
import {setLanguage} from '../src/i18n.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('all countries use the friendship tax formula, including threshold values and fractional friendship',()=>{
 for(const events of [true,false]){
  const s=createGame(42,{events});
  for(const n of Object.keys(NATIONS))for(const [friendship,percent] of [[0,15],[10,14],[20,13],[30,12],[60,9],[99.5,5.05],[100,5]]){
   s.diplomacy.friendship[n]=friendship;
   near(licenseTerms(s,n).tax,percent/100);
  }
 }
});

test('any first nation gains friendship 100 after the quoted purchase, while subsequent countries and rivals keep their relations',()=>{
 for(const first of Object.keys(NATIONS)){
  const s=deserialize(serialize(createGame(42))),beforeRivals=s.competitors.map(c=>structuredClone(c.diplomacy));
  const quoted=licenseTerms(s,first).fee,cash=s.cash;
  buyLicense(s,first);near(s.cash,cash-quoted);assert.equal(s.diplomacy.friendship[first],100);assert.equal(s.diplomacy.firstLicensePending,false);
  assert.equal(licenseTerms(s,first).tax,.05);near(licenseTerms(s,first).daily,NATIONS[first].daily*6);
  for(const n of Object.keys(NATIONS))if(n!==first)assert.equal(s.diplomacy.friendship[n],60);
  const second=Object.keys(NATIONS).find(n=>n!==first);buyLicense(s,second);assert.equal(s.diplomacy.friendship[second],60);
  assert.deepEqual(s.competitors.map(c=>c.diplomacy),beforeRivals);assert.deepEqual(deserialize(serialize(s)),s);
 }
});

test('failed purchase never grants the bonus; revocation and reload never grant it twice',()=>{
 const poor=createGame(42);entry(poor,'upkeep',-4751);const before=serialize(poor);
 assert.throws(()=>buyLicense(poor,'england'));assert.equal(serialize(poor),before);
 assert.throws(()=>buyLicense(poor,'invalid'));assert.equal(serialize(poor),before);
 const s=createGame(42);s.diplomacy.friendship.england=29;const denied=serialize(s);
 assert.throws(()=>buyLicense(s,'england'));assert.equal(serialize(s),denied);
 s.diplomacy.friendship.england=60;buyLicense(s,'england');revokeLicense(s,'england');s.diplomacy.friendship.england=40;
 const restored=deserialize(serialize(s));buyLicense(restored,'england');assert.equal(restored.diplomacy.friendship.england,40);
 revokeLicense(restored,'england');buyLicense(restored,'spain');assert.equal(restored.diplomacy.friendship.spain,60);
});

test('old saves do not receive retroactive bonuses and malformed pending bonuses are rejected',()=>{
 const s=createGame(42);delete s.diplomacy.firstLicensePending;const raw=serialize(s),old=deserialize(raw);
 assert.equal(serialize(old),raw);buyLicense(old,'england');assert.equal(old.diplomacy.friendship.england,60);
 for(const bad of ['true',1,null]){const corrupt=createGame(42);corrupt.diplomacy.firstLicensePending=bad;assert.throws(()=>deserialize(serialize(corrupt)),/外交設定/);}
 const used=createGame(42);buyLicense(used,'england');used.diplomacy.firstLicensePending=true;assert.throws(()=>deserialize(serialize(used)),/外交設定/);
 const rival=createGame(42);rival.competitors[0].diplomacy.firstLicensePending=true;assert.throws(()=>deserialize(serialize(rival)),/外交設定/);
});

test('actual buy and sell payments and tax ledger follow the displayed friendship rate',()=>{
 for(const events of [true,false])for(const friendship of [20,60,100])for(const side of ['buy','sell']){
  const s=createGame(42,{events});buyLicense(s,'england');s.diplomacy.friendship.england=friendship;
  const cash=s.cash,value=quote('food',s.markets.kingston.food.stock,3,side).value,rate=(15-friendship*.1)/100;
  const result=trade(s,'kingston','food',3,side);
  near(result.total,value*(side==='buy'?1+rate:1-rate));near(s.cash-cash,side==='buy'?-result.total:result.total);
  near(s.totals.tax,-value*rate);assert.deepEqual(deserialize(serialize(s)),s);
 }
 const s=createGame(42);buyLicense(s,'england');setLanguage('en');
 const html=renderDiplomacy(s,{cash:n=>String(n),decimal:n=>String(n)});
 assert.match(html,/Transaction tax \(%\) = 15 − friendship × 0.1/);assert.match(html,/England · Friendship 100/);assert.match(html,/\/ 5%/);setLanguage('ja');
});
