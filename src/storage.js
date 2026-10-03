import { serialize, deserialize } from './engine.js';
export const SAVE_KEYS = {
  manual:'sails-and-flags.manual.1',manual2:'sails-and-flags.manual.2',manual3:'sails-and-flags.manual.3',manual4:'sails-and-flags.manual.4',manual5:'sails-and-flags.manual.5',
  auto:'sails-and-flags.autosave.latest',auto1:'sails-and-flags.autosave.1',auto2:'sails-and-flags.autosave.2',auto3:'sails-and-flags.autosave.3',auto4:'sails-and-flags.autosave.4',
  v15:'sails-and-flags.save.v15',autoV15:'sails-and-flags.auto.v15',
  backup: 'sails-and-flags.backup.v15', v14:'sails-and-flags.save.v14',autoV14:'sails-and-flags.auto.v14',backupV14:'sails-and-flags.backup.v14', v13:'sails-and-flags.save.v13',autoV13:'sails-and-flags.auto.v13',backupV13:'sails-and-flags.backup.v13', v12:'sails-and-flags.save.v12',autoV12:'sails-and-flags.auto.v12',backupV12:'sails-and-flags.backup.v12', v11:'sails-and-flags.save.v11',autoV11:'sails-and-flags.auto.v11',backupV11:'sails-and-flags.backup.v11', v10:'sails-and-flags.save.v10',autoV10:'sails-and-flags.auto.v10',backupV10:'sails-and-flags.backup.v10', v9:'sails-and-flags.save.v9',autoV9:'sails-and-flags.auto.v9',backupV9:'sails-and-flags.backup.v9', v8:'sails-and-flags.save.v8',autoV8:'sails-and-flags.auto.v8',backupV8:'sails-and-flags.backup.v8', v7:'sails-and-flags.save.v7',autoV7:'sails-and-flags.auto.v7',backupV7:'sails-and-flags.backup.v7',v6:'sails-and-flags.save.v6', autoV6:'sails-and-flags.auto.v6', backupV6:'sails-and-flags.backup.v6', v5:'sails-and-flags.save.v5', autoV5:'sails-and-flags.auto.v5', backupV5:'sails-and-flags.backup.v5', v4:'sails-and-flags.save.v4', autoV4:'sails-and-flags.auto.v4', backupV4:'sails-and-flags.backup.v4', v3:'sails-and-flags.save.v3', autoV3:'sails-and-flags.auto.v3', backupV3:'sails-and-flags.backup.v3', v2: 'sails-and-flags.save.v2', v1: 'sails-and-flags.save.v1',
  preserved: 'sails-and-flags.preserved.production',preservedCaravans:'sails-and-flags.preserved.caravans',preservedCrossings:'sails-and-flags.preserved.crossings',preservedContinents:'sails-and-flags.preserved.continents',preservedWorld:'sails-and-flags.preserved.world',preservedRegion:'sails-and-flags.preserved.p8-ligurian',preservedSea:'sails-and-flags.preserved.sea-routing',preservedCities:'sails-and-flags.preserved.p7-cities', preservedP7:'sails-and-flags.preserved.p7', preservedP6:'sails-and-flags.preserved.p6',
};
export const MANUAL_SLOTS=['manual','manual2','manual3','manual4','manual5'];
export const AUTO_HISTORY=['auto1','auto2','auto3','auto4'];
const automatic=slot=>slot==='auto'||AUTO_HISTORY.includes(slot)||/^autoV\d+$/.test(slot)||/^backup(?:V\d+)?$/.test(slot);
const timestamp=value=>Number.isSafeInteger(value)&&value>=0&&value<=8.64e15;
const quota=error=>error?.name==='QuotaExceededError'||error?.name==='NS_ERROR_DOM_QUOTA_REACHED'||error?.code===22||error?.code===1014;

function unpack(raw){
 const data=JSON.parse(raw);
 if(data?.storageVersion===1){
  if(!timestamp(data.savedAt)||!data.state||typeof data.state!=='object')throw Error('Invalid save envelope');
  return {state:deserialize(JSON.stringify(data.state)),savedAt:data.savedAt};
 }
 return {state:deserialize(raw),savedAt:null};
}
export function readSave(raw){return unpack(raw).state;}

// Legacy saves have no wall-clock timestamp. Order those by format generation,
// then game day; new saves use persisted chronological timestamps even on rewind.
function age(slot,raw){
 try{const data=JSON.parse(raw);return data?.storageVersion===1&&timestamp(data.savedAt)?[1,data.savedAt,0]:[0,Number(data?.version)||0,Number(data?.day)||0];}
 catch{return [-1,0,0];}
}
const older=(a,b)=>{for(let i=0;i<3;i++){const d=a.age[i]-b.age[i];if(d)return d;}return a.slot.localeCompare(b.slot);};
function automaticSaves(storage){return Object.entries(SAVE_KEYS).filter(([slot])=>automatic(slot)).flatMap(([slot,key])=>{const raw=storage.getItem(key);return raw===null?[]:[{slot,key,raw,age:age(slot,raw)}];}).sort(older);}

// setItem replaces an existing value atomically. Only quota errors authorize
// pruning, and only automatic saves are candidates. Never remove the destination.
function writeWithSpace(storage,key,raw){
 const removed=[];
 try{
  try{storage.setItem(key,raw);return removed;}catch(error){if(!quota(error))throw error;}
  for(const old of automaticSaves(storage).filter(s=>s.key!==key)){
   if(storage.getItem(old.key)!==old.raw)continue; // Another tab may have replaced this generation.
   storage.removeItem(old.key);removed.push(old);
   try{storage.setItem(key,raw);return removed;}catch(error){if(!quota(error))throw error;}
  }
  const error=new Error('Save quota exceeded');error.name='QuotaExceededError';throw error;
 }catch(error){
  // If the new save cannot fit at all, restore evicted autosaves where possible.
  for(const old of removed)try{if(storage.getItem(old.key)===null)storage.setItem(old.key,old.raw);}catch{/* Browser restrictions or concurrent writes may prevent rollback. */}
  throw error;
 }
}

export function saveGame(storage,state,slot='manual'){
 if(!MANUAL_SLOTS.includes(slot)&&slot!=='auto')throw Error('Invalid save slot');
 const raw=serialize(state);deserialize(raw); // Complete validation before any write or eviction.
 const previous=storage.getItem(SAVE_KEYS[slot]);
 let previousValid=false;if(previous!==null)try{unpack(previous);previousValid=true;}catch{/* Do not archive corrupt data. */}
 const last=Object.values(SAVE_KEYS).reduce((n,key)=>{try{const value=JSON.parse(storage.getItem(key));return value?.storageVersion===1&&timestamp(value.savedAt)?Math.max(n,value.savedAt):n;}catch{return n;}},0);
 const envelope=JSON.stringify({storageVersion:1,savedAt:Math.min(8.64e15,Math.max(Date.now(),last+1)),state:JSON.parse(raw)});
 const removed=writeWithSpace(storage,SAVE_KEYS[slot],envelope);
 // Commit the latest save first. An optional history copy must never prevent it.
 if(slot==='auto'&&previousValid)try{
  const history=AUTO_HISTORY.map(id=>({slot:id,key:SAVE_KEYS[id],raw:storage.getItem(SAVE_KEYS[id])}));
  const target=history.find(v=>v.raw===null)??history.map(v=>({...v,age:age(v.slot,v.raw)})).sort(older)[0];
  storage.setItem(target.key,previous);
 }catch{/* Optional history reads and writes cannot invalidate the committed save. */}
 return {slot,removed:removed.map(v=>v.slot)};
}

export function listSaves(storage){
 return Object.entries(SAVE_KEYS).flatMap(([slot,key])=>{
  const raw=storage.getItem(key);if(raw===null)return [];
  try{const {state,savedAt}=unpack(raw);return [{slot,state,savedAt,day:state.day,valid:true,automatic:automatic(slot)}];}
  catch{return [{slot,valid:false,automatic:automatic(slot)}];}
 });
}
