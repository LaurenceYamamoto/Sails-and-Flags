import {CITIES,GOODS} from './data.js';
export const productionMap=(value=0)=>Object.fromEntries(GOODS.map(g=>[g.id,value]));
export const totalProductionBudget=d=>Object.values(d.dailyProduction).reduce((a,b)=>a+b,0);
export const productionDevelopment=d=>Object.values(d.production).reduce((a,b)=>a+b/GOODS.length,0);
export function productionSuitability(city,good){
 const c=CITIES[city],index=GOODS.findIndex(g=>g.id===good);
 return c.supply[index]/Math.max(1,...c.supply);
}
// Used only to allocate old aggregate budgets during migration.
export function splitProductionBudget(city,budget){
 const c=CITIES[city],sum=c.supply.reduce((a,b)=>a+b,0);
 return Object.fromEntries(GOODS.map((g,i)=>[g.id,sum?budget*(c.supply[i]/sum):0]));
}
