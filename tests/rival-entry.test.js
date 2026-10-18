import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {RIVAL_STARTS,RIVAL_RESERVES} from '../src/rival-starts.js';
import {sortedCompanies} from '../src/wasm-lists.js';
import {nameOf,setLanguage} from '../src/i18n.js';
import {eventText} from '../src/wasm-messages.js';
const step=n=>(Math.imul(n,1664525)+1013904223)>>>0;
function entrySeed(candidate){for(let n=0;n<1000000;n++){const next=step(n);if(next/2**32<.005&&Math.floor(step(next)/2**32*26)===candidate)return n;}throw Error('seed unavailable');}

test('reserve rivals enter from daily chance, retain seeded state and remain bounded across saves',async()=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance),cmd=command=>call({op:'command',command}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const catalog=call({op:'catalog'}),initial=save();
 const released=bridge((await WebAssembly.instantiate(execFileSync('git',['show','4.1.0:assets/wasm/engine.wasm'],{maxBuffer:30e6}))).instance);
 const old=JSON.parse(released({op:'save'}));load(old);assert.deepEqual(save(),old);load(initial);
 assert.equal(catalog.rivals.length,26);assert.equal(initial.companies.length,15);assert.deepEqual(initial.companies.slice(1).map(c=>c.id),RIVAL_STARTS.map(c=>c.id));
 assert.ok(RIVAL_RESERVES.every(r=>!initial.companies.some(c=>c.id===r.id)));
 // Isolate entry from trading RNG and expenses. All old companies are acquired;
 // their templates may return, while their transferred assets are not restored.
 const fixture=structuredClone(initial);fixture.day=100;fixture.rng=entrySeed(21);
 for(const c of fixture.companies.slice(1)){c.acquired=true;c.posts={};}
 fixture.companies[0].technology.fill(12);load(fixture);cmd({action:'tick',days:1});const entered=save(),co=entered.companies.at(-1);
 assert.equal(entered.roster_version,7);assert.equal(co.id,'company-22');assert.equal(co.entered_day,101);assert.equal(entered.companies.length,16);
 assert.ok(co.cash>=0&&co.cash<=5000/3);assert.ok(co.technology.reduce((a,b)=>a+b,0)<=96*2/3+1e-12);
 const city=+Object.keys(co.posts)[0];assert.ok(['stockholm','riga','copenhagen'].includes(catalog.cities[city].id));assert.deepEqual(co.licenses,[catalog.cities[city].nation]);assert.equal(co.home_nation,co.licenses[0]);
 assert.equal(co.posts[city].warehouse,0);assert.equal(co.posts[city].handling,0);assert.deepEqual(co.ships,[]);assert.deepEqual(co.routes,[]);
 assert.ok(entered.events.some(e=>e.kind==='rivalEntry'&&e.message===co.id));load(entered);assert.deepEqual(save(),entered);
 load(fixture);cmd({action:'tick',days:1});assert.deepEqual(save(),entered);
 for(const mutate of [g=>g.companies[15].id='unknown',g=>g.companies[15].id=g.companies[1].id,g=>g.companies[15].entered_day=999,g=>g.companies[15].home_nation=999,g=>g.companies[15].bankrupt_since=101,g=>g.roster_version=8]){
  const invalid=structuredClone(entered);mutate(invalid);assert.throws(()=>load(invalid));assert.deepEqual(save(),entered);
 }
 cmd({action:'tick',days:31});const continued=save();load(entered);cmd({action:'tick',days:31});assert.deepEqual(save(),continued);
 load(continued);assert.deepEqual(save(),continued);
 // Bankruptcy records its date once, including saves that predate this field.
 const dead=structuredClone(entered);dead.companies[15].bankrupt=true;dead.companies[15].cash=-1;dead.companies[15].totals={test:-1-dead.companies[15].initial_cash};load(dead);
 const cleaned=save();assert.equal(cleaned.companies[15].bankrupt_since,101);assert.deepEqual(cleaned.companies[15].posts,{});load(cleaned);assert.deepEqual(save(),cleaned);
 // Day 130 is still inside the 30-day cooldown; exact eligibility boundary is
 // also covered by native tests without relying on a chance success.
 cleaned.day=129;load(cleaned);cmd({action:'tick',days:1});assert.ok(save().companies[15].bankrupt);assert.equal(save().companies[15].bankrupt_since,101);
 for(const language of ['ja','en','zh-CN','zh-TW','ko','fr','es']){
  setLanguage(language);for(const r of RIVAL_RESERVES){assert.ok(nameOf(r));if(!['ja','en'].includes(language))assert.notEqual(nameOf(r),r.nameEn);}
  assert.ok(eventText({kind:'rivalEntry',message:'company-22'},catalog).includes(nameOf(catalog.rivals[21])));
 }
 setLanguage('en');const active=call({op:'view'}).companies;assert.equal(sortedCompanies(active,catalog.nations,catalog.rivals)[0].id,'player');
});

test('later entrant ordering uses its founding country and capital, not changing wealth',()=>{
 const nations=[{order:0},{order:1}],templates=[{id:'a',homeNation:0,initialScale:25000},{id:'b',homeNation:0,initialScale:25000}];
 const companies=[{id:'a',index:1,entryHome:1,entryScale:100},{id:'b',index:2,entryHome:1,entryScale:200},{id:'player',index:0}];
 assert.deepEqual(sortedCompanies(companies,nations,templates).map(c=>c.id),['player','b','a']);
 companies[0].cash=1e10;assert.deepEqual(sortedCompanies(companies,nations,templates).map(c=>c.id),['player','b','a']);
});
