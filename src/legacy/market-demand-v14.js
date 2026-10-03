import {priceRatio} from './engine-v14.js';
import {CITIES} from './data-v14.js';
import {marketFactors} from './industry-v14.js';
import {demandMultiplier} from './security-v14.js';
import {DEMAND_REGIONS,DEMAND_CLIMATES,demandProfile} from './demand-data-v14.js';

const profiles=new Map();
let cachedDay,season;
export function cityDemandProfile(id){
 if(!profiles.has(id))profiles.set(id,Object.freeze(demandProfile(id,CITIES[id])));
 return profiles.get(id);
}
// Smooth annual cycle, January peak in the north; reversed in the south.
// Derive from the game calendar without consuming random numbers or saved state.
export function winterStrength(day){
 if(day!==cachedDay){const date=new Date(Date.UTC(1700,0,1)+day*86400000),year=date.getUTCFullYear(),start=Date.UTC(year,0,1),end=Date.UTC(year+1,0,1);season=Math.cos(2*Math.PI*(date.getTime()-start)/(end-start));cachedDay=day;}
 return season;
}
export function demandModifiers(city,good,day){
 const p=cityDemandProfile(city),climate=DEMAND_CLIMATES[p.climate];
 return {regional:DEMAND_REGIONS[p.region].goods[good]??1,climate:climate.goods[good]??1,season:1+(climate.winter[good]??0)*winterStrength(day)*(p.south?-1:1)};
}
// One shared calculation for daily simulation and the city's displayed estimate.
export function marketFlow(s,city,good,day=s.day){
 const m=s.markets[city][good],development=marketFactors(s,city,good),modifiers=demandModifiers(city,good,day),production=m.production*development.production,available=m.stock+production;
 const war=demandMultiplier(s,CITIES[city].nation,good),priceFactor=Math.max(.25,Math.min(3,1/priceRatio(available)));
 const demand=m.demand*development.demand*modifiers.regional*modifiers.climate*modifiers.season*war;
 const requested=demand*priceFactor,consumption=Math.min(available,requested);
 return {...modifiers,base:m.demand,development:development.demand,war,priceFactor,production,demand,consumption,stock:available-consumption};
}
