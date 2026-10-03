import { serialize, deserialize } from './engine.js';
export const SAVE_KEYS = {
  manual: 'sails-and-flags.save.v13', auto: 'sails-and-flags.auto.v13',
  backup: 'sails-and-flags.backup.v13', v12:'sails-and-flags.save.v12',autoV12:'sails-and-flags.auto.v12',backupV12:'sails-and-flags.backup.v12', v11:'sails-and-flags.save.v11',autoV11:'sails-and-flags.auto.v11',backupV11:'sails-and-flags.backup.v11', v10:'sails-and-flags.save.v10',autoV10:'sails-and-flags.auto.v10',backupV10:'sails-and-flags.backup.v10', v9:'sails-and-flags.save.v9',autoV9:'sails-and-flags.auto.v9',backupV9:'sails-and-flags.backup.v9', v8:'sails-and-flags.save.v8',autoV8:'sails-and-flags.auto.v8',backupV8:'sails-and-flags.backup.v8', v7:'sails-and-flags.save.v7',autoV7:'sails-and-flags.auto.v7',backupV7:'sails-and-flags.backup.v7',v6:'sails-and-flags.save.v6', autoV6:'sails-and-flags.auto.v6', backupV6:'sails-and-flags.backup.v6', v5:'sails-and-flags.save.v5', autoV5:'sails-and-flags.auto.v5', backupV5:'sails-and-flags.backup.v5', v4:'sails-and-flags.save.v4', autoV4:'sails-and-flags.auto.v4', backupV4:'sails-and-flags.backup.v4', v3:'sails-and-flags.save.v3', autoV3:'sails-and-flags.auto.v3', backupV3:'sails-and-flags.backup.v3', v2: 'sails-and-flags.save.v2', v1: 'sails-and-flags.save.v1',
  preserved: 'sails-and-flags.preserved.crossings',preservedContinents:'sails-and-flags.preserved.continents',preservedWorld:'sails-and-flags.preserved.world',preservedRegion:'sails-and-flags.preserved.p8-ligurian',preservedSea:'sails-and-flags.preserved.sea-routing',preservedCities:'sails-and-flags.preserved.p7-cities', preservedP7:'sails-and-flags.preserved.p7', preservedP6:'sails-and-flags.preserved.p6',
};
// Validate before overwriting a slot. A failed write leaves the last save intact.
export function saveGame(storage, state, slot = 'manual') {
  if (!['manual','auto'].includes(slot)) throw new Error('Invalid save slot');
  const raw = serialize(state);
  deserialize(raw);
  // Preserve the furthest valid pre-existing save once for this release.
  // Unlike the rotating backup, this slot is never overwritten by later play.
  // Keep the original JSON, including its old format, for migration recovery.
  if (storage.getItem(SAVE_KEYS.preserved) === null) {
    const candidate = listSaves(storage).filter(s=>s.valid&&s.slot!=='preserved').sort((a,b)=>b.day-a.day)[0];
    if(candidate) storage.setItem(SAVE_KEYS.preserved,storage.getItem(SAVE_KEYS[candidate.slot]));
  }
  const previous = storage.getItem(SAVE_KEYS[slot]);
  if (previous) {
    let valid = false;
    try { deserialize(previous); valid = true; } catch { /* Never back up corrupt data. */ }
    if (valid) storage.setItem(SAVE_KEYS.backup, previous);
  }
  storage.setItem(SAVE_KEYS[slot], raw);
}
export function listSaves(storage) {
  return Object.entries(SAVE_KEYS).flatMap(([slot,key]) => {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    try { const state = deserialize(raw); return [{slot,state,day:state.day,valid:true}]; }
    catch { return [{slot,valid:false}]; }
  });
}
