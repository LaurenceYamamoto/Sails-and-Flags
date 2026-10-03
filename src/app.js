import {suggestedTransport,requiredRange} from './route-selection.js';
import {renderMarketDemand} from './market-view.js';
import {renderTransportComparison} from './land-transport-view.js';
import {CROSSINGS,isCrossingRoad} from './crossing-data.js';
import {cameraFor,cityCamera,installMapNavigation} from './map-camera.js';
import {seaPosition} from './sea-routing.js';
import {RETIRED_CITIES} from './retired-network.js';
import {roadPosition,roadBetween} from './land-data.js';
import {renderLand,roadTitle} from './land-view.js';
import {travelDistance,buyRoadRight,setRoadInvestment} from './land.js';
import {renameCompany,renameDesign,renameShip,replaceFleet} from './fleet.js';
import {renderFleet,renderReplacement,renderRename} from './fleet-view.js';
import {shipName} from './identity.js';
let fleetEdit=null,nameEdit=null;
import {shipSpec,shipCatalog,shipDaily,sailingDays,industryDaily,designQuote,setTechnologyInvestment,buyShipyard,researchDesign,buyDevelopmentRight,setCityInvestment} from './industry.js';
import {renderIndustry,renderDevelopment,renderDesignEstimate,initialDesign} from './industry-view.js';
let designDraft=initialDesign();
import { GOODS, CITIES, NATIONS, SHIPS, distance, daysFor } from './data.js';
import { createGame, tick, buyShip, buyLicense, openCircuit, quoteCircuitOpening, circuitKey, routeLegs, normalizeStops, MAX_STOPS, updateRoute, toggleRoute, removeRoute, assignShip, releaseShip, serialize, deserialize, assets, operatingProfit } from './engine.js';
import { LANGUAGES, t, tx, locale, setLanguage, getLanguage, nameOf as name, errorMessage } from './i18n.js';
import { renderOpeningQuote } from './route-setup-view.js';
import { renderRoutes, routeTitle } from './routes-view.js';
import { renderMap } from './map-view.js';
import { createClock, voyageProgress } from './clock.js';
import {renderManualSaves,manualSaveLabel,savedTime} from './storage-view.js';
import { saveGame, listSaves, MANUAL_SLOTS, AUTO_HISTORY } from './storage.js';
import { setAutomation, setRouteAutomationShip, acquireCompany } from './management.js';
import { renderAutomation, renderCompetition, renderAcquisition } from './management-view.js';

import {RULES,licenseTerms,setEscort,setDiplomacyInvestment,donate} from './security.js';
import {renderDiplomacy,renderNotices,eventText} from './security-view.js';
let state=createGame(), running=false, speed=1, selectedCity='kingston', selectedRoute=null;
let creating=false, editing=null, confirmation=null, pendingRestore=null, saves=null, saving=false, drag=null, suppressPortClick=false, routeSort='profit';
let storageWarning=false, autoDay=null, exportURL=null, exportText=null;
let acquiring=null;
let mapRegion='world',camera=cameraFor('world');
let mapPlanning=false, plannedStops=[], showRivals=true, selectedCompetitor=null;
try { setLanguage(localStorage.getItem('sails-and-flags.language')); } catch { storageWarning=true; }
let draft={shipType:'sloop',a:'kingston',b:'havana',extra:[],margin:10,allowed:GOODS.map(g=>g.id)};
const clock=createClock(), app=document.querySelector('#app');
const money=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:0}).format(n);
const decimal=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(n);
const cash=n=>`¤ ${decimal(Math.abs(n)<0.05?0:n)}`;
const signed=n=>`${n>=0?'+':'−'}${cash(Math.abs(n))}`;
const tone=n=>n>=0?'positive':'negative';
const date=()=>new Date(Date.UTC(1700,0,1)+state.day*86400000).toLocaleDateString(locale(),{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
const fixedCost=()=>state.ships.reduce((v,s)=>v+shipDaily(state,s.type),0)+state.licenses.reduce((v,n)=>v+licenseTerms(state,n).daily,0)+state.routes.reduce((v,r)=>v+r.escorts*RULES.escortDaily,0)+Object.values(state.diplomacy.investment).reduce((a,b)=>a+b,0)+industryDaily(state);
const option=(value,label,selected)=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`;
const stops=()=>normalizeStops([draft.a,draft.b,...draft.extra.filter(Boolean)]);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(message) { const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(notice.timer); notice.timer=setTimeout(()=>el.classList.remove('show'),5000); }
function persist(slot='auto') {
  try { saveGame(localStorage,state,slot); storageWarning=false; if(slot==='auto') autoDay=state.day; return true; }
  catch { storageWarning=true; notice(t('storageError')); return false; }
}
function shipTransform(ship) {
  const w=ship.voyage,p=voyageProgress(w,clock.fraction);if(w&&shipSpec(state,ship.type)?.mode==='land'){const point=roadPosition(w.from,w.to,p);return `translate(${point.x},${point.y})`;}const from=CITIES[w?.from??ship.nextFrom],to=CITIES[w?.to??ship.nextFrom];
  const point=w?seaPosition(w.from,w.to,p):from;return `translate(${point.x},${point.y})`;
}
function animateTime() {
  for(const marker of app.querySelectorAll('[data-rival-ship]')) { const ship=state.competitors[Number(marker.dataset.company)]?.ships.find(s=>s.id===marker.dataset.rivalShip); if(ship?.routeId)marker.setAttribute('transform',shipTransform(ship)); }
  for(const marker of app.querySelectorAll('[data-ship]')) { const ship=state.ships.find(s=>s.id===marker.dataset.ship); if(ship?.routeId) marker.setAttribute('transform',shipTransform(ship)); }
  const bar=app.querySelector('#day-progress'); if(bar) bar.style.transform=`scaleX(${clock.fraction})`;
  for(const bar of app.querySelectorAll('[data-voyage-progress]')) { const ship=state.ships.find(s=>s.id===bar.dataset.voyageProgress); bar.style.width=`${100*voyageProgress(ship?.voyage,clock.fraction)}%`; }
}
function market() {
  const c=CITIES[selectedCity],n=NATIONS[c.nation];
  return `<div class="section-top"><h2>${name(c)}</h2><label class="small">${t('ports')}<select id="city-select">${Object.entries(CITIES).map(([id,c])=>option(id,name(c),selectedCity)).join('')}</select></label></div><p class="muted small"><span class="nation-color" style="background:${n.color}"></span> ${name(n)} · ${t('taxRate')} ${decimal(licenseTerms(state,c.nation).tax*100)}% · ${state.licenses.includes(c.nation)?t('owned'):tx('交易免許が必要','License required')}</p>
    ${renderMarketDemand(state,selectedCity,{decimal,money})}<p class="muted small">${tx('単価は現在在庫の限界価格です。売買量に応じた価格変化と税を含めて決済します。競合も同じ在庫で取引します。','Prices are marginal prices at current stock. Trades integrate price changes across the quantity and include tax. Competitors use the same inventory.')}</p>`;
}
function mapTools() {
  return `<div class="map-tools"><label>${tx('地図の範囲','Map area')}<select id="map-region">${option('world',tx('全世界','World'),mapRegion)}${option('europe',tx('欧州の道路','European roads'),mapRegion)}${option('mediterranean',tx('西地中海','Western Mediterranean'),mapRegion)}${option('egypt',tx('エジプト陸上連絡路','Egypt overland crossing'),mapRegion)}${option('panama',tx('パナマ地峡','Panama isthmus'),mapRegion)}${option('caribbean',tx('カリブ海','Caribbean'),mapRegion)}${option('americas',tx('南北アメリカ','Americas'),mapRegion)}${option('africa',tx('アフリカ','Africa'),mapRegion)}${option('asia',tx('アジア','Asia'),mapRegion)}</select></label><label>${tx('都市へ移動','Go to city')}<select id="map-city"><option value="">${tx('都市を選択','Choose a city')}</option>${Object.entries(CITIES).map(([id,c])=>option(id,name(c),'')).join('')}</select></label><button data-action="plan-map" ${state.gameOver?'disabled':''}>${tx('地図で巡回ルートを作る','Plan a circuit on the map')}</button><label><input type="checkbox" id="show-rivals" ${showRivals?'checked':''}>${tx('競合航路を表示','Show competitor routes')}</label></div><div class="map-navigation" role="group" aria-label="${tx('地図操作','Map navigation')}">${[['in','＋','拡大','Zoom in'],['out','−','縮小','Zoom out'],['left','←','左へ移動','Pan left'],['up','↑','上へ移動','Pan up'],['down','↓','下へ移動','Pan down'],['right','→','右へ移動','Pan right'],['reset','⌂','全世界を表示','Show whole world']].map(([id,icon,ja,en])=>`<button type="button" data-map-nav="${id}" aria-label="${tx(ja,en)}" title="${tx(ja,en)}">${icon}</button>`).join('')}<output data-map-scale>${(900/camera[2]).toFixed(1)}×</output><span>${tx('ホイールで拡大・縮小、地図の背景をドラッグして移動','Wheel to zoom; drag the background to pan')}</span></div><div class="map-legend"><span><i class="legend-road"></i>${tx('茶色：道路 / 四角：内陸都市','Brown: roads / squares: inland cities')}</span><span><i class="legend-player"></i>${tx('自社航路・丸い船印','Your routes · round ships')}</span><span><i class="legend-rival"></i>${tx('競合航路・菱形の船印（クリックで会社情報）','Competitors · diamond ships (click for company details)')}</span></div>${mapRegion==='mediterranean'?`<p class="small muted region-guide">${tx('Genoaの織物、Livornoの食料・オリーブ油を周辺港へ。交易にはジェノヴァ共和国・トスカーナ大公国の免許が必要です。','Trade Genoese cloth and Livorno food and olive oil with nearby ports. Licenses from Genoa and Tuscany are required.')}</p>`:''}${mapPlanning?`<div class="map-planner" role="region" aria-label="${tx('寄港地を選択','Choose ports')}"><strong>${tx('地図上の都市を寄港順にクリック（最大12回・再訪可）','Click cities in visiting order (up to 12 stops; revisits allowed)')}</strong><p aria-live="polite">${plannedStops.length?plannedStops.map((id,i)=>`${i+1}. ${name(CITIES[id])}`).join(' → '):tx('最初の港を選んでください。','Choose the first port.')}${plannedStops.length>=2?' ↻':''}</p><p class="small muted">${tx('同じ港を再訪できます（連続指定は不可）。最後は起点へ戻るため、起点の再選択は省略できます。淡い点線は帰路です。','Ports may be revisited, but not consecutively. The final return to the first port is automatic; selecting it again is optional. The faint dotted line is the return leg.')}</p><div class="buttons"><button data-action="finish-map" class="primary" ${plannedStops.length<2?'disabled':''}>${tx('この寄港順で設定','Configure this circuit')}</button><button data-action="undo-map" ${plannedStops.length?'':'disabled'}>${tx('1港戻す','Undo last port')}</button><button data-action="cancel-map">${t('cancel')}</button></div></div>`:''}`;
}
function appendStop(id) {
  if(plannedStops.at(-1)===id) return;
  if(plannedStops.length>=MAX_STOPS && !(plannedStops.length===MAX_STOPS && id===plannedStops[0])) {
    notice(tx('寄港順は最大12回です（最後の起点への帰港を除く）。','Up to 12 stops are allowed, excluding the final return to the first port.'));return;
  }
  plannedStops.push(id);
}
function selectPort(id) {
  pauseTime();selectedCity=id;
  if(mapPlanning) appendStop(id);
  render();
}
function policyFields(source) { return `<label>${t('margin')}<input type="number" name="margin" min="0" max="1000" step="1" required value="${source.margin??source.minMargin}"></label><fieldset><legend>${t('allowed')}</legend><div class="checks">${GOODS.map(g=>`<label><input type="checkbox" name="good" value="${g.id}" ${source.allowed.includes(g.id)?'checked':''}>${name(g)}</label>`).join('')}</div></fieldset>`; }
function findCircuit(ports) { return state.routes.find(r=>r.mode===shipSpec(state,draft.shipType)?.mode&&circuitKey(r.stops)===circuitKey(ports)); }
function findRoute(a,b) { return a!==b ? state.routes.find(r=>routeLegs(r).some(([from,to])=>from===a&&to===b||from===b&&to===a)) : null; }
function estimate(type) {
  const ports=stops();
  if(ports.length<2 || ports.some((id,i)=>id===ports[(i+1)%ports.length])) return tx('同じ港を連続して指定できません。','Consecutive stops must be different.');
  if(!type) return t('noShip');
  const legs=routeLegs({stops:ports}),days=legs.reduce((n,[a,b])=>n+sailingDays(state,type,a,b)+1,0);
  return `${money(legs.reduce((n,[a,b])=>n+travelDistance(state,type,a,b),0))} ${shipSpec(state,type).mode==='land'?'km':'nm'} · ${tx('一周','Cycle')} ${days} ${t('dayUnit')} · ${t('upkeep')} ${cash(shipDaily(state,type)*days)}${legs.some(([a,b])=>travelDistance(state,type,a,b)>shipSpec(state,type).range)?' · ⚠ '+tx('航続距離超過','Range exceeded'):''}`;
}
function setup() {
  const existing=findCircuit(stops()),opening=quoteCircuitOpening(state,draft.shipType,stops(),draft.allowed,draft.margin);
  const portSelect=(field,value,caption,optional=false)=>`<label>${caption}<select name="${field}">${optional?option('',tx('寄港しない','No stop'),value):''}${Object.entries(CITIES).map(([id,c])=>option(id,name(c),value)).join('')}</select></label>`;
  return `<form id="route-form"><h2 id="create-title">${t('routeSetup')}</h2><label>${tx('輸送手段','Transport mode')}<select name="mode">${option('sea',tx('海上交易','Sea trade'),shipSpec(state,draft.shipType).mode)}${option('land',tx('陸上交易','Land trade'),shipSpec(state,draft.shipType).mode)}</select></label><div class="form-row">${portSelect('from',draft.a,t('departure'))}${portSelect('to',draft.b,t('destination'))}</div><details ${draft.extra.some(Boolean)?'open':''}><summary>${tx('追加の経由都市（最大12回・再訪可）','Additional stops (up to 12; revisits allowed)')}</summary><div class="extra-stops">${Array.from({length:Math.min(MAX_STOPS-2,Math.max(4,draft.extra.length+1))},(_,i)=>i).map(i=>portSelect('extra',draft.extra[i]||'',`${t('ports')} ${i+3}`,true)).join('')}</div></details><p class="small muted">${shipSpec(state,draft.shipType).mode==='land'?tx('都市を指定順に巡回し、最後に起点へ戻ります。各都市の市場で売却・再購入します。','Visit cities in order and return to the start. Sell and repurchase cargo at every city market.'):tx('同じ港への再訪も指定できます。指定順に巡回し、最後の港から起点に戻ります。全寄港地で売却・再購入します。','Allows revisiting ports. Visits ports in order, then returns to the starting port. Cargo is sold and purchased again at every stop.')}</p>
  ${existing?`<p>${tx('開設済みのルート情報を表示します。','This route already exists. Open its details to add ships.')}</p>`:`<label>${tx('開設時の船・車両タイプ','Transport type at opening')}<select name="shipType" required>${Object.entries(shipCatalog(state)).filter(([,v])=>v.mode===shipSpec(state,draft.shipType).mode).map(([type,v])=>option(type,`${name(v)} · ${t('capacity')} ${v.capacity} · ${t('range')} ${Math.round(v.range)} · ${cash(v.price)}`,draft.shipType)).join('')}</select></label><div id="route-opening-quote" aria-live="polite">${renderOpeningQuote(state,draft.shipType,opening,cash,requiredRange(state,draft.shipType,stops()))}</div>${shipSpec(state,draft.shipType).mode==='land'?renderTransportComparison(state,stops(),draft.shipType,cash):''}${policyFields(draft)}<p id="route-estimate" class="small muted">${estimate(draft.shipType)}</p>`}  <div class="buttons"><button type="button" data-action="edit-map-stops">${tx('地図で寄港地を選ぶ','Choose ports on map')}</button><button id="open-route" class="primary" ${!existing&&opening.error?'disabled':''}>${existing?tx('ルート情報を表示','Open route'):t('create')}</button><button type="button" data-action="cancel">${t('cancel')}</button></div><p class="small muted">${t('reserveNote')}</p></form>`;
}
function routes() {
  const list=[...state.routes].sort((a,b)=>routeSort==='profit'?b.profit-a.profit:a.started-b.started),route=state.routes.find(r=>r.id===selectedRoute);
  return `<label class="small">${tx('並び順','Sort routes')} <select id="route-sort">${option('profit',tx('収益順','Profit'),routeSort)}${option('created',tx('開設順','Creation order'),routeSort)}</select></label><nav class="route-choices" aria-label="${t('routes')}">${list.map(r=>`<button data-action="select-route" data-id="${r.id}" aria-pressed="${r.id===selectedRoute}">${routeTitle(r)} · ${signed(r.profit)}${r.lastActual<0?' ⚠':''}</button>`).join('')}</nav>${renderRoutes({...state,routes:route?[route]:[]},{decimal,cash,signed,tone})}`;
}
function ledger() {
  return `<div class="table-wrap ledger"><table><thead><tr><th>${t('day')}</th><th>${t('transaction')}</th><th>${t('ports')} / ${t('routes')}</th><th>${t('amount')}</th></tr></thead><tbody>${[...state.ledger].reverse().slice(0,60).map(e=>`<tr><td>${e.day}</td><td>${t(e.category)}${e.good?' · '+name(GOODS.find(g=>g.id===e.good)):''}${e.quantity?' ×'+decimal(e.quantity):''}${e.shipId?' #'+e.shipId.split('-')[1]:''}</td><td>${e.city?name(CITIES[e.city]??RETIRED_CITIES[e.city]):e.nation?name(NATIONS[e.nation]):e.road?roadTitle(e.road):'—'}${e.routeId?' / #'+e.routeId.split('-')[1]:''}</td><td class="${tone(e.amount)}">${signed(e.amount)}</td></tr>`).join('')||`<tr><td colspan="4">${t('noEntry')}</td></tr>`}</tbody></table></div>`;
}
function chart() {
  const h=state.history;
  if(h.length<2) return `<p class="small muted">${t('historyEmpty')}</p>`;
  const lo=Math.min(...h.flatMap(v=>[v.cash,v.assets])),hi=Math.max(...h.flatMap(v=>[v.cash,v.assets]));
  const points=key=>h.map((v,i)=>`${i/(h.length-1)*600},${85-(v[key]-lo)/Math.max(1,hi-lo)*75}`).join(' ');
  return `<svg viewBox="0 0 600 95" class="chart" role="img" aria-label="${t('cashTrend')}"><polyline points="${points('assets')}" fill="none" stroke="#b88340" stroke-width="2.5" stroke-dasharray="6 3"/><polyline points="${points('cash')}" fill="none" stroke="#247364" stroke-width="2.5"/></svg><div class="section-top small muted"><span>${h[0].day} → ${state.day} ${t('dayUnit')}</span><span style="color:#247364">━ ${t('cash')}</span><span style="color:#956620">┄ ${t('assets')}</span><span>${cash(lo)} – ${cash(hi)}</span></div>`;
}
function competitors() { return renderCompetition(state,selectedCompetitor,{cash,signed}); }
function saveDialog() {
  const labels={v15:'v15',autoV15:'v15 '+tx('自動保存','Autosave'),v14:'v14',autoV14:'v14 '+tx('自動保存','Autosave'),backupV14:'v14 '+tx('前回の保存','Previous save'),v13:'v13',autoV13:'v13 '+tx('自動保存','Autosave'),backupV13:'v13 '+tx('前回の保存','Previous save'),preserved:tx('品目別生産投資への移行前の保全保存','Preserved save before commodity investments'),preservedCaravans:tx('キャラバン追加前の保全保存','Preserved save before caravans'),v12:'v12',autoV12:'v12 '+tx('自動保存','Autosave'),backupV12:'v12 '+tx('前回の保存','Previous save'),preservedCrossings:tx('地峡交易追加前の保全保存','Preserved save before overland crossings'),v11:'v11',autoV11:'v11 '+tx('自動保存','Autosave'),backupV11:'v11 '+tx('前回の保存','Previous save'),preservedWorld:tx('世界拡張前の保全保存','Preserved save before world expansion'),v10:'v10',autoV10:'v10 '+tx('自動保存','Autosave'),backupV10:'v10 '+tx('前回の保存','Previous save'),preservedRegion:tx('地中海拡張前の保全保存','Preserved save before Mediterranean expansion'),v9:'v9',autoV9:'v9 '+tx('自動保存','Autosave'),backupV9:'v9 '+tx('前回の保存','Previous save'),preservedSea:tx('海上経路修正前の保全保存','Preserved save before sea route revision'),v8:'v8',autoV8:'v8 '+tx('自動保存','Autosave'),backupV8:'v8 '+tx('前回の保存','Previous save'),preservedCities:tx('都市再編前の保全保存','Preserved save before city revision'),preservedP7:tx('保全保存（P7）','Preserved save (P7)'),v7:'v7',autoV7:'v7 '+tx('自動保存','Autosave'),backupV7:'v7 '+tx('前回の保存','Previous save'),preservedContinents:tx('大陸交易網拡張前の保全保存','Preserved save before inland expansion'),preservedP6:tx('保全保存（P6）','Preserved save (P6)'),v6:'v6',autoV6:'v6 '+tx('自動保存','Autosave'),backupV6:'v6 '+tx('前回の保存','Previous save'),manual:tx('手動保存','Manual save'),auto:tx('自動保存','Autosave'),backup:tx('前回の保存','Previous save'),v5:'v5',autoV5:tx('v5 自動保存','v5 Autosave'),backupV5:tx('v5 前回保存','v5 Previous save'),v4:'v4',autoV4:tx('v4 自動保存','v4 Autosave'),backupV4:tx('v4 前回保存','v4 Previous save'),v3:'v3',autoV3:tx('v3 自動保存','v3 Autosave'),backupV3:tx('v3 前回保存','v3 Previous save'),v2:'v2',v1:'v1'};
  if(saving)return renderManualSaves(saves,{cash,error:storageWarning?t('storageError'):null});
  MANUAL_SLOTS.forEach((id,i)=>labels[id]=manualSaveLabel(i));AUTO_HISTORY.forEach((id,i)=>labels[id]=tx('自動保存履歴 {slot}','Autosave history {slot}',{slot:i+1}));
  return `<dialog aria-labelledby="saves-title"><h2 id="saves-title">${t('load')}</h2>${saves.length?saves.map(s=>`<p><button data-action="choose-save" data-id="${s.slot}" ${s.valid?'':'disabled'}>${labels[s.slot]} · ${s.valid?`${s.day} ${t('dayUnit')} · ${cash(s.state.cash)} ${savedTime(s)}`:tx('破損データ','Invalid data')}</button></p>`).join(''):`<p>${t('noSave')}</p>`}<button data-action="cancel">${t('cancel')}</button></dialog>`;
}
function render() {
  if(!state.routes.some(r=>r.id===selectedRoute)) selectedRoute=state.routes[0]?.id??null;
  const expanded=[...app.querySelectorAll('details[id][open]')].map(el=>el.id);
  const focused=document.activeElement, focusedForm=focused?.closest('form');
  const restoreFocus=focusedForm && focused.name ? {form:focusedForm.id,name:focused.name,index:[...focusedForm.elements].indexOf(focused)} : null;
  const view=document.createElement('template');
  view.innerHTML=`<header><div class="brand"><div class="brand-icon">⚑</div><div><h1>SAILS <i>&</i> FLAGS</h1><span>${state.companyName?escape(state.companyName):t('subtitle')}</span><button data-action="rename-company">${tx('会社名を変更','Rename company')}</button></div></div><div class="time"><span class="eyebrow">${t('prototype')}</span><strong>${date()}</strong><span class="small">${state.day} ${t('dayUnit')} · <span id="time-status">${running?tx('進行中','Running'):tx('一時停止中','Paused')}</span></span><div class="day-track" aria-hidden="true"><span id="day-progress"></span></div></div><div class="time-controls"><button data-action="play" class="primary" ${state.gameOver?'disabled':''}>${running?'Ⅱ '+t('pause'):'▶ '+t('play')}</button><select id="speed" aria-label="${t('speed')}">${[1,4,16].map(n=>option(String(n),`${n}×`,String(speed))).join('')}</select><select id="language" aria-label="${tx('言語','Language')}">${Object.entries(LANGUAGES).map(([id,l])=>option(id,l.label,getLanguage())).join('')}</select></div></header>
  <main><div class="summary"><div><span>${t('cash')}</span><strong id="cash">${cash(state.cash)}</strong></div><div><span>${t('assets')}</span><strong>${cash(assets(state))}</strong></div><div><span>${t('operating')}</span><strong class="${tone(operatingProfit(state))}">${signed(operatingProfit(state))}</strong></div><div><span>${t('dailyCost')}</span><strong>${cash(fixedCost())}<small> ${t('daily')}</small></strong></div></div>
  <div class="save-toolbar"><button data-action="save">${t('save')}</button><button data-action="load">${t('load')}</button><button data-action="export">${tx('書き出し','Export')}</button><button data-action="import">${tx('ファイル読込','Import')}</button><button data-action="reset" class="text-button">${t('reset')}</button><span class="small muted">${tx('自動保存：操作時・30日ごと','Autosave: on changes and every 30 days')}${autoDay!==null?` · ${autoDay} ${t('dayUnit')}`:''}</span><input type="file" id="import-file" accept=".json,application/json" hidden></div>
  ${storageWarning?`<div class="warning" role="alert">${t('storageError')}</div>`:''}${state.gameOver?`<section class="warning danger" role="alert"><h2>${t('bankrupt')}</h2><p>${t('bankruptBody')}</p></section>`:state.cash<fixedCost()*30?`<div class="warning" role="alert">${t('cashWarning')}</div>`:''}
  ${state.networkMigration?`<aside class="notice"><p>${tx('都市構成を更新しました。対象ルートを解除して船・車両を保有状態に戻し、積荷原価と撤去された開発権・投資・未収分配金を返還しました。','The city network was updated. Affected routes were closed and vehicles returned to inventory. Cargo cost and removed rights, investments and accrued income were refunded.')} ${tx('解除ルート数 / 返還額','Closed routes / refund')}: ${state.networkMigration.removedRoutes} / ${cash(state.networkMigration.refund)}</p></aside>`:''}${renderNotices(state)}<div class="layout"><div class="main-column"><section class="panel map-panel"><div class="section-top panel-heading"><div><p class="eyebrow">THE TRADING ATLAS</p><h2>${t('map')}</h2></div><span class="small muted">${Object.values(CITIES).filter(c=>!c.inland).length} PORTS + ${Object.values(CITIES).filter(c=>c.inland).length} INLAND · 1700</span></div>${mapTools()}<div class="map-scroll">${renderMap(state,selectedCity,selectedRoute,shipTransform,{plannedStops:mapPlanning?plannedStops:[],mapPlanning,showRivals,selectedCompetitor,mapRegion,camera})}</div><div class="map-caption"><span>${t('mapSub')}</span><span>${t('schematic')}</span></div></section>
  <section class="panel route-panel" id="route-panel"><div class="section-top"><h2 id="route-panel-title" tabindex="-1">${t('fleet')}</h2><span class="badge">${state.ships.length} ${t('ships')} / ${state.routes.length} ${t('routes')}</span></div><p class="small muted">${t('fleetSub')}</p><button data-action="new-route" ${state.gameOver?'disabled':''}>＋ ${tx('新規ルート','New route')}</button><div id="routes">${routes()}</div></section>
  ${renderLand(state,{cash,decimal})}${renderAutomation(state,{cash})}${renderFleet(state)}${renderDiplomacy(state,{cash,decimal})}${renderIndustry(state,{cash,decimal},designDraft)}<section class="panel market-panel">${market()}${renderDevelopment(state,selectedCity,{cash,decimal})}</section><section class="panel ledger-panel"><div class="section-top"><h2>${t('journal')}</h2><span class="small muted">${t('investments')} ${cash(-(state.totals.shipPurchase||0)-(state.totals.licensePurchase||0)-(state.totals.acquisition||0)-(state.totals.diplomacyInvestment||0)-['technologyInvestment','shipyardPurchase','designResearch','shipConstruction','developmentPurchase','cityInvestment','roadPurchase','roadInvestment'].reduce((n,k)=>n+(state.totals[k]||0),0))}</span></div><p class="small muted">${t('ledgerNote')}</p><h3>${t('cashTrend')}</h3>${chart()}${ledger()}</section></div>
  <aside><section class="guide"><p class="eyebrow">CAPTAIN'S FIRST STEPS</p><h2>${t('guideTitle')}</h2><p>${t('guideBody')}</p><ol>${['guide1','guide2','guide3'].map((k,i)=>`<li class="${[['england','spain'].every(n=>state.licenses.includes(n)),state.routes.length>0,state.routes.length>0&&state.day>0][i]?'done':''}">${t(k)}</li>`).join('')}</ol></section>
  <section class="panel"><h2>${t('licenses')}</h2><p class="small muted">${tx('色印は地図の都市と同じ国を示します。','The color matches this country’s cities on the map.')}</p><p class="small muted">${tx('取得費は基準額 × 3^保有免許数× 友好度補正。現在{count}件、次の取得費は基準額の{factor}倍です。維持費には保有数の倍率を掛けません。','Purchase fee = base fee × 3^owned licenses × friendship modifier. You own {count}; the next fee is {factor}× base. Per-license upkeep does not scale with license count.',{count:state.licenses.length,factor:3**state.licenses.length})}</p><p class="small muted">${tx('取引税率（%）= 15 − 友好度 × 0.1。新規会社は、最初の免許の取得完了時にその国との友好度が100になります。取得費は購入前の友好度で計算します。','Transaction tax (%) = 15 − friendship × 0.1. A new company gains friendship 100 with its first licensed nation after purchase. The purchase fee uses friendship before purchase.')}</p>${Object.entries(NATIONS).map(([id,n])=>`<div class="license"><div><strong class="nation-name"><span class="nation-color" style="background:${n.color}" aria-hidden="true"></span>${name(n)}</strong><small>${cash(licenseTerms(state,id).daily)} ${t('daily')} · ${t('tax')} ${decimal(licenseTerms(state,id).tax*100)}%</small></div><button data-action="license" data-id="${id}" ${state.licenses.includes(id)||state.cash<licenseTerms(state,id).fee||!licenseTerms(state,id).canBuy||state.gameOver?'disabled':''}>${state.licenses.includes(id)?'✓ '+t('owned'):cash(licenseTerms(state,id).fee)+' '+t('buy')}</button></div>`).join('')}</section>
  <section class="panel"><h2>${tx('船・陸上輸送隊を購入','Buy ships and land transports')}</h2><p class="small muted">${tx('購入した船は未使用船として保有し、任意のルートに配置できます。未使用船にも維持費がかかります。','Ships enter your idle inventory and can be assigned to any compatible route. Idle ships still incur upkeep.')}</p>${Object.entries(shipCatalog(state)).map(([id,v])=>`<div class="ship-offer"><div class="section-top"><h3>♧ ${name(v)}</h3><strong>${cash(v.price)}</strong></div><p class="small muted">${t('capacity')} ${v.capacity} · ${t('range')} ${money(v.range)} ${v.mode==='land'?'km':'nm'}<br>${t('speed')} ${money(v.speed)} ${v.mode==='land'?'km':'nm'} ${t('daily')} · ${t('upkeep')} ${cash(shipDaily(state,id))} ${t('daily')} · ${tx('砲門','Guns')} ${money(v.guns)}</p><button class="full" data-action="buy" data-id="${id}" ${state.cash<v.price||state.gameOver?'disabled':''}>${t('buy')} · ${name(v)}</button></div>`).join('')}${state.ships.filter(s=>!s.routeId).map(s=>`<p class="small">⚓ ${escape(shipName(state,s))} · ${name(shipSpec(state,s.type))} #${s.id.split('-')[1]} · ${t('unassigned')}</p>`).join('')}</section>${competitors()}</aside></div>
  <footer>${t('footer')}<br><a href="Architecture.md" target="_blank">Architecture</a> · <a href="ImplementationNote.md" target="_blank">Implementation notes</a> · <a href="ExternalLibrary.md" target="_blank">Libraries & licenses</a></footer></main>
  ${fleetEdit?renderReplacement(state,fleetEdit,{cash}):''}${nameEdit?renderRename(nameEdit):''}${acquiring!==null?renderAcquisition(state,acquiring,cash):''}${creating?`<dialog aria-labelledby="create-title">${setup()}</dialog>`:''}
  ${editing?`<dialog aria-labelledby="edit-title"><form id="edit-form"><h2 id="edit-title">${t('policy')}</h2>${policyFields(state.routes.find(r=>r.id===editing))}<p class="small muted">${tx('航行中の積み荷は変更せず、次回出港時から適用します。','Applies to the next departure. Cargo already at sea is unchanged.')}</p><div class="buttons"><button class="primary">${t('apply')}</button><button type="button" data-action="cancel">${t('cancel')}</button></div></form></dialog>`:''}
  ${saves?saveDialog():''}${exportURL?`<dialog aria-labelledby="export-title"><h2 id="export-title">${tx('セーブを書き出す','Export save')}</h2><p><a class="download-link" href="${exportURL}" download="sails-and-flags-day-${state.day}.json">${tx('JSONファイルをダウンロード','Download JSON file')}</a></p><details><summary>${tx('ダウンロードできない場合','If downloads are unavailable')}</summary><p class="small">${tx('以下の内容をコピーして、拡張子.jsonのファイルに保存してください。','Copy the text below into a file with the .json extension.')}</p><textarea readonly aria-label="Save JSON">${escape(exportText)}</textarea></details><button data-action="cancel">${t('cancel')}</button></dialog>`:''}${confirmation?`<dialog aria-labelledby="confirm-title"><h2 id="confirm-title">${confirmation==='load'?t('load'):t('reset')}</h2><p>${t(confirmation==='load'?'loadConfirm':'resetConfirm')}</p><div class="buttons"><button data-action="cancel" autofocus>${t('cancel')}</button><button class="primary" data-action="confirm">${confirmation==='load'?t('load'):t('reset')}</button></div></dialog>`:''}`;
  // Preserve focused time controls while the daily economic state rerenders.
  if(app.querySelector('header')) {
    app.querySelector('.time').replaceWith(view.content.querySelector('.time'));
    app.querySelector('.brand').replaceWith(view.content.querySelector('.brand'));
    const play=app.querySelector('[data-action="play"]'); play.textContent=running?'Ⅱ '+t('pause'):'▶ '+t('play'); play.disabled=state.gameOver||mapPlanning;
    app.querySelector('#speed').value=String(speed); app.querySelector('#speed').setAttribute('aria-label',t('speed'));
    app.querySelector('#language').value=getLanguage(); app.querySelector('#language').setAttribute('aria-label',tx('言語','Language'));
    app.querySelector('main').replaceWith(view.content.querySelector('main'));
    app.querySelectorAll('dialog').forEach(d=>d.remove()); app.append(...view.content.querySelectorAll('dialog'));
  } else app.append(view.content);
  for(const id of expanded){const el=document.getElementById(id);if(el)el.open=true;}
  document.documentElement.lang=getLanguage(); document.title='Sails & Flags — '+(state.companyName??t('subtitle'));
  const dialog=app.querySelector('dialog');
  if(dialog) { dialog.showModal(); dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialogs();render();focusRoute();}); }
  if(restoreFocus) { const elements=[...(document.getElementById(restoreFocus.form)?.elements||[])]; const el=elements[restoreFocus.index]; if(el?.name===restoreFocus.name) el.focus(); }
  animateTime();
}
function closeDialogs() { fleetEdit=null;nameEdit=null; acquiring=null;creating=false; editing=null; confirmation=null; pendingRestore=null; saves=null;saving=false; if(exportURL)URL.revokeObjectURL(exportURL);exportURL=null;exportText=null; }
function focusRoute() { document.querySelector('#route-panel-title')?.focus({preventScroll:true}); document.querySelector('#route-panel')?.scrollIntoView({block:'start'}); }
function selectConnection(a,b) { pauseTime(); selectedCompetitor=null; if(mapPlanning) {for(const id of [a,b])appendStop(id);render();return;}  const r=findRoute(a,b); if(r) {selectedRoute=r.id;creating=false;render();focusRoute();} else {draft={...draft,shipType:suggestedTransport(state,[a,b],draft.shipType),a,b,extra:[]};creating=true;render();} }
function readDraft(form) { const data=new FormData(form); return {shipType:data.get('shipType')??draft.shipType,a:data.get('from'),b:data.get('to'),extra:data.getAll('extra'),margin:data.has('margin')?Number(data.get('margin')):draft.margin,allowed:data.has('margin')?data.getAll('good'):draft.allowed}; }
function readDesign(form){const d=new FormData(form);const next={hull:d.get('hull'),...Object.fromEntries(['cargo','speed','guns','range','upkeep'].map(k=>[k,Number(d.get(k))]))};designQuote(state,next.hull,next);return next;}
app.addEventListener('input',e=>{if(e.target.closest('.city-investment-form')){pauseTime();const form=e.target.form;const total=[...form.querySelectorAll('input[name^=production-]')].reduce((n,input)=>n+Math.max(0,Number(input.value)||0),0);form.querySelector('[data-production-total]').textContent=cash(total);}if(e.target.closest('#design-form')){pauseTime();try{designDraft=readDesign(e.target.form);document.querySelector('#design-quote').innerHTML=renderDesignEstimate(state,designDraft,{cash,decimal});}catch{document.querySelector('#design-quote').innerHTML='<p>'+tx('設計の数値を確認してください。','Check design values.')+'</p><button disabled>'+tx('この設計を研究','Research this design')+'</button>';}}if(e.target.closest('#route-form')) {draft=readDraft(e.target.form);const el=document.querySelector('#route-estimate');if(el) el.textContent=estimate(draft.shipType);const quote=document.querySelector('#route-opening-quote');if(quote){const q=quoteCircuitOpening(state,draft.shipType,stops(),draft.allowed,draft.margin);quote.innerHTML=renderOpeningQuote(state,draft.shipType,q,cash,requiredRange(state,draft.shipType,stops()));document.querySelector('#open-route').disabled=Boolean(q.error);}}});
app.addEventListener('change',async e=>{
  if(e.target.id==='map-city'&&CITIES[e.target.value]){pauseTime();camera=cityCamera(CITIES[e.target.value]);selectedCity=e.target.value;render();return;}
  if(e.target.id==='map-region'){pauseTime();mapRegion=e.target.value;camera=cameraFor(mapRegion);render();return;}
  if(e.target.name==='mode'&&e.target.closest('#route-form')){draft=readDraft(e.target.form);draft.shipType=e.target.value==='land'?'wagon':'sloop';if(e.target.value==='land'&&!routeLegs({stops:normalizeStops(stops())}).every(([a,b])=>roadBetween(a,b)))Object.assign(draft,{a:'lisbon',b:'porto',extra:[]});if(e.target.value==='sea'&&stops().some(id=>CITIES[id].inland))Object.assign(draft,{a:'kingston',b:'havana',extra:[]});render();return;}
  if(e.target.closest('#fleet-replacement-form')){fleetEdit={...fleetEdit,[e.target.name]:e.target.value};render();return;}
  if(e.target.matches('[data-escort]')){pauseTime();try{setEscort(state,e.target.dataset.escort,Number(e.target.value));persist();}catch(error){notice(errorMessage(error));}render();}
  if(e.target.matches('[data-auto-ship]')) {
    pauseTime();
    try {setRouteAutomationShip(state,e.target.dataset.autoShip,e.target.value);persist();notice(tx('自動増減用の船種を変更しました。','Automation ship type updated.'));}
    catch(error){notice(errorMessage(error));}
    render();
  }
  if(e.target.id==='show-rivals'){pauseTime();showRivals=e.target.checked;if(!showRivals)selectedCompetitor=null;render();}
  if(e.target.closest('#design-form')){pauseTime();try{designDraft=readDesign(e.target.form);render();}catch(error){notice(errorMessage(error));}return;}
  if(e.target.id==='speed') {const next=Number(e.target.value),days=advanceTime(performance.now());speed=next;if(days)render();}
  if(e.target.id==='language') {pauseTime();clearTimeout(notice.timer);document.querySelector('#toast').classList.remove('show');document.querySelector('#toast').textContent='';setLanguage(e.target.value);try{localStorage.setItem('sails-and-flags.language',getLanguage());}catch{storageWarning=true;}render();}
  if(e.target.id==='route-sort') {pauseTime();routeSort=e.target.value;render();}
  if(e.target.id==='city-select') {pauseTime();selectedCity=e.target.value;render();}
  if(e.target.closest('#route-form')&&['from','to','extra','shipType'].includes(e.target.name)) {draft=readDraft(e.target.form);if(e.target.name!=='shipType')draft.shipType=suggestedTransport(state,stops(),draft.shipType,shipSpec(state,draft.shipType).mode);render();}
  if(e.target.id==='import-file') {
    pauseTime();const file=e.target.files[0];if(!file)return;
    try {if(file.size>50_000_000)throw new Error(tx('ファイルが大きすぎます。','File exceeds 50 MB.'));pendingRestore=deserialize(await file.text());confirmation='load';render();}
    catch(error){notice(errorMessage(error));e.target.value='';}
  }
});
app.addEventListener('submit',e=>{
  e.preventDefault();pauseTime();
  try {
    const wasCreate=e.target.id==='route-form';
    if(e.target.id==='land-technology')setTechnologyInvestment(state,'land',Number(new FormData(e.target).get('daily')));
    if(e.target.matches('.road-investment')){const d=new FormData(e.target);setRoadInvestment(state,e.target.dataset.road,Number(d.get('road')),Number(d.get('security')));}
    if(e.target.id==='fleet-replacement-form'){replaceFleet(state,fleetEdit);fleetEdit=null;notice(tx('一括置換を完了しました。','Replacement completed.'));}
    if(e.target.id==='rename-form'){const value=new FormData(e.target).get('name');if(nameEdit.kind==='company')renameCompany(state,value);else if(nameEdit.kind==='design')renameDesign(state,nameEdit.id,value);else renameShip(state,nameEdit.id,value);nameEdit=null;}
    if(e.target.id==='technology-form'){const d=new FormData(e.target);const values=['shipbuilding','seafaring'].map(k=>Number(d.get(k)));if(values.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(values[0]+values[1]))throw new Error(tx('技術投資額を確認してください。','Check technology investment amounts.'));['shipbuilding','seafaring'].forEach((k,i)=>setTechnologyInvestment(state,k,values[i]));}
    if(e.target.id==='design-form'){designDraft=readDesign(e.target);researchDesign(state,designDraft.hull,designDraft);}
    if(e.target.matches('.city-investment-form')){const d=new FormData(e.target);setCityInvestment(state,e.target.dataset.developmentCity,Number(d.get('size')),Object.fromEntries(GOODS.map(g=>[g.id,Number(d.get('production-'+g.id))])));}
    if(e.target.matches('.diplomacy-form')){const data=new FormData(e.target),n=e.target.dataset.nation;if(e.submitter?.value==='donation')donate(state,n,Number(data.get('donation')));else setDiplomacyInvestment(state,n,Number(data.get('daily')));}
    if(e.target.id==='automation-form'){const data=new FormData(e.target);setAutomation(state,{enabled:data.has('enabled'),replaceLost:data.has('replaceLost'),...Object.fromEntries(['monthlyBudget','minCash','expandThreshold','shrinkThreshold'].map(k=>[k,Number(data.get(k))]))});notice(tx('自動管理の設定を適用しました。','Automation settings applied.'));}
    if(wasCreate) {draft=readDraft(e.target);const route=openCircuit(state,draft.shipType,stops(),draft.allowed,draft.margin);selectedRoute=route.id;creating=false;}
    if(e.target.matches('.assign-form')) assignShip(state,e.target.dataset.route,new FormData(e.target).get('ship'));
    if(e.target.id==='edit-form') {const data=new FormData(e.target);updateRoute(state,editing,data.getAll('good'),Number(data.get('margin')));editing=null;}
    persist();render();if(wasCreate)focusRoute();
  } catch(error){notice(errorMessage(error));}
});
app.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){cancelDrag();return;}if(e.key==='Escape'&&mapPlanning){mapPlanning=false;plannedStops=[];render();return;}if(!['Enter',' '].includes(e.key))return;const control=e.target.closest('[data-city], .ship-marker, .rival-route, .rival-ship');if(control){e.preventDefault();control.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
app.addEventListener('click',e=>{
  if(suppressPortClick){suppressPortClick=false;return;}
  const port=e.target.closest('[data-city]');if(port){selectPort(port.dataset.city);return;}
  const button=e.target.closest('[data-action]');if(!button)return;
  const {action,id}=button.dataset;
  if(action!=='play')pauseTime();
  try {
    if(action==='plan-map' || action==='edit-map-stops'){pauseTime();plannedStops=action==='edit-map-stops'?[...stops()]:[];creating=false;mapPlanning=true;selectedCompetitor=null;}
    if(action==='open-crossing'&&CROSSINGS[id]){const [a,b,...extra]=CROSSINGS[id];draft={...draft,shipType:'wagon',a,b,extra};mapPlanning=false;plannedStops=[];selectedCompetitor=null;creating=true;mapRegion=id;camera=cameraFor(id);}
    if(action==='undo-map')plannedStops.pop();
    if(action==='cancel-map'){mapPlanning=false;plannedStops=[];}
    if(action==='finish-map' && plannedStops.length>=2){const ports=normalizeStops(plannedStops);draft={...draft,shipType:suggestedTransport(state,ports,draft.shipType),a:ports[0],b:ports[1],extra:ports.slice(2)};mapPlanning=false;creating=true;}
    if(action==='select-competitor'){selectedCompetitor=Number(id);showRivals=true;}
    if(['replace-types','replace-automation','replace-route'].includes(action)){const catalog=Object.keys(shipCatalog(state)),mode=action==='replace-types'?'type':action==='replace-automation'?'automation':'route',source=mode==='automation'?(state.routes[0]?.autoShipType??catalog[0]):mode==='route'?(state.ships.find(v=>v.routeId===id)?.type??catalog[0]):(state.ships[0]?.type??catalog[0]);fleetEdit={mode,source,target:catalog.find(type=>type!==source)??source,routeId:mode==='route'?id:undefined};}
    if(action==='rename-company')nameEdit={kind:'company',value:state.companyName??tx('あなたの会社','Your company')};
    if(action==='rename-design'){const spec=shipSpec(state,id);nameEdit={kind:'design',id,value:spec.customName??name(spec)};}
    if(action==='rename-ship')nameEdit={kind:shipSpec(state,state.ships.find(v=>v.id===id).type).mode==='land'?'vehicle':'ship',id,value:shipName(state,state.ships.find(v=>v.id===id))};
    if(action==='buy')buyShip(state,id);
    if(action==='buy-road')buyRoadRight(state,id);
    if(action==='buy-yard')buyShipyard(state);
    if(action==='buy-right')buyDevelopmentRight(state,id);
    if(action==='city-development')selectedCity=id;
    if(action==='license')buyLicense(state,id);
    if(action==='toggle')toggleRoute(state,id);
    if(action==='release')removeRoute(state,id);
    if(action==='release-ship')releaseShip(state,id);
    if(action==='select-route'){selectedRoute=id;selectedCompetitor=null;}
    if(action==='acquire')acquiring=Number(id);
    if(action==='confirm-acquisition'){acquireCompany(state,Number(id));acquiring=null;selectedCompetitor=null;notice(tx('買収を完了しました。','Acquisition completed.'));}
    if(action==='auto-route'){const route=state.routes.find(r=>r.id===id);if(route&&!state.gameOver)route.autoManage=!route.autoManage;}
    if(action==='new-route'){mapPlanning=false;plannedStops=[];draft.extra=[];creating=true;}
    if(action==='edit')editing=id;
    if(action==='cancel')closeDialogs();
    if(action==='play'){advanceTime(performance.now());running=!running&&!state.gameOver&&!mapPlanning;}
    if(action==='save'){try{saves=listSaves(localStorage);saving=true;}catch{throw new Error(t('storageError'));}}
    if(action==='save-slot'){if(persist(id)){closeDialogs();notice(t('saved'));}else {try{saves=listSaves(localStorage);}catch{} }}
    if(action==='load'){saving=false;try{saves=listSaves(localStorage);}catch{throw new Error(t('storageError'));}}
    if(action==='choose-save'){pendingRestore=saves.find(s=>s.slot===id&&s.valid)?.state;if(!pendingRestore)throw new Error(t('noSave'));saves=null;confirmation='load';}
    if(action==='reset')confirmation='reset';
    if(action==='confirm') {const restoring=confirmation==='load';state=restoring?pendingRestore:createGame();clock.reset();selectedRoute=null;selectedCompetitor=null;mapPlanning=false;plannedStops=[];selectedCity='kingston';closeDialogs();persist();notice(restoring?t('loaded'):tx('新しい会社を設立しました。','New company established.'));}
    if(action==='export') {exportText=serialize(state);exportURL=URL.createObjectURL(new Blob([exportText],{type:'application/json'}));}
    if(action==='import'){document.querySelector('#import-file').click();return;}
    if(['buy-road','buy','buy-yard','buy-right','license','toggle','release','release-ship','confirm-acquisition','auto-route'].includes(action))persist();
    render();if(action==='city-development')app.querySelector('.development-panel')?.scrollIntoView({block:'start'});if(['select-route','cancel'].includes(action))focusRoute();
    if(['plan-map','edit-map-stops','open-crossing'].includes(action))app.querySelector('.map-panel')?.scrollIntoView({block:'start'});
    if(action==='select-competitor')app.querySelector(button.closest('.competitors')?'.map-panel':'.competitors')?.scrollIntoView({block:'start'});
  }catch(error){notice(errorMessage(error));}
});
function mapPoint(svg, event) {
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
  return { x: point.x, y: point.y };
}
function dropCity(event) {
  const port = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-city]');
  if (port) return port.dataset.city;
  const svg = drag.svg, point = mapPoint(svg, event);
  const tolerance = 12 * svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
  return Object.entries(CITIES).find(([, city]) => Math.hypot(city.x - point.x, city.y - point.y) <= tolerance)?.[0] ?? null;
}
function cancelDrag() {
  if (!drag) return;
  const { svg, pointerId } = drag;
  drag = null;
  if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
  svg.querySelector('#route-drag-preview').setAttribute('hidden', '');
  svg.querySelector('#route-drag-label').setAttribute('hidden', '');
  svg.querySelectorAll('.drop-target').forEach(port => port.classList.remove('drop-target'));
}
app.addEventListener('pointerdown', event => {
  // Freeze moving targets before mouse-up, including at 16x speed.
  if (event.target.closest('[data-action]') && !event.target.closest('header')) pauseTime();
  const port = event.target.closest('[data-city]');
  if (!port || event.button !== 0 || !event.isPrimary) return;
  pauseTime();
  const svg = port.closest('svg');
  drag = { svg, pointerId: event.pointerId, a: port.dataset.city, x: event.clientX, y: event.clientY, moved: false };
  svg.setPointerCapture(event.pointerId);
});
app.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6) drag.moved = true;
  if (!drag.moved) return;
  event.preventDefault();
  const b = dropCity(event), city = CITIES[drag.a], target = CITIES[b] ?? mapPoint(drag.svg, event);
  const line = drag.svg.querySelector('#route-drag-preview');
  for (const [key, value] of Object.entries({ x1: city.x, y1: city.y, x2: target.x, y2: target.y })) line.setAttribute(key, value);
  line.removeAttribute('hidden');
  const label = drag.svg.querySelector('#route-drag-label');
  label.textContent = b && b !== drag.a ? `${name(city)} ⇄ ${name(CITIES[b])} · ${findRoute(drag.a, b) ? tx('ルート情報を表示','Open route') : tx('新規ルートを設定','Create route')}` : tx('終点都市で離してください','Drop on another city');
  label.setAttribute('x',camera[0]+camera[2]/2);label.setAttribute('y',camera[1]+camera[3]-12*camera[2]/900);
  label.style.fontSize=(14*camera[2]/900)+'px';label.style.strokeWidth=(3*camera[2]/900)+'px';
  label.removeAttribute('hidden');
  drag.svg.querySelectorAll('[data-city]').forEach(port => port.classList.toggle('drop-target', port.dataset.city === b && b !== drag.a));
});
app.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { a, moved } = drag, b = dropCity(event);
  cancelDrag();
  if (moved) {
    suppressPortClick = true; setTimeout(() => { suppressPortClick = false; }, 0);
    if (b && b !== a) selectConnection(a, b);
    else notice(tx('異なる都市までドラッグして離すと、ルートを選択できます。','Drag to a different city to select a route.'));
  } else { suppressPortClick=true;setTimeout(()=>{suppressPortClick=false;},0);selectPort(a); }
});
app.addEventListener('pointercancel', cancelDrag);
app.addEventListener('lostpointercapture', cancelDrag);



function advanceTime(now) {
  const days=clock.advance(now,running,speed,()=>{const previousRank=state.firstRankDay,previousWar=state.world.events.at(-1),previousIncident=state.incidents.at(-1);tick(state);const alert=state.world.events.at(-1)!==previousWar?state.world.events.at(-1):state.incidents.at(-1)!==previousIncident?state.incidents.at(-1):null;if(alert){notice(eventText(alert));persist();}if(previousRank===null&&state.firstRankDay!==null){notice(tx('初めて資産総額1位を達成しました！ 経過日数：','First place in assets achieved! Day: ')+state.firstRankDay);persist();}if(state.day%30===0||state.gameOver)persist();return !state.gameOver;});
  if(state.gameOver)running=false;
  return days;
}
function pauseTime() {
  running=false;clock.advance(performance.now(),false,speed,()=>{});
  const button=app.querySelector('[data-action="play"]');if(button)button.textContent='▶ '+t('play');
  const status=app.querySelector('#time-status');if(status)status.textContent=tx('一時停止中','Paused');
}
app.addEventListener('focusin',e=>{if(e.target.closest('form'))pauseTime();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();pauseTime();}});
function frame(now) {if(advanceTime(now))render();animateTime();requestAnimationFrame(frame);}
render();requestAnimationFrame(frame);

installMapNavigation(app,{get:()=>camera,set:c=>{camera=c;},pause:pauseTime,cancelRoute:cancelDrag});
