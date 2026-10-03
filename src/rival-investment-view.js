import {CITIES} from './data.js';
import {ROADS} from './land-data.js';
import {industryDaily} from './industry.js';
import {rivalInvestmentBudget} from './rival-investment.js';
import {tx,t,nameOf,locale} from './i18n.js';

export function renderRivalInvestment(s,{cash}){
 const daily=industryDaily(s),number=v=>new Intl.NumberFormat(locale(),{maximumFractionDigits:2}).format(v);
 const cities=Object.entries(s.world.development).filter(([,d])=>d.owner===s.industry.id);
 const roads=Object.entries(s.world.roads).filter(([,d])=>d.owner===s.industry.id);
 return `<details id="rival-investment-${s.industry.id}" class="rival-investment"><summary>${tx('競合の投資','Competitor investment')} · ${cash(daily)} ${t('daily')}</summary><p class="small muted">${tx('交易の実績利益から投資します。運転資金が不足すると投資を縮小・停止し、毎月見直します。','Investments use realized trading profits. Spending is reduced or paused when operating reserves are low and reviewed monthly.')}</p><p class="small">${tx('投資判断の保有資金目安','Cash reserve for investment')}: ${cash(rivalInvestmentBudget(s).reserve)}</p><dl class="small"><dt>${tx('航海技術','Seafaring technology')}</dt><dd>${number(s.industry.technology.seafaring)} · ${cash(s.industry.investment.seafaring)} ${t('daily')}</dd><dt>${tx('陸上輸送技術','Land transport technology')}</dt><dd>${number(s.industry.technology.land)} · ${cash(s.industry.investment.land)} ${t('daily')}</dd></dl><p class="small">${tx('開発権と日額投資','Development rights and daily investment')}</p><ul class="small">${cities.map(([id,d])=>`<li>${nameOf(CITIES[id])} · ${tx('都市規模','City size')} ${cash(d.dailySize)} / ${tx('生産力','Production')} ${cash(d.dailyProduction)}</li>`).join('')}${roads.map(([id,d])=>`<li>${nameOf(CITIES[ROADS[id].a])} — ${nameOf(CITIES[ROADS[id].b])} · ${tx('道路整備','Road improvements')} ${cash(d.dailyRoad)} / ${tx('治安','Security')} ${cash(d.dailySecurity)}</li>`).join('')}${!cities.length&&!roads.length?`<li>${tx('開発権は未取得です。','No development rights acquired.')}</li>`:''}</ul></details>`;
}
