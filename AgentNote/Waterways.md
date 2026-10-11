> **2026-10-12撤回済み**：この文書は以前の試作の記録です。現行仕様は[限定水路の記録](2026-10-12-limited-sailing-waterways.md)を参照してください。

# 水路の導入 / 2026-10-11

## 実装判断

既存の陸路から54区間を転換。河川の幹線・支流・既存運河・湖沼を対象とし、水系を越える短絡陸路は維持。都市数は増やさない。船型による通行可否をRustへ集約し、JSや船名から通行権を判断しない。

- Cairo–Suez、Portobelo–Panama、Detroit–Albany、Detroit–Vincennes、Irkutsk–Kirensk等は陸路を維持。
- Jinanは大運河の本線から外れるため、Tianjin–Jinan / Jinan–Yangzhouは今回は転換しない。
- Alexandria–Cairoは時代による運河・港への接続条件の差を避け、陸路を維持。
- Detroit–Montrealは以前の依頼で指定された水路扱いを実現。ただし実際のNiagara・急流で必要だったポーテージ／積み替えをひとつの小型船航路に簡略化する。単一船で無障害に通航できたという史実の主張ではない。
- 上流・運河・デルタの浅瀬や季節差も簡略化し、sloopを小型河川輸送手段の共通表現として使用。現代の大型船用運河を新設した扱いにはしない。
- 水路は河道に沿った概略折れ線。河道変化・水深・全蛇行は再現せず、折れ線の大円距離合計×1.1÷1.852を海里とする。描画の都市ずらしは距離に影響しない。

## 旧セーブと不具合対策

道路配列の順番を維持し、転換区間にretired_since=24を付与。旧陸路ルートは車両を船へ勝手に変換せず、運行解除して再開設できる状態へ戻す。積荷原価、道路取得原価、未使用積立を一度だけ返金する。既存の適合スループ海上ルートは維持し、不適合な大型船・必要免許不足の旧ルートを解除する。

旧設計には船型IDがなかったが、Spec.levelはベース船型の必要技術値を保持している。海上船型では5/10/15/25/30が重複しないため、改名済みの設計も復元できる。新しい設計はbaseHullを保存する。

既存の地域テストが「全区間をキャラバンで走る」「旧道路総数＝有効道路数」と仮定していた箇所を更新。水路／陸路を混ぜた単一巡回は拒否し、輸送クラスごとにルートを開設する。以前から残っていた国家追加後の固定配列長の期待値も現在の国家数へ合わせる。

## 参考資料（接続方針のみ）

- [UNESCO: The Grand Canal](https://whc.unesco.org/en/list/1443/): 前近代の運河による河川流域接続。
- [Canadian Museum of History: Fur Trade](https://www.historymuseum.ca/virtual-museum-of-new-france/economic-activities/fur-trade/): Montrealと内陸の毛皮交易。
- [US National Park Service: Mississippi Delta history](https://www.nps.gov/locations/lowermsdeltaregion/history-and-culture-of-the-mississippi-delta-region.htm): Mississippiの輸送と交易。
- [Library of Congress: A Bengal Atlas](https://www.loc.gov/resource/gmdatlases.map37000045/?sp=23): 18世紀ベンガルの内陸水運図の所在を確認（ページ取得制限があり図版の完全照合は未実施）。
- [Cambridge Economic History of India: Eastern India](https://www.cambridge.org/core/books/abs/cambridge-economic-history-of-india/eastern-india/495400FB2DD53DAFDB6EB84F0750860A): Ganges・Bhagirathi系と交易、季節航行の限界。

## 転換一覧

| 旧道路ID | 都市 | 水系 | 距離（海里・概算） |
|---|---|---|---:|
| amsterdam_cologne | Amsterdam – Cologne | Rhine | 144 |
| cologne_frankfurt | Cologne – Frankfurt | Rhine / Main | 108 |
| dresden_prague | Dresden – Prague | Elbe / Vltava | 83 |
| vienna_buda | Vienna – Buda | Danube | 147 |
| buda_belgrade | Buda – Belgrade | Danube | 218 |
| gdansk_warsaw | Gdańsk – Warsaw | Vistula | 219 |
| warsaw_krakow | Warsaw – Kraków | Vistula | 195 |
| paris_rouen | Paris – Rouen | Seine | 71 |
| bordeaux_toulouse | Bordeaux – Toulouse | Garonne | 133 |
| strasbourg_frankfurt | Strasbourg – Frankfurt | Rhine / Main | 123 |
| moscow_kazan | Moscow – Kazan | Moskva / Oka / Volga | 499 |
| kazan_kungur | Kazan – Kungur | Volga / Kama / Sylva | 442 |
| astrakhan_tsaritsyn | Astrakhan – Tsaritsyn | Volga | 228 |
| tsaritsyn_moscow | Tsaritsyn – Moscow | Volga / Oka / Moskva | 1098 |
| baghdad_basra | Baghdad – Basra | Tigris / Shatt al-Arab | 281 |
| timbuktu_djenne | Timbuktu – Djenné | Niger / Bani | 235 |
| agra_delhi | Agra – Delhi | Yamuna | 108 |
| agra_allahabad | Agra – Allahabad | Yamuna | 258 |
| allahabad_benares | Allahabad – Benares | Ganges | 80 |
| benares_patna | Benares – Patna | Ganges | 137 |
| patna_murshidabad | Patna – Murshidabad | Ganges / Bhagirathi | 223 |
| murshidabad_hughli | Murshidabad – Hughli | Bhagirathi / Hooghly | 85 |
| murshidabad_dhaka | Murshidabad – Dhaka | Ganges / Padma / Buriganga | 204 |
| hughli_dhaka | Hughli – Dhaka | Hooghly / Jalangi / Padma | 219 |
| lahore_multan | Lahore – Multan | Ravi / Chenab | 212 |
| multan_thatta | Multan – Thatta | Chenab / Indus | 466 |
| thatta_lahoribandar | Thatta – Lahori Bandar | Indus delta | 48 |
| suzhou_hangzhou | 蘇州 – 杭州 | Grand Canal | 83 |
| hangzhou_ningbo | 杭州 – 寧波 | Eastern Zhejiang Canal | 90 |
| beijing_tianjin | 北京 – 天津 | Tonghui / Grand Canal | 71 |
| yangzhou_nanjing | 揚州 – 南京 | Yangtze | 54 |
| yangzhou_suzhou | 揚州 – 蘇州 | Grand Canal | 106 |
| jingdezhen_hankou | 景徳鎮 – 漢口 | Chang / Poyang / Yangtze | 229 |
| nanchang_jingdezhen | 南昌 – 景徳鎮 | Gan / Poyang / Chang | 95 |
| hankou_changsha | 漢口 – 長沙 | Yangtze / Dongting / Xiang | 189 |
| hankou_yichang | 漢口 – 宜昌 | Yangtze | 260 |
| yichang_chongqing | 宜昌 – 重慶 | Yangtze | 308 |
| chongqing_chengdu | 重慶 – 成都 | Yangtze / Min | 270 |
| foshan_guangzhou | 仏山 – 広州 | Pearl River | 26 |
| osaka_kyoto | 大阪 – 京都 | Yodo | 29 |
| thanglong_phohien | Thang Long – Pho Hien | Red River | 29 |
| syriam_ava | Syriam – Ava | Irrawaddy | 406 |
| tyumen_tobolsk | Tyumen – Tobolsk | Tura / Tobol | 133 |
| tobolsk_tara | Tobolsk – Tara | Irtysh | 295 |
| tara_tomsk | Tara – Tomsk | Irtysh / Ob / Tom | 1145 |
| yeniseysk_krasnoyarsk | Yeniseysk – Krasnoyarsk | Yenisei | 180 |
| kirensk_yakutsk | Kirensk – Yakutsk | Lena | 825 |
| irkutsk_verkhneudinsk | Irkutsk – Verkhneudinsk | Angara / Baikal / Selenga | 169 |
| quebec_montreal | Québec – Montreal | St. Lawrence | 143 |
| newyork_albany | New York – Albany | Hudson | 129 |
| asuncion_buenosaires | Asunción – Buenos Aires | Paraguay / Parana | 724 |
| detroit_montreal | Detroit – Montreal | Great Lakes / St. Lawrence | 564 |
| vincennes_kaskaskia | Vincennes – Kaskaskia | Wabash / Ohio / Mississippi | 232 |
| kaskaskia_neworleans | Kaskaskia – New Orleans | Mississippi | 622 |

## 検証

- npm run build:wasm / npm run build:translations 成功。新規依存追加なし。
- 水路専用6件を初回確認。54区間の双方向開設制約、設計・改名・置換・改ざん保存拒否、海路との混在巡回の荷役と売買、旧路線返金、旧設計復元、競合の運行を検証。
- 最終選択テスト9件合格。自動拡大でスループ設計船を購入し、在庫の大型船を使わないことも追加検証。
- 翻訳・言語初期値・リスト・Wasm境界14件合格。地域回帰12件は11件合格後、残りの試験用道路番号を転換対象外へ修正し最終選択テストで合格。南昌–景徳鎮の新水路と旧インド陸路移行、欧州接続性の追加2件も合格。
- Gitの保存用ブランチ3.3.10から実際の旧Wasmを読み、旧版で作成した大阪–京都の車両ルート保存を現行Wasmへ移行。車両の未配置化、現金保全、revision24への更新、再ロードの同一性を確認。
- 既存コア試験も荷役・技術・遭難・投資・待機割合等を確認。広い回帰実行は旧テスト前提の修正へ切り替えるため中断し、対象を絞って再検証。npm test全件および50年間の長期試験を完走したという主張はしない。
- 変更JSの構文検査30ファイルとgit diff --check成功。
- ユーザーの127.0.0.1タブを変更せず、localhost:4176の別タブで日本免許取得→大阪–京都選択→Sloopだけが候補→購入費表示→開設→ルート表示まで確認。青い54水路と凡例も描画され、ブラウザー警告・エラーは0件。検証タブは閉じた。
- 画面記録: [Waterways-UI.jpg](Waterways-UI.jpg)。
