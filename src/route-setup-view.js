import {shipSpec,shipDaily} from './industry.js';
import { SHIPS } from './data.js';
import { tx, t, nameOf, errorMessage } from './i18n.js';

export function renderOpeningQuote(s,type,q,cash) {
  const shipName=nameOf(shipSpec(s,type));
  if(shipSpec(s,type).mode==='land')return `<p>${q.shipId?tx('未使用の馬車を使用します。','Use an idle wagon.'):tx('開設時に馬車を購入します。','Buy a wagon when opening this route.')}</p><p>${tx('開設時の必要資金','Required cash at opening')}: <b>${cash(q.cost)}</b> · ${tx('開設後の残金','Cash after opening')}: ${cash(q.remaining)}</p>${q.error?`<p class="negative" role="alert">${errorMessage(new Error(q.error))}</p>`:''}<p class="small">${tx('仕入・通行料・維持費は別途必要です。すべての区間に道路と通過国の免許が必要です。','Cargo, tolls and upkeep require additional cash. Every leg needs a road and licenses for its transit nations.')}</p>`;

  return `<p><strong>${q.shipId
    ?tx('未使用の{ship} #{id}を利用します。','Use idle {ship} #{id}.',{ship:shipName,id:q.shipId.split('-')[1]})
    :tx('未使用の{ship}がないため、開設時に1隻購入します。','No idle {ship} is available. Buy one when opening the route.',{ship:shipName})}</strong></p>
    <p>${tx('開設時の必要資金（船購入）','Required cash at opening (ship purchase)')}: <b>${cash(q.cost)}</b><br>${t('cash')}: ${cash(s.cash)} · ${tx('開設後の残金','Cash after opening')}: ${cash(q.remaining)}</p>
    ${q.remaining<0?`<p class="negative">${tx('資金不足','Insufficient cash')}: ${cash(-q.remaining)}</p>`:''}
    ${q.error?`<p class="negative" role="alert">${errorMessage(new Error(q.error))}</p>`:''}
    <p class="small muted">${tx('全寄港地の交易免許を事前に取得してください。積み荷の仕入・日々の維持費は別途必要です。','Obtain licenses for all ports beforehand. Cargo purchases and daily upkeep require additional funds.')}</p>`;
}
