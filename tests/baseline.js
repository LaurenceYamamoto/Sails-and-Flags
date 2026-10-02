import {createGame as current} from '../src/engine.js';
export function createGame(seed=1700){return current(seed,{events:false});}

// Saved voyages retain their old timing; only migration provenance is additive.
export const withoutSeaVersion=value=>JSON.parse(JSON.stringify(value,(key,v)=>key==='seaDistanceVersion'?undefined:v));
