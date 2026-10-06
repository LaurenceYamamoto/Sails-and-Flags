import {cityLabel,cityOrder,sortedCities,roadPair,sortedRoads,visibleRoutes} from './wasm-lists.js';
import {accountCharts} from './wasm-charts.js';
import {WorldMap} from './wasm-map.js';
import {t,tx,nameOf,LANGUAGES,setLanguage,locale} from './i18n.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(n??0);
const worker=new Worker(new URL('./game-worker.js',import.meta.url),{type:'module'}),pending=new Map();let serial=0;
const rpc=data=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({...data,id});});
worker.onmessage=({data})=>{if(data.notice){notify(data.notice,true);return;}const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.ok?p.resolve(data.value):p.reject(new Error(data.error));};
worker.onerror=e=>{for(const p of pending.values())p.reject(new Error(e.message));pending.clear();notify(e.message,true);running=false;};
let catalog,view,map,tab='routes',selectedRoute=null,selectedCompany=0,city=0,running=false,speed=1,draft=null,saveRows=[],renderedDay=-1;
let routeSort='opened',routeFilter='',citySort='region',roadSort='region',investmentSort='region',accountAnnual=false,accountPeriod=null,accountData=null,accountRequest=0;
const app=document.querySelector('#app');
const notify=(text,error=false)=>{const n=document.querySelector('#toast');n.textContent=text;n.className=error?'show error':'show';clearTimeout(notify.timer);notify.timer=setTimeout(()=>n.className='',error?15000:4500);};
const player=()=>view.companies[0];
const companyName=c=>nameOf(catalog.rivals.find(r=>r.id===c.id&&r.name===c.name)??c);
const ownerName=id=>id==='state'?tx('国家','State'):id==='private'?tx('民間','Private ownership'):esc(companyName(view.companies.find(c=>c.id===id)??{name:id}));
const friendshipNumber=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:4}).format(n);
const signedFriendship=n=>(n>0?'+':'')+friendshipNumber(n);
function friendshipDetails(l){
 const causes=[['trade',tx('この国との交易','Trade with this nation')],['enemy_trade',tx('交戦相手との交易','Trade with its wartime enemies')],['investment',tx('日額の外交投資','Daily diplomatic investment')],['initial',tx('最初の免許取得','First license acquired')],['limit',tx('上限・下限の調整','Upper / lower limit adjustment')]];
 return `<details class="friendship-details" data-friendship="${l.nation}"><summary>${tx('友好度の変動・内訳','Friendship changes and causes')}</summary><small>${tx('直近30日。日次計算で確定した変動を表示します。','Last 30 days. Changes are recorded at the daily calculation.')}</small>${l.changes.length?l.changes.map(h=>`<div class="friendship-entry"><b>${t('day')} ${h.day}: ${signedFriendship(h.delta)}</b><br>${friendshipNumber(h.before)} → ${friendshipNumber(h.after)}<ul>${causes.filter(([k])=>Math.abs(h[k])>1e-10).map(([k,label])=>`<li>${label}: ${signedFriendship(h[k])}</li>`).join('')||`<li>${tx('変動なし','No change')}</li>`}</ul>${h.spent>0?`<small>${tx('外交支出','Diplomatic spending')}: £${money(h.spent)}</small>`:''}${h.unfunded?`<small class="negative">${tx('資金不足のため日額投資を実施できませんでした。','Daily investment could not be paid due to insufficient cash.')}</small>`:''}</div>`).join(''):`<p>${tx('まだ記録がありません。時間を進めると記録されます。','No records yet. Advance time to record changes.')}</p>`}</details>`;
}
const cityName=i=>esc(catalog.cities[i].mapName??catalog.cities[i].nameEn??catalog.cities[i].id);
const nationName=i=>esc(nameOf(catalog.nations[i]));
function shipStatus(s){if(s.handling){const h=s.handling;return `${h.unloading?tx('荷降ろし中','Unloading'):tx('積み込み中','Loading')} · ${cityName(h.unloading?h.trip.to:h.trip.from)} · ${tx('残り','Remaining')} ${money(h.remaining)}d`;}return s.voyage?`${cityName(s.voyage.from)} → ${cityName(s.voyage.to)} (${money(s.voyage.remaining)}d)`:tx('待機中','Waiting');}
const technologyNames=()=>[tx('造船技術','Shipbuilding'),tx('航海技術','Navigation'),tx('船舶荷役技術','Ship cargo handling'),tx('車両技術','Vehicle engineering'),tx('陸運技術','Land transport'),tx('陸運荷役技術','Land cargo handling')];
const technologyDescriptions=()=>[tx('船型の解禁・船舶設計の投資効果','Unlock hulls and improve ship design investment'),tx('海上維持費・海上遭難率を低減','Reduce sea upkeep and maritime disaster risk'),tx('船の積み込み・荷降ろしを高速化','Faster ship loading and unloading'),tx('車両・キャラバン設計の投資効果','Improve vehicle and caravan design investment'),tx('陸上維持費・陸上遭難率を低減','Reduce land upkeep and overland disaster risk'),tx('車両の積み込み・荷降ろしを高速化','Faster vehicle loading and unloading')];
const kindName=id=>esc(nameOf(view.catalog.find(s=>s.id===id)??catalog.specs.find(s=>s.id===id)??{name:id}));
const routeName=r=>r.stops.map(cityName).join(' → ');
const regionName=id=>esc(nameOf(catalog.regions.find(r=>r.id===id)??{name:id}));
const roadName=r=>roadPair(r,catalog.cities,locale()).map(cityName).join(' ↔ ');
const sortSelect=(name,value)=>field(tx('並び順','Sort order'),select(name,[['region',tx('地域順','By region')],['name',tx('文字列順','Alphabetical')]],value));
function citySelect(){
 const ids=sortedCities(catalog.cities,catalog.regions,citySort,locale());
 const option=i=>`<option value="${i}" ${i===city?'selected':''}>${cityName(i)}</option>`;
 return `<select name="city">${citySort==='name'?ids.map(option).join(''):catalog.regions.map(r=>`<optgroup label="${regionName(r.id)}">${ids.filter(i=>catalog.cities[i].region===r.id).map(option).join('')}</optgroup>`).join('')}</select>`;
}
function routeResults(){
 const co=view.companies.find(c=>c.index===selectedCompany)??player();
 const rows=visibleRoutes(co.routes,catalog.cities,routeSort,routeFilter);
 return `<h2>${esc(companyName(co))} · ${t('routes')} ${rows.length} / ${co.routes.length}</h2>${rows.map(r=>btn(`${r.mode==='land'?'▰':'⚓'} ${routeName(r)} <small>${r.fleet.length} · £${money(r.profit)}</small>`,'rivalRoute',`data-id="${r.id}" data-company="${co.index}" class="route-row"`)).join('')||`<p>${routeFilter?tx('該当する交易路はありません。','No matching routes.'):t('noRoute')}</p>`}${co.index===0&&!co.routes.length&&!routeFilter?`<p>${t('guide1')}<br>${t('guide2')}</p>`:''}`;
}
async function refreshAccounts(){
 if(accountData?.day===view.day&&accountData.annual===accountAnnual){drawAccounts();return;}
 const request=++accountRequest,day=view.day,annual=accountAnnual;
 try{const data=await query({query:'accounts',annual});if(request!==accountRequest||tab!=='ledger'||annual!==accountAnnual)return;accountData={...data,day,annual};drawAccounts();}catch(e){notify(e.message,true);}
}
const periodLabel=p=>p.month?`${p.year}-${String(p.month).padStart(2,'0')}`:String(p.year);
function drawAccounts(){
 const host=document.querySelector('#account-report');if(!host||!accountData)return;
 const periods=accountData.periods,p=periods.find(p=>p.id===accountPeriod)??periods.at(-1);
 if(!p){host.textContent=tx('記録がありません。','No records.');return;}
 const categories=[...new Set([...Object.keys(p.income),...Object.keys(p.expense)])];
 host.innerHTML=`${field(tx('集計期間','Period'),select('accountPeriod',[...periods].reverse().map(p=>[p.id,periodLabel(p)]),p.id))}<table><thead><tr><th>${t('transaction')}</th><th>${tx('収入','Income')}</th><th>${tx('支出','Expenses')}</th></tr></thead><tbody>${categories.map(k=>`<tr><td>${esc(t(k))}</td><td>£${money(p.income[k]??0)}</td><td>£${money(p.expense[k]??0)}</td></tr>`).join('')}<tr><th>${tx('合計','Total')}</th><td>£${money(p.totalIncome)}</td><td>£${money(p.totalExpense)}</td></tr></tbody></table><p>${tx('収支','Net cash flow')}: £${money(p.net)} · ${tx('期間末の総資産','Period-end total assets')}: £${money(p.assets)}</p><p>${tx('表示期間','Displayed period')}: ${periodLabel(periods[0])} — ${periodLabel(periods.at(-1))}</p>${accountCharts(periods,{money,tx})}<details data-preserve="account-trends"><summary>${tx('推移の数値','Trend data')}</summary><table><thead><tr><th>${tx('集計期間','Period')}</th><th>${t('sale')}</th><th>${tx('支出','Expenses')}</th><th>${t('assets')}</th></tr></thead><tbody>${periods.map(x=>`<tr><td>${periodLabel(x)}</td><td>£${money(x.sales)}</td><td>£${money(x.totalExpense)}</td><td>£${money(x.assets)}</td></tr>`).join('')}</tbody></table></details>`;
}
const btn=(label,action,attrs='',disabled=false)=>`<button data-do="${action}" ${attrs} ${disabled?'disabled':''}>${label}</button>`;
const input=(name,value=0,min=0)=>`<input name="${name}" type="number" min="${min}" step="any" value="${value}" required>`;
const percentage=(name,value)=>`<input name="${name}" type="number" min="0" max="100" step="any" value="${value}" required>`;
const select=(name,items,value)=>`<select name="${name}">${items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${label}</option>`).join('')}</select>`;
const check=(name,label,on)=>`<label class="check"><input type="checkbox" name="${name}" ${on?'checked':''}>${label}</label>`;
const field=(label,control)=>`<label>${label}${control}</label>`;
const types=(filter=()=>true)=>view.catalog.filter(filter).map(s=>[s.id,kindName(s.id)]);
const form=(action,html,attrs='')=>`<form data-form="${action}" ${attrs}>${html}<button>${action==='openRoute'?t('create'):tx('適用','Apply')}</button></form>`;
const goodsChecks=allowed=>`<div class="goods-checks">${catalog.goods.map((g,i)=>check('good-'+i,esc(nameOf(g)),allowed.includes(i))).join('')}</div>`;
function pause(){running=false;renderHeader();}
async function command(command){pause();accountData=null;try{view=await rpc({op:'command',command});render(true);return true;}catch(e){notify(e.message,true);return false;}}
async function query(request){return rpc({op:'query',request});}
async function selectCity(i){pause();city=i;map.select(i);if(draft){draft.push(i);renderPlanner();return;}view=await rpc({op:'view',city});tab='market';render(true);}
function selectRoute(c,id){pause();selectedRoute=id;selectedCompany=c;tab='routes';render(true);}
async function connection(stops){pause();try{const q=await query({query:'connection',stops});if(q.routes.length){selectRoute(0,q.routes[0]);return;}draft=q.stops;tab='routes';render(true);await renderPlanner();}catch(e){notify(e.message,true);}}
function layout(){
 map?.destroy();
 app.innerHTML=`<header class="w-header"><div><b>Sails & Flags</b><small>3.3.5 · ${tx('世界交易会社','Global trading company')}</small></div><div id="status"></div><div class="controls"><button id="play"></button>${select('speed',[[1,'1×'],[4,'4×'],[16,'16×']],speed)}${select('language',Object.entries(LANGUAGES).map(([k,v])=>[k,v.label]),document.documentElement.lang)}</div></header><main class="w-layout"><section class="map-panel"><div class="map-toolbar"><span>${tx('世界の交易網','World trade network')}</span><div class="map-navigation">${['in','out','left','right','up','down','reset'].map((a,i)=>`<button data-map-nav="${a}" aria-label="${a}">${['＋','−','←','→','↑','↓','⊙'][i]}</button>`).join('')}<span data-map-scale>1.0×</span></div></div><div id="map-host"></div><div class="map-caption">${tx('都市間をドラッグして開設・選択。背景をドラッグして移動、ホイールでズーム。','Drag between cities to open/select a route. Drag the background to pan; scroll to zoom.')}</div><div id="planner"></div><div class="map-legend">${tx('実線：自社　破線：競合　● 港　■ 内陸都市','Solid: your company · Dashed: rivals · ● Port · ■ Inland')}</div><div id="events"></div></section><section class="dashboard"><nav id="tabs"></nav><div id="panel"></div></section></main><dialog id="modal"><div id="modal-body"></div><button data-do="close">${t('cancel')}</button></dialog><input id="import-file" type="file" accept=".json,application/json" hidden>`;
 map=new WorldMap(document.querySelector('#map-host'),catalog,{pause,city:i=>selectCity(i).catch(e=>notify(e.message,true)),connect:connection,route:selectRoute,companyName});
 render(true);
}
function renderHeader(){if(!view)return;const c=player();document.querySelector('#status').innerHTML=`<strong>${esc(companyName(c))}</strong><span>${new Date(Date.UTC(1700,0,1)+view.day*86400000).toLocaleDateString(locale())} <small>${money(view.fraction*24)}h</small></span><span>${t('cash')} <b>£${money(c.cash)}</b> · ${t('assets')} £${money(c.assets)}</span>`;document.querySelector('#play').textContent=c.bankrupt?t('bankrupt'):running?t('pause'):t('play');document.querySelector('#play').disabled=c.bankrupt;}
function render(force=false){
 renderHeader();map.update(view,selectedRoute);map.select(city);
 if(force||renderedDay!==view.day){renderedDay=view.day;
  document.querySelector('#tabs').innerHTML=[['routes',t('routes')],['market',tx('都市','Cities')],['licenses',tx('国家','Nations')],['fleet',t('ships')],['industry',tx('研究・投資','Research')],['roads',tx('陸上交易','Land trade')],['companies',tx('会社','Companies')],['ledger',t('journal')],['saves',t('save')]].map(([id,label])=>btn(label,'tab',`data-tab="${id}" class="${tab===id?'active':''}"`)).join('');
  if(force||!document.querySelector('#panel').contains(document.activeElement))renderPanel();
  document.querySelector('#events').innerHTML=view.events.slice(0,4).map(e=>`<p><small>${e.day}d</small> ${e.kind==='seaDisaster'?tx('海上遭難：船と積荷を喪失','Maritime disaster: ship and cargo lost')+' · ':e.kind==='landDisaster'?tx('陸上遭難：車両と積荷を喪失','Overland disaster: vehicle and cargo lost')+' · ':''}${esc(e.message)}</p>`).join('');
 }
}
function renderPanel(){const expanded=[...document.querySelectorAll('[data-friendship][open]')].map(d=>d.dataset.friendship);const p=player();let h='';
 if(tab==='routes'){
  h=`${field(tx('会社','Company'),select('routeCompany',view.companies.map(c=>[c.index,esc(companyName(c))]),selectedCompany))}<div class="row">${btn(t('routeSetup'),'newRoute')}${btn(tx('地図で巡回ルートを作る','Plan a circuit on the map'),'circuit')}</div>`;
  const co=view.companies.find(c=>c.index===selectedCompany)??p;const r=co.routes.find(r=>r.id===selectedRoute);
  if(r){h+=`<article><small>${esc(companyName(co))} · #${r.id}</small><h2>${routeName(r)}</h2><div class="metrics"><span>${t('ships')} <b>${r.fleet.length}</b></span><span>${t('roundtrip')} <b>${money(r.cycle)}d</b></span><span>${tx('運行間隔','Interval')} <b>${money(r.interval)}d</b></span><span>${tx('待機時間割合','Idle time ratio')} <b>${r.idleRatio===null?'—':money(r.idleRatio)+'%'}</b>${r.observing?' · '+tx('観測中','Observing'):''}</span><span>${t('profit')} <b>£${money(r.profit)}</b></span><span>${t('forecast')} £${money(r.forecast)}</span><span>${t('actual')} ${r.actual===null?'—':'£'+money(r.actual)}</span></div>`;
   h+=`<p>${tx('指定船種の遭難率 / 移動日','Designated type disaster risk / travel day')}: ${new Intl.NumberFormat(locale(),{maximumFractionDigits:4}).format(Math.max(...r.disasterRates))}%</p><details data-preserve="activity-${co.index}-${r.id}"><summary>${tx('運行時間の内訳','Operating time breakdown')}</summary><p>${tx('配置中の船・車両の合計時間。運行間隔の調整も待機に含みます。','Combined time of assigned vessels. Dispatch spacing also counts as waiting.')} ${tx('積み込み・荷降ろし速度','Loading / unloading rate')}: ${money(r.handlingRate)} ${tx('単位/日','units/day')}</p>${[[tx('移動','Moving'),'moving'],[tx('積み込み','Loading cargo'),'loading'],[tx('荷降ろし','Unloading cargo'),'unloading'],[tx('待機','Idle'),'waiting']].map(([label,key])=>`<span>${label}: ${money(r.activity[key])}d </span>`).join('')}</details>`;
   if(co.index===0){h+=form('route',`${field(tx('自動増減に使用する船種','Vessel type for automatic scaling'),select('kind',types(s=>r.types.includes(s.id)),r.auto_type))}${check('auto',tx('自動増減の対象','Allow automatic scaling'),r.auto_manage)}${field(tx('護衛数','Escorts'),select('escorts',[[0,0],[1,1],[2,2],[3,3]],r.escorts))}${field(t('margin'),input('margin',r.min_margin))}${goodsChecks(r.allowed)}`,`data-route="${r.id}"`);
    h+=`<div class="row">${btn(tx('船を追加','Add a vessel'),'addRoute',`data-id="${r.id}"`)}${btn(r.active?t('stop'):t('resume'),'active',`data-id="${r.id}"`)}${btn(tx('全船を置換','Replace route fleet'),'replaceRoute',`data-id="${r.id}"`)}${btn(tx('ルートを削除','Remove route'),'removeRoute',`data-id="${r.id}"`)}</div>`;
    if(r.available.length)h+=form('assign',field(t('unassigned'),select('ship',p.ships.filter(s=>r.available.includes(s.id)).map(s=>[s.id,esc(s.name)+' · '+kindName(s.kind)]))),`data-route="${r.id}"`);
   }
   h+=`<ul>${co.ships.filter(s=>s.route===r.id).map(s=>`<li>${esc(s.name)} · ${kindName(s.kind)} · ${shipStatus(s)}${co.index===0?btn(t('release'),'release',`data-id="${s.id}"`,!!s.voyage||!!s.handling||s.cargo.length>0):''}</li>`).join('')}</ul></article>`;
  }
  h+=`<div class="list-controls">${[['profit',tx('収益順','By profit')],['fleet',tx('船・車両数順','By fleet size')],['opened',tx('開設順','By opening date')]].map(([sort,label])=>btn(label,'routeSort',`data-sort="${sort}" aria-pressed="${routeSort===sort}"`)).join('')}${field(tx('都市名で絞り込み','Filter by city name'),`<input name="routeFilter" type="search" value="${esc(routeFilter)}" placeholder="${tx('都市名の一部','Part of a city name')}">`)}</div><div id="route-results">${routeResults()}</div>`;

  const a=view.automation;h+=`<details data-preserve="automation"><summary>${tx('会社の自動増減設定','Company automation')}</summary>${form('automation',`${check('enabled',tx('有効','Enabled'),a.enabled)}${check('replaceLost',tx('喪失船を補充','Replace lost vessels'),a.replace_lost)}${field(tx('月間購入予算','Monthly purchase budget'),input('budget',a.budget))}${field(tx('留保資金','Cash reserve'),input('reserve',a.reserve))}${field(tx('待機割合がこの値未満なら拡大 (%)','Expand below idle time (%)'),percentage('expand',a.expand))}${field(tx('待機割合がこの値を超えたら縮小 (%)','Shrink above idle time (%)'),percentage('shrink',a.shrink))}`)}</details>`;
 }else if(tab==='licenses'){
  h=`<h2>${tx('国家','Nations')}</h2><table class="nations-table"><thead><tr><th>${tx('国','Country')}</th><th>${tx('友好度 / 税','Friendship / Tax')}</th><th>${tx('取得費 / 維持費','Purchase / Daily')}</th><th>${tx('日額投資','Daily budget')}</th></tr></thead><tbody>${view.licenses.map(l=>`<tr><td><i class="country-dot" style="background:${catalog.nations[l.nation].color}"></i>${nationName(l.nation)}<div>${l.owned?t('owned'):btn(t('acquire'),'license',`data-id="${l.nation}"`,!l.eligible)}</div></td><td>${friendshipNumber(l.friendship)} / ${money(l.tax)}%</td><td>£${money(l.fee)}<br><small>£${money(l.daily)} / d</small></td><td>${form('diplomacy',field(tx('日額投資','Daily budget')+' £',input('value',l.budget)),`data-nation="${l.nation}"`)}</td></tr><tr class="friendship-row"><td colspan="4">${friendshipDetails(l)}</td></tr>`).join('')}</tbody></table><h3>${tx('戦争中の国家','Countries at war')}</h3>${view.wars.map(w=>`<p>${nationName(w.a)} ↔ ${nationName(w.b)}</p>`).join('')||'—'}`;
 }else if(tab==='market'){
  const d=view.development;h=`${sortSelect('citySort',citySort)}${field(tx('都市','Cities'),citySelect())}<div class="city-heading"><h2>${cityName(city)}</h2>${btn(tx('地図で表示','Locate'),'locate')}</div><p><i class="country-dot" style="background:${catalog.nations[catalog.cities[city].nation].color}"></i>${nationName(catalog.cities[city].nation)}</p><p>${tx('都市開発権','Development rights')}: ${ownerName(d.owner)} · £${money(view.developmentCost)}</p>`;
  h+=d.owner==='player'?form('citySize',field(tx('都市規模への日額投資','Daily city-size budget'),input('size',d.size_budget))):btn(tx('都市開発権を取得','Buy development rights'),'buyDevelopment');
  h+=`<table><thead><tr><th>${t('product')}</th><th>${t('price')} / ${t('stock')}</th><th>${t('production')}</th><th>${tx('予想消費 / 日','Expected consumption / day')}</th>${d.owner==='player'?`<th>${tx('日額投資','Daily budget')}</th>`:''}</tr></thead><tbody>${view.market.map(m=>`<tr><td>${esc(nameOf(catalog.goods[m.good]))}</td><td>£${money(m.price)}<br><small>${money(m.stock)}</small></td><td>${money(m.production)}</td><td>${money(m.demand)}<br><small>${tx('実消費','Consumed')}: ${money(m.consumption)}</small><details><summary>${tx('内訳','Details')}</summary>${tx('基準需要','Base demand')} ${money(m.details.base)}<br>${tx('地域・気候','Region / climate')} ×${money(m.details.location)}<br>${tx('季節','Season')} ×${money(m.details.season)}<br>${tx('都市規模','City size')} ×${money(m.details.city)}<br>${tx('戦争','War')} ×${money(m.details.war)}<br>${tx('価格反応','Price response')} ×${money(m.details.price)}<br>${tx('供給不足','Unmet demand')} ${money(m.unmet)}</details></td>${d.owner==='player'?`<td>${form('production',input('value',m.budget),`data-good="${m.good}"`)}</td>`:''}</tr>`).join('')}</tbody></table>`;
 }else if(tab==='fleet'){
  h=`<h2>${t('ships')} · ${p.ships.length}</h2>${form('defaults',field(tx('デフォルトの船','Default ship'),select('ship',types(s=>s.mode==='sea'),view.defaultShip))+field(tx('デフォルトの車両','Default vehicle'),select('vehicle',types(s=>s.mode==='land'),view.defaultVehicle)))}${form('buyShip',field(tx('購入する船・車両','Ship / vehicle to purchase'),select('kind',types(),view.defaultShip)))}<div class="row">${btn(tx('船種を一括置換','Replace all of a type'),'replaceType')}${btn(tx('自動増減船種を一括置換','Replace automation type'),'replaceAuto')}</div>${view.fleetGroups.map(g=>`<details data-preserve="fleet-${esc(g.kind)}"><summary>${kindName(g.kind)} · ${tx('使用中','In use')} ${g.used} · ${tx('未使用','Unused')} ${g.idle}</summary><table><tbody>${p.ships.filter(s=>s.kind===g.kind).map(s=>`<tr><td>${esc(s.name)}<br><small>${s.route===null?t('unassigned'):'#'+s.route}</small></td><td>${s.canSell?btn(tx('売却','Sell')+' £'+money(s.salePrice),'sellShip',`data-id="${s.id}"`):''}${s.route!==null?btn(t('routes'),'route',`data-id="${s.route}"`):''}</td></tr>`).join('')}</tbody></table></details>`).join('')}`;
 }else if(tab==='industry'){
  h=`<h2>${tx('技術と船・車両の設計','Technology and transport design')}</h2>${view.technology.map((level,i)=>form('technology',`<small>${technologyDescriptions()[i]}</small>${field(technologyNames()[i]+' · '+money(level),input('value',view.techBudget[i]))}`,`data-kind="${i}"`)).join('')}<p>${tx('積み込み・荷降ろし速度','Loading / unloading rate')}: ${tx('海上 / 陸上','Sea / Land')} ${view.handlingRates.map(money).join(' / ')} ${tx('単位/日','units/day')}</p>${btn(tx('船・車両を設計','Design a ship or vehicle'),'design')}<table><thead><tr><th>${t('ships')}</th><th>${t('capacity')} / ${tx('速度','Speed')} / ${t('range')}</th><th>${tx('悪路適性','Rough-road capability')}</th><th>${tx('建造費 / 維持費','Build / Daily')}</th></tr></thead><tbody>${view.catalog.map(s=>`<tr><td>${kindName(s.id)}${s.id.startsWith('design-')?btn(tx('改名','Rename'),'renameDesign',`data-id="${s.id}"`):''}</td><td>${s.capacity} / ${money(s.speed)} / ${money(s.range)}</td><td>${s.mode==='land'?money(s.roughness*100)+'%':'—'}</td><td>£${money(s.price)} / £${money(s.daily)}</td></tr>`).join('')}</tbody></table>`;
 }else if(tab==='roads'){
  h=`<h2>${tx('道路開発権','Road development rights')}</h2>${sortSelect('roadSort',roadSort)}${sortedRoads(view.roads,catalog.roads,catalog.cities,catalog.regions,roadSort,locale()).map(r=>{const d=catalog.roads[r.index];return `<details data-preserve="road-${r.index}"><summary>${roadName(d)} · ${money(d.km)}km${roadSort==='region'?' · '+regionName(catalog.cities[roadPair(d,catalog.cities,locale())[0]].region):''}</summary><p>${ownerName(r.owner)} · ${tx('整備 / 治安','Quality / Security')} ${money(r.quality)} / ${money(r.security)} · ${tx('通行性','Passability')} ${money(r.passability*100)}%</p>${r.owner==='player'?form('roadInvestment',field(tx('整備予算 / 日','Daily road budget'),input('roadBudget',r.road_budget))+field(tx('治安予算 / 日','Daily security budget'),input('securityBudget',r.security_budget)),`data-road="${r.index}"`):btn(tx('権利を取得','Buy rights')+' £'+money(r.price),'buyRoad',`data-id="${r.index}"`,!r.eligible)}</details>`;}).join('')}`;
 }else if(tab==='companies'){
  h=`<h2>${tx('会社経営','Company management')}</h2>${form('renameCompany',field(tx('会社名','Company name'),`<input name="name" maxlength="80" value="${esc(p.name)}" required>`))}${view.companies.map(c=>`<article><h3>${esc(companyName(c))}</h3><p>${t('cash')} £${money(c.cash)} · ${t('assets')} £${money(c.assets)}<br>${t('ships')} ${c.ships.length} · ${t('routes')} ${c.routes.length} ${c.bankrupt?t('bankrupt'):''}</p>${investmentPanel(c)}${c.index?btn(tx('買収条件を確認','Review acquisition'),'acquisition',`data-id="${c.index}"`):''}${btn(t('routes'),'companyRoutes',`data-company="${c.index}"`)}</article>`).join('')}`;
 }else if(tab==='ledger'){
  h=`<h2>${t('journal')}</h2><p>${tx('集計・グラフの単位','Totals and chart interval')}</p><div class="row">${btn(tx('月間集計','Monthly totals'),'accountMode','data-annual="false" aria-pressed="'+!accountAnnual+'"')}${btn(tx('年間集計','Annual totals'),'accountMode','data-annual="true" aria-pressed="'+accountAnnual+'"')}</div><div id="account-report"></div><details data-preserve="ledger"><summary>${tx('直近の明細','Recent transactions')}</summary><table><thead><tr><th>${t('day')}</th><th>${t('transaction')}</th><th>${t('amount')}</th></tr></thead><tbody>${view.ledger.map(e=>`<tr><td>${e.day}</td><td>${esc(t(e.category))}<br><small>${esc(e.detail)}</small></td><td class="${e.amount<0?'negative':'positive'}">£${money(e.amount)}</td></tr>`).join('')}</tbody></table></details>`;
 }else if(tab==='saves'){
  h=`<h2>${tx('航海日誌の保存','Save your voyage')}</h2><div class="row">${btn(tx('ファイルへ書き出す','Export save file'),'export')}${btn(tx('ファイルから読み込む','Import save file'),'import')}${btn(tx('一覧を更新','Refresh saves'),'refreshSaves')}</div>${[1,2,3,4,5].map(n=>{const s=saveRows.find(s=>s.id==='manual-'+n);return `<article><b>${tx('手動','Manual')} ${n}</b><p>${s?esc(s.name)+' · '+s.day+'d · '+new Date(s.savedAt).toLocaleString(locale()):'—'}</p>${btn(t('save'),'save',`data-slot="${n}"`)} ${btn(t('load'),'load',`data-slot="manual-${n}"`,!s)}</article>`;}).join('')}<h3>${tx('自動セーブ','Autosaves')}</h3>${saveRows.filter(s=>s.auto).sort((a,b)=>b.savedAt-a.savedAt).map(s=>`<p>${s.day}d · ${esc(s.name)} ${btn(t('load'),'load',`data-slot="${s.id}"`)}</p>`).join('')}<hr>${btn(t('reset'),'reset')}`;
 }
 const preserved=[...document.querySelectorAll('[data-preserve][open]')].map(d=>d.dataset.preserve);
 document.querySelector('#panel').innerHTML=h;
 for(const d of document.querySelectorAll('[data-preserve]'))d.open=preserved.includes(d.dataset.preserve);
 if(tab==='ledger')refreshAccounts();
 for(const id of expanded){const d=document.querySelector('[data-friendship="'+id+'"]');if(d)d.open=true;}
}
function investmentPanel(c){const a=c.investments,cmp=cityOrder(catalog.cities,catalog.regions,investmentSort,locale());return `<details data-preserve="investment-${c.index}"><summary>${tx('技術・投資','Technology / investment')}</summary><p>${c.technology.map((v,i)=>technologyNames()[i]+': '+money(v)+' (£'+money(c.techBudget[i])+'/d)').join('<br>')}</p>${sortSelect('investmentSort',investmentSort)}${[...a.cities].sort((a,b)=>cmp(a.city,b.city)).map(d=>`<p>${cityName(d.city)}${investmentSort==='region'?' · '+regionName(catalog.cities[d.city].region):''} · ${tx('規模','Size')} ${money(d.size)} (£${money(d.sizeBudget)}/d)<br>${d.productionBudget.flatMap((v,i)=>v>0?[esc(nameOf(catalog.goods[i]))+' £'+money(v)+'/d']:[]).join(', ')}</p>`).join('')}${sortedRoads(a.roads.map(d=>({...d,index:d.road})),catalog.roads,catalog.cities,catalog.regions,investmentSort,locale()).map(d=>`<p>${roadName(catalog.roads[d.road])}${investmentSort==='region'?' · '+regionName(catalog.cities[roadPair(catalog.roads[d.road],catalog.cities,locale())[0]].region):''}<br>${tx('整備 / 治安','Quality / Security')}: ${money(d.quality)} / ${money(d.security)} (£${money(d.roadBudget)} / £${money(d.securityBudget)} per day)</p>`).join('')}</details>`;}
async function renderPlanner(){const n=document.querySelector('#planner');if(!draft){n.innerHTML='';return;}
 n.innerHTML=`<h3>${tx('寄港順を地図で選択','Select stops on the map')}</h3><p>${draft.map(cityName).join(' → ')||tx('最初の都市を選択してください','Select the first city')}${draft.length>1?' → '+cityName(draft[0]):''}</p><div class="row">${btn(tx('最後の都市を取り消す','Undo stop'),'undo')}${btn(tx('船種と費用を確認','Choose vessel and review costs'),'finish','',draft.length<2)}${btn(t('cancel'),'cancelPlan')}</div><small>${tx('同じ都市を複数回選べます。最後は最初の都市へ戻ります。','Repeat visits are allowed. The last stop returns to the first.')}</small>`;
}
function modal(html){pause();document.querySelector('#modal-body').innerHTML=html;const d=document.querySelector('#modal');if(!d.open)d.showModal();}
async function openSetup(stops){const q=await query({query:'connection',stops});const kinds=types(s=>q.types.includes(s.id));
 modal(`<h2>${t('routeSetup')}</h2><p>${q.stops.map(cityName).join(' → ')}</p>${form('openRoute',`${field(t('vessel'),select('kind',kinds,q.default))}${field(t('margin'),input('margin',10))}${goodsChecks(catalog.goods.map((_,i)=>i))}<div id="quote"></div>`,`data-stops="${q.stops.join(',')}"`)}`);await openingQuote();
}
async function openingQuote(){const f=document.querySelector('[data-form="openRoute"]');if(!f)return;const target=document.querySelector('#quote');try{const q=await query({query:'opening',kind:f.elements.kind.value,stops:f.dataset.stops.split(',').map(Number)});target.innerHTML=`<p>${q.reuse?tx('所有する船を使用','Use an idle vessel'):tx('新たに購入','Purchase a new vessel')} · ${tx('必要資金','Required cash')} <b>£${money(q.cost)}</b><br>${tx('残金','Remaining cash')}: £${money(q.remaining)}<br>${tx('最長区間 / 航続距離','Longest leg / Range')}: ${money(q.longest)} / ${money(q.range)}</p>${q.missing.length?`<p class="negative">${tx('必要な免許','Missing licenses')}: ${q.missing.map(nationName).join(', ')}</p>`:''}`;f.querySelector('button').disabled=!q.affordable||q.missing.length>0;}catch(e){target.textContent=e.message;f.querySelector('button').disabled=true;}}
async function replacement(mode,route){modal(`<h2>${tx('すべて置き換える','Replace all')}</h2>${form('replace',`${mode==='route'?'':field(tx('置換元','From'),select('source',types()))}${field(tx('置換先','To'),select('target',types()))}<div id="replace-quote"></div>`,`data-mode="${mode}" data-route="${route??0}"`)}`);await replaceQuote();}
function replaceRequest(f){return {mode:f.dataset.mode,route:+f.dataset.route,source:f.elements.source?.value??'',target:f.elements.target.value};}
async function replaceQuote(){const f=document.querySelector('[data-form="replace"]');if(!f)return;try{const q=await query({query:'replacement',...replaceRequest(f)});document.querySelector('#replace-quote').innerHTML=`<p>${q.count} · ${tx('購入費','Purchase')} £${money(q.purchase)} − ${tx('売却益','Sale')} £${money(q.sale)} = <b>£${money(q.cost)}</b></p>`;f.querySelector('button').disabled=!q.affordable;}catch(e){document.querySelector('#replace-quote').textContent=e.message;f.querySelector('button').disabled=true;}}
let designQuoteRequest=0;
async function designQuote(){const f=document.querySelector('[data-form="research"]');if(!f)return;const request=++designQuoteRequest;f.querySelector('button').disabled=true;try{const land=catalog.specs.find(s=>s.id===f.elements.kind.value)?.mode==='land'; f.querySelector('[data-design-defense]').textContent=(land?tx('悪路適性','Rough-road capability'):tx('武装','Guns'))+' £';const q=await query({query:'design',kind:f.elements.kind.value,budgets:[0,1,2,3,4].map(i=>+f.elements['budget'+i].value)});if(request!==designQuoteRequest||!f.isConnected)return;f.querySelector('#design-quote').innerHTML=`<p>${tx('必要技術','Required technology')}: ${land?technologyNames()[3]:technologyNames()[0]} ${money(q.spec.level)}<br>${tx('研究費','Research cost')} £${money(q.cost)} · ${tx('残金','Remaining cash')} £${money(q.remaining)}<br>${t('capacity')} ${q.spec.capacity} · ${tx('速度','Speed')} ${money(q.spec.speed)} · ${t('range')} ${money(q.spec.range)} · ${land?tx('悪路適性','Rough-road capability'):tx('武装','Guns')} ${money(land?q.spec.roughness*100:q.spec.guns)}${land?'%':''}<br>${tx('建造費','Build cost')} £${money(q.spec.price)} · ${t('upkeep')} £${money(q.spec.daily)}</p>`;f.querySelector('button').disabled=!q.eligible||!q.affordable;}catch(e){if(request!==designQuoteRequest||!f.isConnected)return;f.querySelector('#design-quote').textContent=e.message;f.querySelector('button').disabled=true;}}
async function refreshSaves(){try{saveRows=await rpc({op:'saves'});if(tab==='saves')renderPanel();}catch(e){notify(e.message,true);}}
app.addEventListener('click',async e=>{try{if(e.target.id==='play'){running=!running;renderHeader();return;}const b=e.target.closest('[data-do]');if(!b)return;const a=b.dataset.do,id=+b.dataset.id;pause();
 if(a==='tab'){tab=b.dataset.tab;render(true);if(tab==='saves')await refreshSaves();}
 else if(a==='route')selectRoute(0,id);else if(a==='rivalRoute')selectRoute(+b.dataset.company,id);
 else if(a==='routeSort'){routeSort=b.dataset.sort;renderPanel();}
 else if(a==='companyRoutes'){selectedCompany=+b.dataset.company;selectedRoute=null;routeFilter='';tab='routes';render(true);}
 else if(a==='accountMode'){accountAnnual=b.dataset.annual==='true';accountPeriod=null;accountData=null;renderPanel();}
 else if(a==='sellShip'){const s=player().ships.find(s=>s.id===id);if(s&&confirm(tx('売却しますか？','Sell this ship / vehicle?')+' '+s.name+' · £'+money(s.salePrice)))await command({action:'sellShip',ship:id});}
 else if(a==='license')await command({action:'license',nation:id});
 else if(a==='active'){const r=player().routes.find(r=>r.id===id);await command({action:'route',route:id,active:!r.active});}
 else if(a==='removeRoute'){if(confirm(tx('このルートを削除しますか？ 航行中は削除できません。','Remove this route? Vessels must have arrived.')))await command({action:a,route:id});}
 else if(a==='release')await command({action:a,ship:id});
 else if(a==='newRoute'){modal(`<h2>${t('routeSetup')}</h2>${form('chooseStops',field(t('departure'),select('from',catalog.cities.map((_,i)=>[i,cityName(i)]),0))+field(t('destination'),select('to',catalog.cities.map((_,i)=>[i,cityName(i)]),1)))}`);}
 else if(a==='circuit'){draft=[];await renderPlanner();}
 else if(a==='undo'){draft.pop();await renderPlanner();}
 else if(a==='cancelPlan'){draft=null;await renderPlanner();}
 else if(a==='finish')await openSetup(draft);
 else if(a==='addRoute')await openSetup(player().routes.find(r=>r.id===id).stops);
 else if(a==='locate')map.focus(city);
 else if(a==='buyDevelopment')await command({action:a,city});
 else if(a==='buyRoad')await command({action:a,road:id});
 else if(a==='design'){modal(`<h2>${tx('船・車両を設計','Design a ship or vehicle')}</h2>${form('research',field(t('ships'),select('kind',catalog.specs.map(s=>[s.id,esc(nameOf(s))]),'sloop'))+[t('capacity'),tx('速度','Speed'),'<span data-design-defense>'+tx('武装','Guns')+' £</span>',t('range'),t('upkeep')].map((label,i)=>field(label+(i===2?'':' £'),input('budget'+i,0))).join('')+'<div id="design-quote"></div>')}`);await designQuote();}
 else if(a==='renameDesign'){const kind='design',target=view.catalog.find(s=>s.id===b.dataset.id);modal(`<h2>${tx('改名','Rename')}</h2>${form('rename',field(tx('名前','Name'),`<input name="name" value="${esc(target.name)}" maxlength="80" required>`),`data-kind="${kind}" data-id="${b.dataset.id}"`)}`);}
 else if(a==='replaceRoute')await replacement('route',id);else if(a==='replaceType')await replacement('type');else if(a==='replaceAuto')await replacement('automation');
 else if(a==='acquisition'){const q=await query({query:'acquisition',company:id});modal(`<h2>${tx('競合買収','Acquire company')}</h2><p>${tx('必要資金','Required cash')} £${money(q.required)} · ${tx('買収価格','Price')} £${money(q.price)} · ${tx('免許取得費','License costs')} £${money(q.licenseCost)}</p>${btn(tx('買収を実行','Acquire company'),'acquire',`data-id="${id}"`,!q.eligible||!q.affordable)}`);}
 else if(a==='acquire'){if(await command({action:a,company:id}))document.querySelector('#modal').close();}
 else if(a==='save'){const slot=+b.dataset.slot;if(!saveRows.some(s=>s.id==='manual-'+slot)||confirm(tx('この枠を上書きしますか？','Overwrite this slot?'))){await rpc({op:'save',slot});notify(t('saved'));await refreshSaves();}}
 else if(a==='load'){if(confirm(t('loadConfirm'))){accountData=null;accountPeriod=null;view=await rpc({op:'loadSlot',slot:b.dataset.slot});render(true);notify(t('loaded'));}}
 else if(a==='refreshSaves')await refreshSaves();
 else if(a==='export'){const text=await rpc({op:'export'}),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`sails-flags-3-day-${view.day}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 else if(a==='import')document.querySelector('#import-file').click();
 else if(a==='reset'){if(confirm(t('resetConfirm'))){await command({action:'new',seed:crypto.getRandomValues(new Uint32Array(1))[0]});selectedRoute=null;draft=null;renderPlanner();}}
 else if(a==='close')document.querySelector('#modal').close();
 }catch(err){notify(err.message,true);}});
app.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(!f.dataset.form)return;const data=new FormData(f),val=k=>Number(data.get(k)),str=k=>String(data.get(k)),checked=k=>data.has(k),action=f.dataset.form;let c;
 try{if(action==='chooseStops'){await connection([val('from'),val('to')]);if(draft)await openSetup(draft);else document.querySelector('#modal').close();return;}
 if(action==='openRoute')c={action,kind:str('kind'),stops:f.dataset.stops.split(',').map(Number),margin:val('margin'),allowed:catalog.goods.flatMap((_,i)=>checked('good-'+i)?[i]:[])};
 else if(action==='route')c={action,route:+f.dataset.route,kind:str('kind'),auto:checked('auto'),escorts:val('escorts'),margin:val('margin'),allowed:catalog.goods.flatMap((_,i)=>checked('good-'+i)?[i]:[])};
 else if(action==='assign')c={action,route:+f.dataset.route,ship:val('ship')};
 else if(action==='automation')c={action,enabled:checked('enabled'),replaceLost:checked('replaceLost'),budget:val('budget'),reserve:val('reserve'),expand:val('expand'),shrink:val('shrink')};
 else if(action==='defaults')c={action,ship:str('ship'),vehicle:str('vehicle')};
 else if(action==='buyShip')c={action,kind:str('kind')};
 else if(action==='technology')c={action,kind:+f.dataset.kind,value:val('value')};
 else if(action==='citySize')c={action:'cityInvestment',city,size:val('size')};
 else if(action==='production')c={action:'cityInvestment',city,good:+f.dataset.good,value:val('value')};
 else if(action==='roadInvestment')c={action,road:+f.dataset.road,roadBudget:val('roadBudget'),securityBudget:val('securityBudget')};
 else if(action==='renameCompany')c={action:'rename',kind:'company',name:str('name')};
 else if(action==='rename')c={action,kind:f.dataset.kind,id:f.dataset.id,name:str('name')};
 else if(action==='diplomacy')c={action:'diplomacy',nation:+f.dataset.nation,value:val('value')};
 else if(action==='research')c={action,kind:str('kind'),budgets:[0,1,2,3,4].map(i=>val('budget'+i))};
 else if(action==='replace')c={action,...replaceRequest(f)};
 if(c&&await command(c)){document.querySelector('#modal').close();if(action==='openRoute'){draft=null;renderPlanner();await connection(c.stops);}}
 }catch(err){notify(err.message,true);}});
app.addEventListener('change',async e=>{try{const n=e.target.name;
 if(n==='routeCompany'){selectedCompany=+e.target.value;selectedRoute=null;renderPanel();}
 else if(n==='citySort'){citySort=e.target.value;renderPanel();}
 else if(n==='roadSort'){roadSort=e.target.value;renderPanel();}
 else if(n==='investmentSort'){investmentSort=e.target.value;renderPanel();}
 else if(n==='accountPeriod'){accountPeriod=+e.target.value;drawAccounts();}
 else if(n==='speed')speed=+e.target.value;
 else if(n==='language'){setLanguage(e.target.value);document.documentElement.lang=e.target.value;pause();layout();renderPlanner();}
 else if(n==='city')await selectCity(+e.target.value);
 else if(e.target.id==='import-file'){const file=e.target.files[0];e.target.value='';if(file&&confirm(t('loadConfirm'))){pause();accountData=null;accountPeriod=null;view=await rpc({op:'load',text:await file.text()});render(true);notify(t('loaded'));}}
 else if(e.target.closest('[data-form="openRoute"]'))await openingQuote();
 else if(e.target.closest('[data-form="replace"]'))await replaceQuote();
 else if(e.target.closest('[data-form="research"]'))await designQuote();
 }catch(err){notify(err.message,true);}});
app.addEventListener('input',e=>{if(e.target.closest('[data-form="research"]'))void designQuote();else if(e.target.name==='routeFilter'){routeFilter=e.target.value;document.querySelector('#route-results').innerHTML=routeResults();}});
app.addEventListener('focusin',e=>{if(e.target.matches('input,select'))pause();});
let busy=false,last=performance.now();
setInterval(async()=>{const now=performance.now(),ms=now-last;last=now;if(!view||busy||!running||document.hidden)return;busy=true;try{view=await rpc({op:'advance',ms,running,speed});if(player().bankrupt)running=false;render();}catch(e){pause();notify(e.message,true);}finally{busy=false;}},200);
document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden)pause();});
function animate(){map?.animate(running,speed);requestAnimationFrame(animate);}requestAnimationFrame(animate);
app.innerHTML='<p class="loading">Sails & Flags · Loading the world…</p>';
try{const boot=await rpc({op:'boot'});catalog=boot.catalog;view=boot.view;layout();}catch(e){app.textContent='Unable to start: '+e.message;}
