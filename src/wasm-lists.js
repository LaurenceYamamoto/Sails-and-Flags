// Presentation-only ordering: the authoritative entities remain in Wasm.
import {cityName} from './i18n.js';
export const cityLabel=cityName;
const compare=(locale)=>new Intl.Collator(locale,{numeric:true,sensitivity:'base'}).compare;
export function cityOrder(cities,regions,order,locale){
 const cmp=compare(locale),rank=new Map(regions.map((r,i)=>[r.id,i]));
 const region=(a,b)=>(rank.get(cities[a].region)??999)-(rank.get(cities[b].region)??999),nation=(a,b)=>(cities[a].nationOrder??0)-(cities[b].nationOrder??0);
 return (a,b)=>(order==='region'?region(a,b)||nation(a,b):order==='nation'?nation(a,b)||region(a,b):0)||(order!=='name'&&cities[a].order!==undefined?cities[a].order-cities[b].order:0)||cmp(cityLabel(cities[a]),cityLabel(cities[b]))||a-b;
}
export function sortedCities(cities,regions,order,locale){return cities.map((_,i)=>i).sort(cityOrder(cities,regions,order,locale));}
export function roadPair(road,cities,locale){const cmp=cityOrder(cities,[],'name',locale);return [road.a,road.b].sort((a,b)=>cities[a].order!==undefined?cities[a].order-cities[b].order:cmp(a,b));}
export function sortedRoads(rows,roads,cities,regions,order,locale){
 const cmp=cityOrder(cities,regions,order,locale);
 return [...rows].sort((a,b)=>{const x=roadPair(roads[a.index],cities,locale),y=roadPair(roads[b.index],cities,locale);return cmp(x[0],y[0])||cmp(x[1],y[1])||a.index-b.index;});
}
export function visibleRoutes(routes,cities,sort,filter){
 const text=filter.normalize('NFKC').trim().toLowerCase();
 return routes.filter(r=>!text||r.stops.some(i=>cityLabel(cities[i]).normalize('NFKC').toLowerCase().includes(text))).sort((a,b)=>(sort==='profit'?b.profit-a.profit:sort==='fleet'?b.fleet.length-a.fleet.length:a.started-b.started)||a.id-b.id);
}

export function sortedCompanies(companies,nations,rivals){
 const home=c=>c.entryHome??rivals.find(r=>r.id===c.id)?.homeNation??c.homeNation;
 const size=c=>c.entryScale??rivals.find(r=>r.id===c.id)?.initialScale??5000;
 return [...companies].sort((a,b)=>Number(b.id==='player')-Number(a.id==='player')||(nations[home(a)]?.order??999)-(nations[home(b)]?.order??999)||size(b)-size(a)||a.index-b.index);
}
