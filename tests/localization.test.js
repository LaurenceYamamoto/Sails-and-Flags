import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,catalog,ja,en,setLanguage,getLanguage,locale,tx,t,nameOf,errorMessage} from '../src/i18n.js';
import {sourceMessages} from '../scripts/localization-source.mjs';
import {CITIES,NATIONS,GOODS,SHIPS} from '../src/data.js';
import {createGame,openCircuit,buyLicense,serialize,deserialize,quoteCircuitOpening,tick} from './licensed-game.js';
import {renderOpeningQuote} from '../src/route-setup-view.js';
import {renderIndustry,renderDevelopment} from '../src/industry-view.js';
import {renderFleet} from '../src/fleet-view.js';
import {renderRoutes} from '../src/routes-view.js';
import {renderAutomation,renderCompetition} from '../src/management-view.js';
import {renderDiplomacy} from '../src/security-view.js';
import {HULLS,designQuote} from '../src/industry.js';
import {renameCompany,renameShip} from '../src/fleet.js';
import {saveGame,listSaves} from '../src/storage.js';

test('all UI source messages, decision reasons, error messages and names have four additional translations',()=>{
  assert.deepEqual(Object.keys(ja).sort(),Object.keys(en).sort());
  const sources=[...sourceMessages(),...Object.values(NATIONS).map(n=>{setLanguage('en');return nameOf(n);}),...GOODS.map(n=>nameOf(n)),...Object.values(HULLS).map(n=>nameOf(n))];
  for(const message of sources){assert.ok(catalog[message],`Missing message: ${message}`);assert.equal(catalog[message].length,4,message);for(const value of catalog[message]){assert.ok(value.trim(),message);assert.doesNotMatch(value,/\uFFFD/);assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...message.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),message);}}
  setLanguage('ja');
});

test('all six locales render controls and preserve saves, names, cities and deterministic simulation',()=>{
  const s=createGame(42);buyLicense(s,'spain');openCircuit(s,'sloop',['kingston','havana']);renameCompany(s,'海風 & Compagnie');renameShip(s,s.ships[0].id,'Étoile <一号>');tick(s);
  const before=serialize(s),map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  for(const language of Object.keys(LANGUAGES)) {
    setLanguage(language);assert.equal(getLanguage(),language);assert.doesNotThrow(()=>new Intl.NumberFormat(locale()).format(12345.6));assert.doesNotThrow(()=>new Intl.DateTimeFormat(locale()).format(new Date(Date.UTC(1700,0,1))));
    for(const city of Object.values(CITIES))assert.equal(nameOf(city),city.mapName);
    assert.equal(nameOf({customName:'Étoile <一号>'}),'Étoile &lt;一号&gt;');
    const fmt={cash:String,decimal:String,signed:String,tone:()=>''};
    const html=renderRoutes(s,fmt)+renderIndustry(s,fmt)+renderDevelopment(s,'kingston',fmt)+renderFleet(s,fmt)+renderAutomation(s,fmt)+renderCompetition(s,null,fmt)+renderDiplomacy(s,fmt);
    assert.match(html,/Étoile &lt;一号&gt;/);assert.ok(html.includes(t('capacity')));assert.doesNotMatch(html,/undefined|\[object Object\]|\uFFFD/);
    const opening=renderOpeningQuote(s,'sloop',quoteCircuitOpening(s,'sloop',['kingston','havana']),String);assert.doesNotMatch(opening,/\{ship\}/);
    if(language!=='ja'&&language!=='en'){assert.ok(!opening.includes('Buy one when opening'));assert.ok(!html.includes('Trade network automation'));assert.notEqual(errorMessage(new Error('船の購入資金が不足しています。')),'Not enough cash to buy this ship.');}
    const spec=designQuote({...s,industry:{...s.industry,shipyard:true,technology:{shipbuilding:10}}},'sloop',{cargo:0,speed:0,guns:0,range:0,upkeep:0}).spec;
    assert.doesNotMatch(nameOf(spec),/\{hull\}/);if(language==='fr')assert.match(nameOf(spec),/Plan de Sloop/);
    assert.equal(serialize(s),before);saveGame(storage,s);assert.deepEqual(listSaves(storage).find(v=>v.slot==='manual').state,s);
    const a=deserialize(before),b=deserialize(serialize(s));tick(a);tick(b);assert.deepEqual(a,b);
  }
  setLanguage('not-a-locale');assert.equal(getLanguage(),'ja');
  assert.equal(tx('船 {ship}','Ship {ship}',{ship:'{id}'}),'船 {id}');
});
