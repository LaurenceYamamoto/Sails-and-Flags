// UI locale is separate from simulation and save data.
export const ja = {
  subtitle: '交易会社の航海日誌', prototype: 'P0 / P1 内部試作', day: '経過日数', cash: '保有資金', assets: '総資産', operating: '累計営業収支',
  play: '時間を進める', pause: '一時停止', save: '保存', load: '再開', reset: '新しい会社',
  map: '大西洋の交易網', mapSub: '2港はドラッグ、巡回は「地図で巡回ルートを作る」から。船や競合航路のクリックで詳細。', schematic: '海岸線：Natural Earth · 距離はゲーム用',
  market: '港の市場', product: '交易品', price: '単価', stock: '在庫', production: '生産 / 日', demand: '基準需要 / 日',
  fleet: '交易ルート情報', fleetSub: 'ルートを選び、船の追加・積載条件・収支を管理します。設定操作中は時間を一時停止します。', routes: '交易路', ships: '保有船', licenses: '交易免許',
  buy: '購入', owned: '取得済み', acquire: '免許を取得', capacity: '積載', range: '航続', upkeep: '維持費', daily: '/ 日',
  departure: '起点港', destination: '相手港', vessel: '初回に配置する船', margin: '最低価格差 (%)', allowed: '積載を許可する品目', create: 'ルートを開設',
  routeSetup: '新規ルートを設定', noShip: '未使用の船がありません', noRoute: 'まだ航路がありません。船を購入し、地図の都市間ドラッグ、または「新規ルート」から開設しましょう。',
  resume: '運航再開', stop: '次の出港を停止', release: '割当を解除', edit: '積載条件を変更', apply: '次回出港から適用', cancel: '閉じる',
  profit: '実績収支', perDay: '収支 / 日', forecast: '直近の出港予測', actual: '直近の到着実績', notArrived: '未到着', roundtrip: '往復周期',
  wait: '条件を満たす商機を待機中', ready: '出港準備', sailing: '航行中', empty: '空荷で回航中', stopped: '停泊・運航停止', stopping: '到着後に停止',
  dayUnit: '日', cargo: '積み荷', noCargo: '空荷', unassigned: '未使用', journal: '会社の帳簿', journalSub: '仕入・売上・税・運営費を記録。',
  transaction: '取引内容', amount: '金額', noEntry: '航海の記録は、ここから始まります。',
  guideTitle: '最初の航海を始めよう', guide1: '① スペインの免許を取得', guide2: '② スループを購入', guide3: '③ KingstonからHavanaへドラッグして開設し、時間を進める',
  guideBody: 'ラム酒をHavanaへ、砂糖をKingstonへ。価格差を見ながら、自動交易の利益を次の船に投資しましょう。',
  cashWarning: '運営資金が残り30日分を下回っています。積み荷の売却時期と運営費を確認してください。',
  bankrupt: '会社は破産しました', bankruptBody: '現金がマイナスになったため、時間を停止しました。帳簿で支出を確認し、保存したゲームから再開するか、新しい会社を設立できます。',
  saved: '航海日誌を保存しました。', loaded: '保存したゲームを読み込みました。', noSave: '保存されたゲームがありません。',
  storageError: 'ブラウザの保存領域を利用できません。ブラウザ設定を確認してください。',
  resetConfirm: '現在の未保存の進行を破棄し、新しい会社を設立しますか？', loadConfirm: '現在の未保存の進行を破棄し、保存したゲームに戻りますか？',
  footer: '1700年をモチーフにした経済試作。海賊・外交変動・競合・造船・都市開発・陸上交易は今後の実装です。',
  ledgerNote: '営業収支は仕入支出を即時反映。航海途中は赤字に見える場合があります。船・免許取得は一時投資として区分。',
  investments: '一時投資', licenseDaily: '免許維持費', purchase: '商品仕入', sale: '商品売上', tax: '取引税', shipPurchase: '船の購入', licensePurchase: '免許取得',
  reserveNote: '自動積載は全保有船・免許の航海期間分の運営資金を確保します。到着時の価格は変動します。',
  cashTrend: '直近の現金推移', historyEmpty: '日数を進めると現金の推移が表示されます。',
  ports: '寄港先', taxRate: '取引税', speed: '速度', policy: '積載条件', volume: '積載量', dailyCost: '会社の固定費', capital: '開始資金',
};
ja.prototype = 'P2 地域限定アルファ';
ja.footer = '1700年をモチーフにした地域限定アルファ。海賊・動的外交・造船・都市開発・陸上交易は今後の実装です。';
ja.cashTrend = '直近365日の現金・総資産';
ja.destination = '寄港地2';
export const en = {
  subtitle:'A trading company’s logbook', prototype:'P2 Regional alpha', day:'Elapsed days', cash:'Cash', assets:'Total assets', operating:'Operating result',
  play:'Run', pause:'Pause', save:'Save', load:'Load', reset:'New company', map:'Atlantic trade network', mapSub:'Drag for two ports; use Plan a circuit for multiple stops. Click ships or competitor routes for details.', schematic:'Coastline: Natural Earth · gameplay distances',
  market:'Port market', product:'Commodity', price:'Unit price', stock:'Stock', production:'Production / day', demand:'Base demand / day', fleet:'Trade route details', fleetSub:'Select a route to add ships, set cargo policy and inspect results. Configuration pauses time.', routes:'Routes', ships:'Ships', licenses:'Trading licenses',
  buy:'Buy', owned:'Owned', acquire:'Buy license', capacity:'Capacity', range:'Range', upkeep:'Upkeep', daily:'/ day', departure:'Starting port', destination:'Port 2', vessel:'First ship', margin:'Minimum price gap (%)', allowed:'Allowed commodities', create:'Create route', routeSetup:'Create a trade route', noShip:'No idle ships', noRoute:'Buy a ship, then drag between cities or choose New route to begin.',
  resume:'Resume service', stop:'Stop departures', release:'Unassign', edit:'Cargo policy', apply:'Apply to next departure', cancel:'Close', profit:'Actual result', perDay:'Result / day', forecast:'Latest departure forecast', actual:'Latest arrival result', notArrived:'No arrivals yet', roundtrip:'Cycle',
  wait:'Waiting for a profitable opportunity', ready:'Ready', sailing:'Sailing', empty:'Repositioning empty', stopped:'Service stopped', stopping:'Stop on arrival', dayUnit:'days', cargo:'Cargo', noCargo:'Empty', unassigned:'Idle', journal:'Company ledger', journalSub:'Purchases, sales, tax and operating costs.', transaction:'Transaction', amount:'Amount', noEntry:'Your trading history starts here.',
  guideTitle:'Begin your first voyage', guide1:'1. Buy a Spanish license', guide2:'2. Buy a sloop', guide3:'3. Drag Kingston to Havana, create a route and run time', guideBody:'Sell rum in Havana and sugar in Kingston. Watch prices and invest trading profits in another ship.', cashWarning:'Cash covers less than 30 days of fixed costs. Check arrival times and expenses.', bankrupt:'The company is bankrupt', bankruptBody:'Cash is negative, so time has stopped. Inspect the ledger, load a save or start a new company.',
  saved:'Game saved.', loaded:'Game loaded.', noSave:'No saved games.', storageError:'Browser storage is unavailable or full. Export a save file to protect your progress.', resetConfirm:'Discard current unsaved progress and establish a new company?', loadConfirm:'Discard current unsaved progress and load this save?',
  footer:'Regional alpha inspired by 1700. Pirates, dynamic diplomacy, shipbuilding, city development and land trade are planned for later phases.', ledgerNote:'Purchases immediately affect the operating result; a voyage may appear unprofitable before arrival. Ships and licenses are separate investments.', investments:'Investments', licenseDaily:'License upkeep', purchase:'Commodity purchase', sale:'Commodity sale', tax:'Transaction tax', shipPurchase:'Ship purchase', licensePurchase:'License purchase',
  reserveNote:'Auto-loading reserves operating cash for the voyage. Arrival prices can change.', cashTrend:'Cash and total assets · last 365 days', historyEmpty:'Run time to see financial history.', ports:'Ports', taxRate:'Tax', speed:'Speed', policy:'Cargo policy', volume:'Cargo volume', dailyCost:'Fixed costs', capital:'Starting cash',
};
let language = 'ja';
export const locale = () => language === 'ja' ? 'ja-JP' : 'en-GB';
export function setLanguage(value) { language = value === 'en' ? 'en' : 'ja'; }
export const getLanguage = () => language;
export const tx = (japanese, english) => language === 'ja' ? japanese : english;
export function t(key) { return (language === 'ja' ? ja : en)[key] ?? key; }
const names = {
  キングストン:'Kingston', ハバナ:'Havana', ロンドン:'London', カディス:'Cadiz', ナント:'Nantes', アムステルダム:'Amsterdam', リスボン:'Lisbon', サンティアゴ:'Santiago', サントドミンゴ:'Santo Domingo', サンフアン:'San Juan', ブリッジタウン:'Bridgetown', ウィレムスタット:'Willemstad',
  イングランド:'England', スペイン:'Spain', フランス:'France', オランダ:'Netherlands', ポルトガル:'Portugal', 砂糖:'Sugar', ラム酒:'Rum', 織物:'Cloth', 工具:'Tools', 食料:'Food', タバコ:'Tobacco', 木材:'Timber', カカオ:'Cocoa', スループ:'Sloop', ブリッグ:'Brig', フリュート:'Fluyt',
};
// Geographic names may retain their native script regardless of UI language.
export const nameOf = entity => entity.mapName ?? tx(entity.name, names[entity.name] ?? entity.name);
export function errorMessage(error) {
  const messages = {
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
  return language === 'ja' || !/[\u3000-\u9fff]/.test(error.message) ? error.message : messages[error.message] ?? 'Invalid operation or save data. Check the selected ships, licenses and file.';
}
