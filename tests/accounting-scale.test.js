import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,entry,serialize,deserialize} from '../src/engine.js';

test('large balances survive accumulated sub-unit floating-point drift without rewriting money or accepting material discrepancies',()=>{
 const s=createGame();entry(s,'sale',100000000);
 for(let i=0;i<500000;i++)entry(s,'upkeep',-.01);
 const balance=s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0);
 assert.ok(Math.abs(s.cash-balance)>.001,'reproduce the old fixed-threshold failure');
 assert.deepEqual(deserialize(serialize(s)),s);
 const corrupt=JSON.parse(serialize(s));corrupt.cash+=1;assert.throws(()=>deserialize(JSON.stringify(corrupt)),/会計残高/);
 const small=createGame();small.cash+=.01;assert.throws(()=>deserialize(serialize(small)),/会計残高/);
});
