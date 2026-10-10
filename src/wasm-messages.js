import {tx,nameOf,cityName,errorMessage} from './i18n.js';

// Translate at display time so saved records also follow language changes.
const storageJapanese={
 'Language preference could not be saved.':'言語設定を保存できませんでした。',
 'A save could not be loaded; trying the next most recent save.':'保存を読み込めませんでした。次に新しい保存を試します。',
 'IndexedDB is unavailable. Export a save file.':'ブラウザの保存領域を利用できません。セーブファイルを書き出してください。',
 'Close other game tabs and retry saving.':'他のゲームタブを閉じてから保存を再試行してください。',
 'Save transaction aborted':'保存処理が中断されました',
 'No save in this slot.':'この枠には保存がありません。',
 'Choose manual slot 1–5.':'手動保存の1～5枠を選んでください。',
};
export function diagnostic(message){
 const text=String(message);
 if(storageJapanese[text])return tx(storageJapanese[text],text);
 for(const [prefix,ja]of [['Save storage unavailable: ','保存領域を利用できません：{error}'],['Autosave failed: ','自動保存に失敗しました：{error}']]){
  if(text.startsWith(prefix))return tx(ja,prefix+'{error}',{error:diagnostic(text.slice(prefix.length))});
 }
 // Keep unknown browser diagnostics intact; known game errors use the catalog.
 return /[\u3040-\u9fff]/.test(text)?errorMessage({message:text}):text;
}
export function eventText(event,catalog){
 const nation=id=>nameOf(catalog.nations.find(n=>n.id===id)??{name:id});
 if(event.kind==='firstRank')return tx('初めて資産総額1位になりました。','First place in total assets achieved.');
 if(['war','peace'].includes(event.kind)){
  const match=event.message.match(/^(\S+) \/ (\S+) /);
  if(match)return nation(match[1])+' / '+nation(match[2])+' · '+(event.kind==='war'?tx('開戦','War began'):tx('終戦','Peace restored'));
 }
 if(['warning','revoked'].includes(event.kind)){
  const match=event.message.match(/^(.*): (\S+)の(?:友好度が低下しています|交易免許が取り消されました)$/);
  if(match)return match[1]+' · '+nation(match[2])+' · '+(event.kind==='warning'?tx('友好度が低下しています','Friendship is falling'):tx('交易免許が取り消されました','Trading license revoked'));
 }
 if(event.kind==='raided')return event.message.replace(/ が襲撃を受けました$/,' · '+tx('襲撃を受けました','Transport raided'));
 if(event.kind==='retiredRoad'){
  const match=event.message.match(/Retired roads: (\d+) route\(s\) removed; vehicles returned; refund £([\d.]+)/);
  if(match)return tx('廃止陸路：{count}件のルートを解除し、車両を未使用に戻しました。返金 £{refund}','Retired roads: {count} route(s) removed; vehicles returned; refund £{refund}',{count:match[1],refund:match[2]});
 }
 return event.message;
}
export function ledgerDetail(entry,catalog,specs,technologies){
 if(entry.category==='technologyInvestment')return technologies[Number(entry.detail)]??entry.detail;
 if(['acquisition','acquiredCash','shipSale'].includes(entry.category))return entry.detail;
 const label=id=>{
  const city=catalog.cities.find(c=>c.id===id);if(city)return cityName(city);
  const road=catalog.roads.find(r=>r.id===id);if(road)return [road.a,road.b].map(i=>cityName(catalog.cities[i])).join(' ↔ ');
  const entity=[...catalog.nations,...catalog.goods,...specs].find(e=>e.id===id);
  return entity?nameOf(entity):id;
 };
 return entry.detail.split(/( · |\s+)/).map(label).join('');
}
