import {storageTranslations} from './translation-storage.js';
import {productionTranslations} from './translation-production.js';
import {rivalInvestmentTranslations} from './translation-rival-investment.js';
import {demandTranslations} from './translation-demand.js';
import {worldTranslations} from './world-translations.js';
import {regionTranslations} from './translation-region.js';
import {landTranslations} from './translation-land.js';
import {translations} from './translations.js';
import {extraTranslations} from './translation-extras.js';
import {escapeName} from './identity.js';
// UI locale is separate from simulation and save data.
export const ja = {
  subtitle: '交易会社の航海日誌', prototype: 'P0 / P1 内部試作', day: '経過日数', cash: '保有資金', assets: '総資産', operating: '累計営業収支',
  play: '時間を進める', pause: '一時停止', save: '保存', load: '再開', reset: '新しい会社',
  map: '大西洋の交易網', mapSub: '2港はドラッグ、巡回は「地図で巡回ルートを作る」から。船や競合航路のクリックで詳細。', schematic: '海岸線：Natural Earth · 距離はゲーム用',
  market: '港の市場', product: '交易品', price: '単価', stock: '在庫', production: '生産 / 日', demand: '基準需要 / 日',
  fleet: '交易ルート情報', fleetSub: 'ルートを選び、船の追加・積載条件・収支を管理します。設定操作中は時間を一時停止します。', routes: '交易路', ships: '保有船', licenses: '交易免許',
  buy: '購入', owned: '取得済み', acquire: '免許を取得', capacity: '積載', range: '航続', upkeep: '維持費', daily: '/ 日',
  departure: '起点港', destination: '相手港', vessel: '初回に配置する船', margin: '最低価格差 (%)', allowed: '積載を許可する品目', create: 'ルートを開設',
  routeSetup: '新規ルートを設定', noShip: '未使用の船がありません', noRoute: 'まだ航路がありません。地図の都市間ドラッグ、または「新規ルート」から船種を選んで開設しましょう。',
  resume: '運航再開', stop: '次の出港を停止', release: '割当を解除', edit: '積載条件を変更', apply: '次回出港から適用', cancel: '閉じる',
  profit: '実績収支', perDay: '収支 / 日', forecast: '直近の出港予測', actual: '直近の到着実績', notArrived: '未到着', roundtrip: '往復周期',
  wait: '条件を満たす商機を待機中', ready: '出港準備', sailing: '航行中', empty: '空荷で回航中', stopped: '停泊・運航停止', stopping: '到着後に停止',
  dayUnit: '日', cargo: '積み荷', noCargo: '空荷', unassigned: '未使用', journal: '会社の帳簿', journalSub: '仕入・売上・税・運営費を記録。',
  transaction: '取引内容', amount: '金額', noEntry: '航海の記録は、ここから始まります。',
  guideTitle: '最初の航海を始めよう', guide1: '① イングランドとスペインの免許を取得', guide2: '② KingstonからHavanaへドラッグし、スループを選んで開設', guide3: '③ 時間を進めて交易を始める',
  guideBody: 'ラム酒をHavanaへ、砂糖をKingstonへ。価格差を見ながら、自動交易の利益を次の船に投資しましょう。',
  cashWarning: '運営資金が残り30日分を下回っています。積み荷の売却時期と運営費を確認してください。',
  bankrupt: '会社は破産しました', bankruptBody: '現金がマイナスになったため、時間を停止しました。帳簿で支出を確認し、保存したゲームから再開するか、新しい会社を設立できます。',
  saved: '航海日誌を保存しました。', loaded: '保存したゲームを読み込みました。', noSave: '保存されたゲームがありません。',
  storageError: 'ブラウザの保存領域を利用できません。ブラウザ設定を確認してください。',
  resetConfirm: '現在の未保存の進行を破棄し、新しい会社を設立しますか？', loadConfirm: '現在の未保存の進行を破棄し、保存したゲームに戻りますか？',
  footer: '1700年をモチーフにした経済試作。海賊・外交変動・競合・造船・都市開発・陸上交易は今後の実装です。',
  ledgerNote: '営業収支は仕入支出を即時反映。航海途中は赤字に見える場合があります。船・免許・買収・外交・技術・造船・都市開発への支出は投資として区分。',
  investments: '投資支出', licenseDaily: '免許維持費', purchase: '商品仕入', sale: '商品売上', tax: '取引税', shipPurchase: '船の購入', licensePurchase: '免許取得', acquisition:'競合買収', acquiredCash:'買収による現金・債務引継',
  reserveNote: '自動積載は全保有船・免許の航海期間分の運営資金を確保します。到着時の価格は変動します。',
  cashTrend: '直近の現金推移', historyEmpty: '日数を進めると現金の推移が表示されます。',
  ports: '寄港先', taxRate: '取引税', speed: '速度', policy: '積載条件', volume: '積載量', dailyCost: '会社の固定費', capital: '開始資金',
};
ja.prototype = 'P6 地域限定リリース候補';
ja.footer = '1700年をモチーフにした地域限定リリース候補。陸上交易は今後の実装です。';
ja.cashTrend = '直近365日の現金・総資産';
ja.escort='護衛費';ja.diplomacyInvestment='外交投資';
ja.destination = '寄港地2';
export const en = {
  subtitle:'A trading company’s logbook', prototype:'P6 Regional release candidate', day:'Elapsed days', cash:'Cash', assets:'Total assets', operating:'Operating result',
  play:'Run', pause:'Pause', save:'Save', load:'Load', reset:'New company', map:'Atlantic trade network', mapSub:'Drag for two ports; use Plan a circuit for multiple stops. Click ships or competitor routes for details.', schematic:'Coastline: Natural Earth · gameplay distances',
  market:'Port market', product:'Commodity', price:'Unit price', stock:'Stock', production:'Production / day', demand:'Base demand / day', fleet:'Trade route details', fleetSub:'Select a route to add ships, set cargo policy and inspect results. Configuration pauses time.', routes:'Routes', ships:'Ships', licenses:'Trading licenses',
  buy:'Buy', owned:'Owned', acquire:'Buy license', capacity:'Capacity', range:'Range', upkeep:'Upkeep', daily:'/ day', departure:'Starting port', destination:'Port 2', vessel:'First ship', margin:'Minimum price gap (%)', allowed:'Allowed commodities', create:'Create route', routeSetup:'Create a trade route', noShip:'No idle ships', noRoute:'Drag between cities or choose New route, then select a ship type to begin.',
  resume:'Resume service', stop:'Stop departures', release:'Unassign', edit:'Cargo policy', apply:'Apply to next departure', cancel:'Close', profit:'Actual result', perDay:'Result / day', forecast:'Latest departure forecast', actual:'Latest arrival result', notArrived:'No arrivals yet', roundtrip:'Cycle',
  wait:'Waiting for a profitable opportunity', ready:'Ready', sailing:'Sailing', empty:'Repositioning empty', stopped:'Service stopped', stopping:'Stop on arrival', dayUnit:'days', cargo:'Cargo', noCargo:'Empty', unassigned:'Idle', journal:'Company ledger', journalSub:'Purchases, sales, tax and operating costs.', transaction:'Transaction', amount:'Amount', noEntry:'Your trading history starts here.',
  guideTitle:'Begin your first voyage', guide1:'1. Buy English and Spanish licenses', guide2:'2. Drag Kingston to Havana and open with a sloop', guide3:'3. Run time to start trading', guideBody:'Sell rum in Havana and sugar in Kingston. Watch prices and invest trading profits in another ship.', cashWarning:'Cash covers less than 30 days of fixed costs. Check arrival times and expenses.', bankrupt:'The company is bankrupt', bankruptBody:'Cash is negative, so time has stopped. Inspect the ledger, load a save or start a new company.',
  saved:'Game saved.', loaded:'Game loaded.', noSave:'No saved games.', storageError:'Browser storage is unavailable or full. Export a save file to protect your progress.', resetConfirm:'Discard current unsaved progress and establish a new company?', loadConfirm:'Discard current unsaved progress and load this save?',
  footer:'Regional release candidate inspired by 1700. Land trade is planned for a later phase.', ledgerNote:'Purchases immediately affect the operating result; a voyage may appear unprofitable before arrival. Ships, licenses, acquisitions, diplomacy, technology, shipbuilding and city development are separate investments.', investments:'Investments', licenseDaily:'License upkeep', purchase:'Commodity purchase', sale:'Commodity sale', tax:'Transaction tax', shipPurchase:'Ship purchase', licensePurchase:'License purchase', acquisition:'Company acquisition', acquiredCash:'Acquired cash / debt',
  reserveNote:'Auto-loading reserves operating cash for the voyage. Arrival prices can change.', cashTrend:'Cash and total assets · last 365 days', historyEmpty:'Run time to see financial history.', ports:'Ports', taxRate:'Tax', speed:'Speed', policy:'Cargo policy', volume:'Cargo volume', dailyCost:'Fixed costs', capital:'Starting cash',
};
en.escort='Escort fees';en.diplomacyInvestment='Diplomatic investment';
ja.shipSale='船の売却';en.shipSale='Ship sale';
let language = 'ja';
ja.technologyInvestment="技術投資";en.technologyInvestment="Technology investment";
ja.shipyardPurchase="造船設備";en.shipyardPurchase="Shipyard purchase";
ja.designResearch="設計研究";en.designResearch="Design research";
ja.shipConstruction="船の建造";en.shipConstruction="Ship construction";
ja.developmentPurchase="都市開発権取得";en.developmentPurchase="Development right purchase";
ja.developmentSale="都市開発権売却";en.developmentSale="Development right sale";
ja.cityInvestment="都市投資";en.cityInvestment="City investment";
ja.developmentIncome="都市の税収分配";en.developmentIncome="City tax share";
Object.assign(ja,{map:'世界の交易網',prototype:'P8 世界への拡張',footer:'1700年ごろの主要交易拠点を結ぶ世界交易。海上交易と各地の陸上交易。',ships:'船・車両',ports:'都市',market:'都市市場',departure:'起点都市',destination:'都市2',shipPurchase:'船・車両の購入',roadPurchase:'道路開発権取得',roadSale:'道路開発権売却',roadInvestment:'道路・治安投資',roadToll:'道路通行料',roadIncome:'通行料分配',networkCompensation:'都市再編による返還'});
Object.assign(en,{map:'World trade network',prototype:'P8 World expansion',footer:'Global trade inspired by the major trading centres around 1700, with maritime and inland trade routes.',ships:'Ships / vehicles',ports:'Cities',market:'City market',departure:'Starting city',destination:'City 2',shipPurchase:'Transport purchase',roadPurchase:'Road right purchase',roadSale:'Road right sale',roadInvestment:'Road and safety investment',roadToll:'Road toll',roadIncome:'Toll income',networkCompensation:'City revision refund'});
export const LANGUAGES = Object.freeze({ja:{label:'日本語',locale:'ja-JP'},en:{label:'English',locale:'en-GB'},'zh-CN':{label:'简体中文',locale:'zh-CN'},ko:{label:'한국어',locale:'ko-KR'},fr:{label:'Français',locale:'fr-FR'},es:{label:'Español',locale:'es-ES'}});
export const catalog = Object.freeze({...translations,...extraTranslations,...landTranslations,...regionTranslations,...worldTranslations,...demandTranslations,...rivalInvestmentTranslations,...productionTranslations,...storageTranslations});
const languageIndex={'zh-CN':0,ko:1,fr:2,es:3};
export const locale = () => LANGUAGES[language].locale;
export function setLanguage(value) { language = Object.hasOwn(LANGUAGES,value) ? value : 'ja'; }
export const getLanguage = () => language;
export function tx(japanese, english, values = {}) {
  const text = language === 'ja' ? japanese : language === 'en' ? english : catalog[english]?.[languageIndex[language]] ?? english;
  return text.replace(/\{(\w+)\}/g, (token,key) => Object.hasOwn(values,key) ? String(values[key]) : token);
}
export function t(key) { return tx(ja[key] ?? key,en[key] ?? key); }
const names = {
  キングストン:'Kingston', ハバナ:'Havana', ロンドン:'London', カディス:'Cadiz', ナント:'Nantes', アムステルダム:'Amsterdam', リスボン:'Lisbon', サンティアゴ:'Santiago', サントドミンゴ:'Santo Domingo', サンフアン:'San Juan', ブリッジタウン:'Bridgetown', ウィレムスタット:'Willemstad',
  イングランド:'England', スペイン:'Spain', フランス:'France', オランダ:'Netherlands', ポルトガル:'Portugal', 砂糖:'Sugar', ラム酒:'Rum', 織物:'Cloth', 工具:'Tools', 食料:'Food', タバコ:'Tobacco', 木材:'Timber', カカオ:'Cocoa', 武器:'Weapons', スループ:'Sloop', ブリッグ:'Brig', フリュート:'Fluyt',
};
// Geographic names may retain their native script regardless of UI language.
export function nameOf(entity) {
  if(entity.customName!==undefined) return escapeName(entity.customName);
  if(entity.mapName!==undefined) return entity.mapName;
  const english=entity.nameEn ?? names[entity.name] ?? entity.name;
  const design=english.match(/^(Sloop|Brig|Fluyt|Corvette|Galleon) design( #\d+)?$/);
  if(design && language!=='ja') return tx(entity.name,'{hull} design{suffix}',{hull:tx(design[1],design[1]),suffix:design[2]??''});
  return tx(entity.name,english);
}
export function errorMessage(error) {
  const messages = {
    '基礎生産量がゼロの品目には投資できません。':'Cannot invest in goods with zero base production.',
'道路を確認してください。':'Check the road.',
'すべての区間に道路が必要です。':'Every leg, including the return, needs a road.',
'道路の通過国すべての交易免許が必要です。':'Trading licenses for all transit nations are required.',
'道路開発権の資金が不足しています。':'Insufficient funds for road rights.',
'道路の権利・投資額を確認してください。':'Check road ownership and investment amounts.',
'道路データが不正です。':'Invalid road data.',
'道路の免許が不正です。':'Invalid road licenses.',
'道路の所有者が不正です。':'Invalid road owner.',
"技術投資の項目・金額を確認してください。":"Check the technology and investment amount.",
"造船技術5と設備資金4,000が必要です。":"Requires shipbuilding technology 5 and 4,000 for the shipyard.",
"設計の船型・数値を確認してください。":"Check the hull and design allocations.",
"造船設備と船型に必要な造船技術が必要です。":"Requires a shipyard and the hull technology.",
"設計の保存上限（100件）に達しました。":"The 100-design limit has been reached.",
"設計研究の資金が不足しています。":"Insufficient cash for design research.",
"研究済み設計と造船設備が必要です。":"Requires the researched design and a shipyard.",
"交易免許と未取得の都市開発権が必要です。":"Requires a trading license and an unowned development right.",
"都市開発権の資金が不足しています。":"Insufficient cash for the development right.",
"都市の権利・投資額を確認してください。":"Check ownership and city investment amounts.",
    '友好度30以上で交易免許を取得できます。':'Friendship must be at least 30 to buy a license.',
    '外交投資の国・金額を確認してください。':'Check the country, investment amount and available cash.',
    '護衛船は0～3隻で指定してください。':'Choose 0 to 3 escort ships.',
    "名前は空白以外の1～80文字で入力してください。":"Enter a non-blank name of 1–80 characters.",
"自社の研究済み設計を選んでください。":"Select a design owned by your company.",
"船を確認してください。":"Select a ship.",
"置換対象を確認してください。":"Check the replacement scope.",
"購入・建造できる置換先の船種を選んでください。":"Select a target type available for purchase or construction.",
"異なる置換元・置換先の船種を選んでください。":"Select different source and target types.",
"ルートを確認してください。":"Select a route.",
"置き換える対象がありません。":"No matching ships or settings to replace.",
"置換金額が大きすぎます。":"Replacement amounts are too large.",
"置換先の航続距離が不足するルートがあります。":"The target type cannot cover every affected route.",
"置換差額の資金が不足しています。":"Insufficient cash for the net replacement cost.",
'船種を確認してください。':'Choose a valid ship type.',
    '試作版の保有船上限（200隻）に達しました。':'The fleet limit of 200 ships has been reached.',
    'このルートで使用できる自動増減用の船種を選んでください。':'Choose an automation ship type with enough range for this route.',
    '航路の自動増減用の船種が不正です。':'Invalid automation ship type for this route.',
    '自動化の予算・最低資金・利益率閾値を確認してください。':'Check the automation budget, minimum cash and margin thresholds.',
    '月間予算を今月の使用額より小さくできません。':'The monthly budget cannot be lower than this month’s spending.',
    '買収代金と必要な免許・債務を支払う資金が不足しています。':'Insufficient cash for the acquisition, licenses and debt.',
    '全寄港地の交易免許が必要です。':'Licenses are required for every port on this route.',
    'この船の航続距離を超えています。':'A leg exceeds this ship’s range.',
    '寄港順は2～12回で指定し、同じ港を連続させないでください。':'Specify 2 to 12 stops with no consecutive visits to the same port.',
    '船の寄港順が不正です。':'Invalid ship stop index.',
    '許可品目を1つ以上選んでください。':'Select at least one commodity.',
    '最低価格差は0～1000%で指定してください。':'The minimum price gap must be between 0 and 1000%.',
    '未使用の船を選んでください。':'Select an idle ship.',
    '船の購入資金が不足しています。':'Not enough cash to buy this ship.',
    '免許の取得資金が不足しています。':'Not enough cash for this license.',
    '航行中は解除できません。停止して到着を待ってください。':'Stop departures and wait for ships to arrive before unassigning.',
    '破産後は操作できません。新しいゲームを開始してください。':'This company is bankrupt. Load a save or start a new company.',
  };
  return language === 'ja' ? error.message : tx(error.message,messages[error.message] ?? (catalog[error.message] ? error.message : 'Invalid operation or save data. Check the selected ships, licenses and file.'));
}
