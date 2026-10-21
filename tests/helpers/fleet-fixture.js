import {postFixture} from '../post-fixture.js';
export function fleetFixture(core,{routes=12,shipsPerRoute=24,events=true}={}){
  core({op:'command',command:{action:'new',seed:1700,events}});
  const catalog=core({op:'catalog'}),london=catalog.cities.findIndex(c=>c.id==='london');
  let game=JSON.parse(core({op:'save'}));
  const co=game.companies[0];co.cash=co.initial_cash=1e10;
  co.licenses=catalog.nations.map((_,i)=>i);co.technology.fill(60);
  co.posts[london]=postFixture(catalog.goods.length);
  core({op:'load',text:JSON.stringify(game)});
  let count=0;
  for(let i=0;i<catalog.cities.length&&count<routes;i++){
    if(i===london)continue;
    try{
      core({op:'command',command:{action:'openRoute',kind:'galleon',stops:[london,i],allowed:catalog.goods.map((_,g)=>g)}});
      count++;
    }catch{/* Out-of-range/inland cities are not route candidates. */}
  }
  if(count!==routes)throw Error('Not enough eligible fixture routes');
  game=JSON.parse(core({op:'save'}));
  for(const ship of [...game.companies[0].ships]){
    for(let i=1;i<shipsPerRoute;i++)game.companies[0].ships.push({...structuredClone(ship),id:game.next_id++});
  }
  core({op:'load',text:JSON.stringify(game)});
  return core({op:'save'});
}
