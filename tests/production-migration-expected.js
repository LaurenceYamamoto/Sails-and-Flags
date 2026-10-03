import {CITIES,GOODS} from '../src/data.js';
// Expected intentional v15 differences; all other legacy fields remain comparable.
export function productionExpected(old){const s=structuredClone(old);
 for(const [city,market]of Object.entries(s.markets??{}))if(CITIES[city])for(const g of GOODS)if(market[g.id])market[g.id].production=CITIES[city].supply[GOODS.indexOf(g)];
 for(const [city,d]of Object.entries(s.world?.development??{}))if(CITIES[city]){
  const level=d.production,budget=d.dailyProduction,total=CITIES[city].supply.reduce((a,b)=>a+b,0);
  d.production=Object.fromEntries(GOODS.map(g=>[g.id,level]));
  d.dailyProduction=Object.fromEntries(GOODS.map((g,i)=>[g.id,budget*(CITIES[city].supply[i]/total)]));
 }return s;}
