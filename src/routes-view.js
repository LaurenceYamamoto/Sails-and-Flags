import { CITIES, GOODS, SHIPS, distance } from './data.js';
import { routeShips, routeSchedule, nextDeparture } from './engine.js';
import { t } from './i18n.js';

export function renderRoutes(state, { decimal, cash, signed, tone }) {
  if (!state.routes.length) return `<div class="empty-state"><span>⚓</span><p>${t('noRoute')}</p></div>`;
  return state.routes.map(route => {
    const fleet = routeShips(state, route);
    const { cycle, interval } = routeSchedule(state, route);
    const available = state.ships.filter(ship => !ship.routeId && distance(route.a, route.b) <= SHIPS[ship.type].range);
    const title = `${CITIES[route.a].name} ⇄ ${CITIES[route.b].name}`;
    const shipRows = fleet.map(ship => {
      const voyage = ship.voyage;
      const departure = nextDeparture(state, route, ship);
      const name = `${SHIPS[ship.type].name} #${ship.id.split('-')[1]}`;
      const status = voyage
        ? `${CITIES[voyage.to].name}へ · あと${voyage.remaining}日${!route.active ? ' · 到着後に停止' : ''}`
        : !route.active ? t('stopped') : ship.status === 'waiting' ? t('wait') : '出港間隔を調整中';
      const next = departure === null ? '' : `${CITIES[voyage?.to ?? ship.nextFrom].name}発：${departure}日目（あと${departure - state.day}日）`;
      return `<li class="fleet-row">
        <div class="section-top"><strong>${name}</strong><button data-action="release-ship" data-id="${ship.id}" aria-label="${name}をルートから外す" ${voyage || state.gameOver ? 'disabled' : ''}>配置解除</button></div>
        <p class="small">${status}</p><p class="small muted">${next}</p>
        <div class="progress"><span data-voyage-progress="${ship.id}" style="width:${voyage ? 100 * (voyage.total - voyage.remaining) / voyage.total : 0}%"></span></div>
        <p class="small">${t('cargo')}：${ship.cargo.length ? ship.cargo.map(c => `${GOODS.find(g => g.id === c.good).name} ${c.quantity}`).join(' / ') : t('noCargo')}</p>
      </li>`;
    }).join('');
    return `<article class="route-card" aria-label="${title}">
      <div class="section-top"><h3>${title}</h3><span class="badge ${route.active ? 'live' : ''}">${route.active ? '運航中' : '停止予約・停止'}</span></div>
      <p class="small muted">配置 ${fleet.length}隻 · 総積載量 ${fleet.reduce((sum, ship) => sum + SHIPS[ship.type].capacity, 0)} · 各港から約${decimal(interval)}日間隔</p>
      <div class="route-stats">
        <div><span>${t('profit')}</span><strong class="${tone(route.profit)}">${signed(route.profit)}</strong></div>
        <div><span>${t('perDay')}</span><strong class="${tone(route.profit)}">${signed(route.profit / Math.max(1, state.day - route.started))}</strong></div>
        <div><span>配船周期</span><strong>${cycle}日</strong></div>
        <div><span>累計利益率</span><strong class="${tone(route.profit)}">${route.expenses > 0 ? decimal(route.profit / route.expenses * 100) + '%' : '—'}</strong></div>
      </div>
      <div class="forecast"><span>${t('forecast')} <b class="${tone(route.lastForecast)}">${signed(route.lastForecast)}</b></span><span>${t('actual')} <b class="${tone(route.lastActual || 0)}">${route.lastActual === null ? t('notArrived') : signed(route.lastActual)}</b></span></div>
      <p class="small muted">共通の積載条件：最低価格差 ${route.minMargin}% · ${route.allowed.map(id => GOODS.find(g => g.id === id).name).join('・')} · 到着合計 ${route.deliveries}回</p>
      <div class="buttons"><button data-action="toggle" data-id="${route.id}" ${state.gameOver ? 'disabled' : ''}>${route.active ? t('stop') : t('resume')}</button><button data-action="edit" data-id="${route.id}" ${state.gameOver ? 'disabled' : ''}>${t('edit')}</button><button data-action="release" data-id="${route.id}" ${fleet.some(ship => ship.voyage) || state.gameOver ? 'disabled' : ''}>ルートを解除</button></div>
      <form class="assign-form" id="assign-${route.id}" data-route="${route.id}">
        <label>未使用船を追加<select name="ship" aria-label="${title}に追加する船" required ${available.length ? '' : 'disabled'}>${available.length ? available.map(ship => `<option value="${ship.id}">${SHIPS[ship.type].name} #${ship.id.split('-')[1]}</option>`).join('') : '<option value="">配置可能な未使用船がありません</option>'}</select></label>
        <button ${available.length && !state.gameOver ? '' : 'disabled'}>このルートに船を追加</button>
      </form>
      <ul class="fleet-list">${shipRows}</ul>
      <p class="small muted">船の増減・再開時に時刻表を再調整。航行中の船はそのまま到着します。速い船は出港まで待機し、商機のない便は見送ります。船の維持費合計 ${cash(fleet.reduce((sum, ship) => sum + SHIPS[ship.type].daily, 0))} / 日。</p>
    </article>`;
  }).join('');
}
