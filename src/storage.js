import { serialize, deserialize } from './engine.js';
export const SAVE_KEYS = {
  manual: 'sails-and-flags.save.v6', auto: 'sails-and-flags.auto.v6',
  backup: 'sails-and-flags.backup.v6', v5:'sails-and-flags.save.v5', autoV5:'sails-and-flags.auto.v5', backupV5:'sails-and-flags.backup.v5', v4:'sails-and-flags.save.v4', autoV4:'sails-and-flags.auto.v4', backupV4:'sails-and-flags.backup.v4', v3:'sails-and-flags.save.v3', autoV3:'sails-and-flags.auto.v3', backupV3:'sails-and-flags.backup.v3', v2: 'sails-and-flags.save.v2', v1: 'sails-and-flags.save.v1',
};
// Validate before overwriting a slot. A failed write leaves the last save intact.
export function saveGame(storage, state, slot = 'manual') {
  if (!['manual','auto'].includes(slot)) throw new Error('Invalid save slot');
  const raw = serialize(state);
  deserialize(raw);
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
    if (!raw) return [];
    try { const state = deserialize(raw); return [{slot,state,day:state.day,valid:true}]; }
    catch { return [{slot,valid:false}]; }
  });
}
