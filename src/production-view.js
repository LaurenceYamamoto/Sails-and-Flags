import {CITIES,GOODS} from './data.js';
import {marketFactors} from './industry.js';
import {productionSuitability,totalProductionBudget} from './production-investment.js';
import {tx,t,nameOf,locale} from './i18n.js';

export function renderProductionInvestment(s,city,cash){
 const d=s.world.development[city],number=n=>new Intl.NumberFormat(locale(),{maximumFractionDigits:3}).format(n);
 return `<p class="small muted">${tx('生産予算は品目別の日額です。適性が高いほど成長しやすく、効果は逓減します。基礎生産ゼロの品目は投資対象外です。旧セーブの一括予算は基礎生産量の比率で配分します。','Budgets are daily amounts per commodity. Higher suitability improves growth, with diminishing returns. Zero-production goods cannot receive investment. Old budgets are split by base production.')}</p><div class="production-scroll"><table class="production-investment"><thead><tr><th>${t('product')}</th><th>${tx('生産投資（日額）','Production investment per day')}</th></tr></thead><tbody>${GOODS.map((g,i)=>{const base=CITIES[city].supply[i];return `<tr data-production-good="${g.id}"><th scope="row">${nameOf(g)}<small class="production-metrics">${tx('基礎 / 現在の生産（日量）','Base / current daily production')}<br>${number(base)} / ${number(base*marketFactors(s,city,g.id).production)}<br>${tx('適性 / 開発度','Suitability / development')}<br>${number(productionSuitability(city,g.id)*100)}% / ${number(d.production[g.id])}</small></th><td><input aria-label="${nameOf(g)} ${tx('生産投資（日額）','Production investment per day')}" type="number" name="production-${g.id}" min="0" step="any" value="${d.dailyProduction[g.id]}" required ${!base||s.gameOver?'disabled':''}></td></tr>`;}).join('')}</tbody></table></div><p>${tx('生産投資の設定合計（日額）','Configured daily production total')}: <output data-production-total>${cash(totalProductionBudget(d))}</output></p>`;
}
