// Presentation-only ordering: the authoritative entities remain in Wasm.
export const cityLabel=c=>c.mapName??c.nameEn??c.id;
const compare=(locale)=>new Intl.Collator(locale,{numeric:true,sensitivity:'base'}).compare;
export function cityOrder(cities,regions,order,locale){
 const cmp=compare(locale),rank=new Map(regions.map((r,i)=>[r.id,i]));
 return (a,b)=>(order==='region'?(rank.get(cities[a].region)??999)-(rank.get(cities[b].region)??999):0)||cmp(cityLabel(cities[a]),cityLabel(cities[b]))||a-b;
}
export function sortedCities(cities,regions,order,locale){return cities.map((_,i)=>i).sort(cityOrder(cities,regions,order,locale));}
export function roadPair(road,cities,locale){const cmp=cityOrder(cities,[],'name',locale);return [road.a,road.b].sort(cmp);}
export function sortedRoads(rows,roads,cities,regions,order,locale){
 const cmp=cityOrder(cities,regions,order,locale),byName=cityOrder(cities,regions,'name',locale);
 return [...rows].sort((a,b)=>{const x=roadPair(roads[a.index],cities,locale),y=roadPair(roads[b.index],cities,locale);return cmp(x[0],y[0])||byName(x[1],y[1])||a.index-b.index;});
}
export function visibleRoutes(routes,cities,sort,filter){
 const text=filter.normalize('NFKC').trim().toLowerCase();
 return routes.filter(r=>!text||r.stops.some(i=>cityLabel(cities[i]).normalize('NFKC').toLowerCase().includes(text))).sort((a,b)=>(sort==='profit'?b.profit-a.profit:sort==='fleet'?b.fleet.length-a.fleet.length:a.started-b.started)||a.id-b.id);
}
