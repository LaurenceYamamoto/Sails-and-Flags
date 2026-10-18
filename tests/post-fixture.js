import {bridge} from '../src/wasm-bridge.js';
export const postFixture=goods=>({level:1,basis:0,warehouse:0,handling:0,handled:0,handling_demand:0,monitoring:Array.from({length:2},()=>({up:0,down:0,sampled:null,changed:null,expansion_pending:false})),stock:[],rules:Array.from({length:goods},()=>({buy_below:10,sell_above:10,buy:true,sell:true})),size_budget:0,production_budget:Array(goods).fill(0)});

// Geography tests exercise every road, including consumer-to-consumer pairs
// which may legitimately stay idle under the new base-price conditions.
export function exerciseRoutesWithPriceFixture(engine,world){
 for(let day=0;day<180;day++){
  const g=engine.save(),co=g.companies[0],waiting=co.routes.filter(r=>!r.deliveries);
  if(!waiting.length)return;
  for(const r of waiting){const ship=co.ships.find(s=>s.route===r.id);const good=co.routes.indexOf(r)%world.goods.length;
   r.allowed=[good];r.buy_below=0;r.sell_above=0;
   const from=r.stops[ship.next],to=r.stops[1-ship.next];
   g.markets[from*world.goods.length+good].stock=2000;g.markets[to*world.goods.length+good].stock=0;
  }
  engine.load(g);engine.cmd({action:'tick',days:1});
 }
}

// Existing 3.x routing/geometry regression tests start with an established,
// empty post, as migrated routes do. New 4.x post tests use the raw bridge and
// exercise construction costs, missing posts and price rules explicitly.
export function bridgeWithPosts(instance){
 const call=bridge(instance);
 return request=>{
  if(request.op==='load'){
   const g=JSON.parse(request.text);
   // Historical migration fixtures may add retired routes by hand. Give those
   // fixtures the established post now required by their company route data.
   if(g.post_version===1&&(g.city_version<30||g.route_pair_version===0)){
    for(const co of g.companies)for(const r of co.routes)if(g.route_pair_version===0||!r.stops.some(i=>co.posts[i]))for(const city of (g.route_pair_version===0?r.stops:[r.stops[0]]))co.posts[city]??=postFixture(g.development[0].production.length);
    request={...request,text:JSON.stringify(g)};
   }
  }
  const c=request.command;
  if(request.op==='command'&&c?.action==='openRoute'&&c.stops?.length===2){
   let quote;try{quote=call({op:'query',request:{query:'opening',kind:c.kind,stops:c.stops}});}catch{return call(request);}
   if(quote.affordable&&!quote.missing.length){
    const g=JSON.parse(call({op:'save'})),co=g.companies[0];
    if(g.post_version===1&&!c.stops.some(i=>co.posts[i])){
     co.posts[c.stops[0]]=postFixture(g.development[0].production.length);
     call({op:'load',text:JSON.stringify(g)});
    }
   }
   if(c.margin>=1000)return call({...request,command:{...c,buyBelow:95,sellAbove:1000}});
  }
  return call(request);
 };
}
