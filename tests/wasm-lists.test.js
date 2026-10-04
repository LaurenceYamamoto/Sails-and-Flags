import test from 'node:test';
import assert from 'node:assert/strict';
import {sortedCities,roadPair,sortedRoads,visibleRoutes} from '../src/wasm-lists.js';
import {accountCharts} from '../src/wasm-charts.js';
const cities=[{mapName:'Surat',region:'asia'},{mapName:'Ahmedabad',region:'asia'},{mapName:'London',region:'europe'},{mapName:'San Juan',region:'americas'}];
const regions=[{id:'europe'},{id:'asia'},{id:'americas'}];
test('city and road display orders use geographic groups and canonical name pairs',()=>{
 assert.deepEqual(sortedCities(cities,regions,'name','en'),[1,2,3,0]);
 assert.deepEqual(sortedCities(cities,regions,'region','en'),[2,1,0,3]);
 const roads=[{a:0,b:1},{a:3,b:2},{a:0,b:2}];assert.deepEqual(roadPair(roads[0],cities,'en'),[1,0]);
 const rows=roads.map((_,index)=>({index}));
 assert.deepEqual(sortedRoads(rows,roads,cities,regions,'name','en').map(r=>r.index),[0,1,2]);
 assert.deepEqual(sortedRoads(rows,roads,cities,regions,'region','en').map(r=>r.index),[1,2,0]);
});
test('route sorting is descending for profit and fleet, ascending for opening; filtering is partial and case-insensitive',()=>{
 const routes=[{id:1,started:2,profit:50,fleet:[1],stops:[0,1]},{id:2,started:1,profit:100,fleet:[2,3],stops:[2,3]},{id:3,started:1,profit:-5,fleet:[4,5,6],stops:[0,3]}];
 const ids=(sort,filter='')=>visibleRoutes(routes,cities,sort,filter).map(r=>r.id);
 assert.deepEqual(ids('profit'),[2,1,3]);assert.deepEqual(ids('fleet'),[3,2,1]);assert.deepEqual(ids('opened'),[2,3,1]);
 assert.deepEqual(ids('profit','SAN'),[2,3]);assert.deepEqual(ids('profit',' meda '),[1]);assert.deepEqual(ids('fleet','absent'),[]);assert.equal(routes[0].id,1);
});

test('charts show only supplied periods, handle empty history and use monthly or annual labels',()=>{
 const options={money:String,tx:(_ja,en)=>en};
 assert.equal(accountCharts([],options),'');
 const period={sales:100,totalExpense:60,assets:5000};
 const months=[{...period,year:1990,month:2},{...period,year:1990,month:3},{...period,year:2000,month:1}];
 const html=accountCharts(months,options);
 assert.match(html,/1990-02/);assert.match(html,/2000-01/);assert.doesNotMatch(html,/1989|2000-02|NaN|Infinity/);
 assert.equal((html.match(/<circle /g)??[]).length,9); // Three series, three real periods; gaps aren't fabricated.
 const annual=accountCharts([{...period,year:1701,month:null},{...period,year:2000,month:null}],options);
 assert.match(annual,/>1701<\/text>/);assert.match(annual,/>2000<\/text>/);assert.doesNotMatch(annual,/1701-01/);
 assert.doesNotMatch(accountCharts([{...period,year:2000,month:1}],options),/NaN|Infinity/);
});
