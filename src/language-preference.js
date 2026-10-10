import {LANGUAGES} from './i18n.js';

// Presentation preferences have their own database, independent of game saves.
export function supportedLanguage(tag) {
 const parts=String(tag??'').toLowerCase().replaceAll('_','-').split('-');
 if(parts[0]==='zh')return parts.includes('hant')?'zh-TW':parts.includes('hans')?'zh-CN':parts.some(p=>['tw','hk','mo'].includes(p))?'zh-TW':'zh-CN';
 return Object.hasOwn(LANGUAGES,parts[0])?parts[0]:null;
}
export function chooseLanguage(saved,languages=[]) {
 return (Object.hasOwn(LANGUAGES,saved)?saved:null)??languages.map(supportedLanguage).find(Boolean)??'en';
}
export class LanguagePreference {
 constructor(factory=globalThis.indexedDB){this.factory=factory;}
 async open(){
  if(this.db)return this.db;
  if(!this.factory)throw new Error('Language preference could not be saved.');
  return new Promise((resolve,reject)=>{
   const r=this.factory.open('sails-flags-preferences',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('settings');
   r.onerror=()=>reject(r.error);
   r.onblocked=()=>reject(new Error('Language preference could not be saved.'));
   r.onsuccess=()=>{this.db=r.result;this.db.onversionchange=()=>{this.db.close();this.db=null;};resolve(this.db);};
  });
 }
 async read(){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('settings').objectStore('settings').get('language');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async write(language){
  const db=await this.open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(language,'language');
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Language preference could not be saved.'));tx.onerror=()=>{};
  });
 }
}
