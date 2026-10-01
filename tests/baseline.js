import {createGame as current} from '../src/engine.js';
export function createGame(seed=1700){return current(seed,{events:false});}
