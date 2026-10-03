import {price} from './engine.js';
import {GOODS} from './data.js';
import {cityDemandProfile,marketFlow} from './market-demand.js';
import {DEMAND_REGIONS,DEMAND_CLIMATES} from './demand-data.js';
import {tx,t,nameOf,locale} from './i18n.js';

export function renderMarketDemand(s,city,{decimal,money}){
 const profile=cityDemandProfile(city),flows=GOODS.map(g=>({g,f:marketFlow(s,city,g.id)})),number=new Intl.NumberFormat(locale(),{maximumFractionDigits:2}),factor=n=>'×'+number.format(n);
 return `<p class="market-profile">${tx('需要特性','Demand profile')}: ${tx(...DEMAND_REGIONS[profile.region].label)} · ${tx(...DEMAND_CLIMATES[profile.climate].label)}</p>
 <div class="table-wrap"><table><thead><tr><th>${t('product')}</th><th>${t('price')}</th><th>${t('stock')}</th><th>${t('production')}</th><th>${tx('消費見込 / 日','Expected consumption / day')}</th></tr></thead><tbody>${flows.map(({g,f})=>`<tr data-market-good="${g.id}"><td><span class="good-icon ${g.id}"></span>${nameOf(g)}</td><td>${decimal(price(g.id,s.markets[city][g.id].stock))}</td><td>${money(s.markets[city][g.id].stock)}</td><td class="positive">+${decimal(f.production)}</td><td>${decimal(f.consumption)}</td></tr>`).join('')}</tbody></table></div>
 <p class="small muted">${tx('消費見込は現在日の生産後在庫と価格で計算し、在庫不足分は含みません。次の日の季節・開発・戦争や売買により変わります。','Consumption uses current-day stock after production and its price, capped by available stock. Tomorrow’s season, development, wars and trades can change it.')}</p>
 <details id="demand-details"><summary>${tx('需要の内訳','Demand breakdown')}</summary><p class="small muted">${tx('基準需要に地域嗜好・気候・季節・都市規模・戦争・価格の倍率を掛けます。北半球と南半球では季節が逆転します。数値はゲーム用の近似です。','Base demand is multiplied by regional preferences, climate, season, city size, war and price. Seasons reverse between hemispheres. Values are gameplay approximations.')}</p><div class="table-wrap"><table class="demand-breakdown"><thead><tr>${[t('product'),tx('基準','Base'),tx('地域嗜好','Regional preference'),tx('気候','Climate'),tx('季節','Season'),tx('都市規模','City size'),tx('戦争','War'),tx('価格反応','Price response')].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${flows.map(({g,f})=>`<tr><td>${nameOf(g)}</td><td>${decimal(f.base)}</td>${['regional','climate','season','development','war','priceFactor'].map(k=>`<td>${factor(f[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
