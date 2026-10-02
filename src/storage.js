import { serialize, deserialize } from './engine.js';
export const SAVE_KEYS = {
  manual: 'sails-and-flags.save.v8', auto: 'sails-and-flags.auto.v8',
  backup: 'sails-and-flags.backup.v8', v7:'sails-and-flags.save.v7',autoV7:'sails-and-flags.auto.v7',backupV7:'sails-and-flags.backup.v7',v6:'sails-and-flags.save.v6', autoV6:'sails-and-flags.auto.v6', backupV6:'sails-and-flags.backup.v6', v5:'sails-and-flags.save.v5', autoV5:'sails-and-flags.auto.v5', backupV5:'sails-and-flags.backup.v5', v4:'sails-and-flags.save.v4', autoV4:'sails-and-flags.auto.v4', backupV4:'sails-and-flags.backup.v4', v3:'sails-and-flags.save.v3', autoV3:'sails-and-flags.auto.v3', backupV3:'sails-and-flags.backup.v3', v2: 'sails-and-flags.save.v2', v1: 'sails-and-flags.save.v1',
  preserved: 'sails-and-flags.preserved.p7-cities', preservedP7:'sails-and-flags.preserved.p7', preservedP6:'sails-and-flags.preserved.p6',
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
