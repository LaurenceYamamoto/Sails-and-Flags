export * from '../src/engine.js';
import {createGame as newCompany,buyLicense} from '../src/engine.js';
// Established-company fixture: purchase access before exercising English-port systems.
// New-company behavior is tested against the real engine in license-balance.test.js.
export function createGame(seed=1700,options){const s=newCompany(seed,options);buyLicense(s,'england');return s;}
