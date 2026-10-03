import {WAGONS} from './land-data.js';
import {canServe} from './land.js';
import {routeLegs} from './engine.js';
import {sailingDays,shipDaily} from './industry.js';
import {tx,t,nameOf} from './i18n.js';
export function renderTransportComparison(s,stops,selected,cash){
 const route={mode:'land',stops};
 return `<div class="table-wrap transport-comparison"><table><caption>${tx('陸上輸送の比較（現在の道路整備度）','Compare land transports (current road quality)')}</caption><thead><tr><th>${tx('輸送手段','Transport mode')}</th><th>${t('capacity')}</th><th>${tx('一周','Cycle')}</th><th>${t('upkeep')}</th></tr></thead><tbody>${Object.entries(WAGONS).map(([id,v])=>{const days=canServe(s,id,route)?routeLegs(route).reduce((sum,[a,b])=>sum+sailingDays(s,id,a,b)+1,0):null;return `<tr ${id===selected?'class="chosen-transport"':''}><td>${id===selected?'✓ ':''}${nameOf(v)}</td><td>${v.capacity}</td><td>${days===null?'—':days+' '+t('dayUnit')}</td><td>${days===null?'—':cash(shipDaily(s,id)*days)}</td></tr>`;}).join('')}</tbody></table><p class="small muted">${tx('馬車は整備された平地、ラクダは乾燥地域、ラバは山地・悪路向けです。比較日数は各都市1日の停車を含み、採算待ち・襲撃・混成隊の待機は含みません。','Wagons favor improved plains, camels dry corridors, and mules mountains and rough roads. Times include one day per stop but exclude profit waits, attacks and mixed-fleet spacing.')}</p></div>`;
}
