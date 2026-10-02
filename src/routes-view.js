import {canServe} from './land.js';
import {renderLandRoute} from './land-view.js';
import {shipName,escapeName} from './identity.js';
import {shipSpec,shipDaily} from './industry.js';
import { CITIES, GOODS, SHIPS, distance } from './data.js';
import { routeShips, routeSchedule, nextDeparture, routeLegs } from './engine.js';
import { t, tx, nameOf as name } from './i18n.js';
import { routeAutomation } from './management-view.js';
import {routeProtection} from './security-view.js';
export const routeTitle = route => route.stops.map(id => name(CITIES[id])).join(route.stops.length === 2 ? ' ⇄ ' : ' → ');
export function renderRoutes(state, { decimal, cash, signed, tone }) {
  if (!state.routes.length) return `<div class="empty-state"><span>⚓</span><p>${t('noRoute')}</p></div>`;
  return state.routes.map(route => {
    if(route.mode==='land')return renderLandRoute(state,route,{decimal,cash,signed,tone});
    const fleet = routeShips(state, route), { cycle, interval } = routeSchedule(state, route);
    const available = state.ships.filter(ship => !ship.routeId && canServe(state,ship.type,route));
    const title = routeTitle(route);
    const shipRows = fleet.map(ship => {
      const voyage = ship.voyage, departure = nextDeparture(state, route, ship);
      const label = `${escapeName(shipName(state,ship))} · ${name(shipSpec(state,ship.type))} #${ship.id.split('-')[1]}`;
      const status = voyage ? `${name(CITIES[voyage.to])} · ${voyage.remaining} ${t('dayUnit')}${!route.active ? ' · '+t('stopping') : ''}` : !route.active ? t('stopped') : ship.status === 'waiting' ? t('wait') : tx('出港間隔を調整中','Waiting for departure slot');
      const next = departure === null ? '' : `${name(CITIES[voyage?.to ?? ship.nextFrom])} · ${tx('出港','Departure')}: ${tx('経過','Day')} ${departure} (+${departure-state.day})`;
      return `<li class="fleet-row"><div class="section-top"><strong>${label}</strong><button data-action="rename-ship" data-id="${ship.id}">${tx('船名を変更','Rename ship')}</button><button data-action="release-ship" data-id="${ship.id}" aria-label="${label} · ${t('release')}" ${voyage || state.gameOver ? 'disabled' : ''}>${t('release')}</button></div><p class="small">${status}</p><p class="small muted">${next}</p><div class="progress"><span data-voyage-progress="${ship.id}" style="width:${voyage ? 100*(voyage.total-voyage.remaining)/voyage.total : 0}%"></span></div><p class="small">${t('cargo')}: ${ship.cargo.length ? ship.cargo.map(c=>`${name(GOODS.find(g=>g.id===c.good))} ${c.quantity}`).join(' / ') : t('noCargo')}</p></li>`;
    }).join('');
    return `<article class="route-card" aria-label="${title}"><div class="section-top"><h3>${title}${route.stops.length>2 ? ' ↻' : ''}</h3><span class="badge ${route.active?'live':''}">${route.active?tx('運航中','Active'):t('stopped')}</span></div>
      <p class="small muted">${fleet.length} ${t('ships')} · ${t('capacity')} ${fleet.reduce((n,v)=>n+shipSpec(state,v.type).capacity,0)} · ${tx('各港から約','Departure interval: about')} ${decimal(interval)} ${t('dayUnit')}</p>
      <div class="route-stats"><div><span>${t('profit')}</span><strong class="${tone(route.profit)}">${signed(route.profit)}</strong></div><div><span>${t('perDay')}</span><strong class="${tone(route.profit)}">${signed(route.profit/Math.max(1,state.day-route.started))}</strong></div><div><span>${tx('配船周期','Service cycle')}</span><strong>${cycle} ${t('dayUnit')}</strong></div><div><span>${tx('累計利益率','Profit / expenses')}</span><strong>${route.expenses?decimal(route.profit/route.expenses*100)+'%':'—'}</strong></div></div>
      <p class="small muted">${tx('区間ごとの海上距離','Sea distance per leg')}: ${routeLegs(route).map(([a,b])=>`${name(CITIES[a])} → ${name(CITIES[b])} ${decimal(distance(a,b))} nm`).join(' / ')}</p>
      ${route.rangeReview?`<p class="warning" role="status">${tx('海上経路の修正により航続距離が不足する船種があります。航行中の船は到着予定を維持します。配置船・自動増減船種・補充待ちを見直してから運航を再開してください。','Sea routes now follow navigable water. Some ship types lack the required range. Ships at sea keep their arrival dates. Review assigned ships, automation type and pending replacements before resuming.')}</p>`:''}${routeAutomation(route,state,decimal)}${routeProtection(state,route,{cash,decimal})}<div class="forecast"><span>${t('forecast')} <b class="${tone(route.lastForecast)}">${signed(route.lastForecast)}</b></span><span>${t('actual')} <b class="${tone(route.lastActual||0)}">${route.lastActual===null?t('notArrived'):signed(route.lastActual)}</b></span></div>
      ${route.lastActual < 0 ? `<p class="warning" role="status">${tx('直近の航海で赤字が発生しました。市場価格と積載条件を確認してください。','The latest voyage made a loss. Check market prices and cargo policy.')}</p>`:''}
      <p class="small muted">${t('margin')}: ${route.minMargin}% · ${route.allowed.map(id=>name(GOODS.find(g=>g.id===id))).join(' / ')} · ${tx('到着合計','Arrivals')} ${route.deliveries}</p>
      <div class="buttons"><button data-action="toggle" data-id="${route.id}" ${state.gameOver?'disabled':''}>${route.active?t('stop'):t('resume')}</button><button data-action="replace-route" data-id="${route.id}" ${state.gameOver?'disabled':''}>${tx('全船を置換','Replace all ships')}</button><button data-action="edit" data-id="${route.id}" ${state.gameOver?'disabled':''}>${t('edit')}</button><button data-action="release" data-id="${route.id}" ${fleet.some(v=>v.voyage)||state.gameOver?'disabled':''}>${tx('ルートを解除','Remove route')}</button></div>
      <form class="assign-form" id="assign-${route.id}" data-route="${route.id}"><label>${tx('未使用船を追加','Add an idle ship')}<select name="ship" aria-label="${title} · ${t('ships')}" required ${available.length?'':'disabled'}>${available.length?available.map(v=>`<option value="${v.id}">${escapeName(shipName(state,v))} · ${name(shipSpec(state,v.type))} #${v.id.split('-')[1]}</option>`).join(''):`<option value="">${t('noShip')}</option>`}</select></label><button ${available.length&&!state.gameOver?'':'disabled'}>${tx('このルートに船を追加','Add ship to route')}</button></form>
      <ul class="fleet-list">${shipRows}</ul><p class="small muted">${tx('増減・再開時に出港間隔を調整します。各港で全量売却し、翌日以降に次区間向けに再購入します。商機のない便は見送ります。','Fleet changes and resuming service rebalance departure slots. All cargo is sold at each port; the next leg purchases a new load on a later day. Unprofitable departures may be skipped.')} ${t('upkeep')} ${cash(fleet.reduce((n,v)=>n+shipDaily(state,v.type),0))} ${t('daily')}</p></article>`;
  }).join('');
}
