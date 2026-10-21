import {postFixture} from '../post-fixture.js';
export function warehouseFixture(core,base){
 const game=JSON.parse(base),catalog=core({op:'catalog'}),co=game.companies[0];
 const london=catalog.cities.findIndex(c=>c.id==='london');
 const destination=co.routes.find(r=>r.stops.includes(london)).stops.find(i=>i!==london);
 for(const city of [london,destination]){
  const p=co.posts[city]??=postFixture(catalog.goods.length);
  p.warehouse=10;p.handling=2;
  p.stock=catalog.goods.map((g,good)=>({good,quantity:20,cost:20*g.base,from:null}));
 }
 co.facility_policy.warehouse_up={enabled:true,percent:90,days:1};
 co.facility_policy.warehouse_down={enabled:true,percent:50,days:1};
 co.facility_policy.handling_up={enabled:true,percent:100,days:1};
 core({op:'load',text:JSON.stringify(game)});
 return core({op:'save'});
}
