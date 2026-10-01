import { SHIPS } from './data.js';
import { tx, t, nameOf, errorMessage } from './i18n.js';

export function renderOpeningQuote(s,type,q,cash) {
  const shipName=nameOf(SHIPS[type]);
  return `<p><strong>${q.shipId
    ?tx(`未使用の${shipName} #${q.shipId.split('-')[1]}を利用します。`,`Use idle ${shipName} #${q.shipId.split('-')[1]}.`)
    :tx(`未使用の${shipName}がないため、開設時に1隻購入します。`,`No idle ${shipName} is available. Buy one when opening the route.`)}</strong></p>
    <p>${tx('開設時の必要資金（船購入）','Required cash at opening (ship purchase)')}: <b>${cash(q.cost)}</b><br>${t('cash')}: ${cash(s.cash)} · ${tx('開設後の残金','Cash after opening')}: ${cash(q.remaining)}</p>
    ${q.remaining<0?`<p class="negative">${tx('資金不足','Insufficient cash')}: ${cash(-q.remaining)}</p>`:''}
    ${q.error?`<p class="negative" role="alert">${errorMessage(new Error(q.error))}</p>`:''}
    <p class="small muted">${tx('全寄港地の交易免許を事前に取得してください。積み荷の仕入・日々の維持費は別途必要です。','Obtain licenses for all ports beforehand. Cargo purchases and daily upkeep require additional funds.')}</p>`;
}
