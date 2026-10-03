# 世界各地の内陸都市と陸上交易網

## 問題と対応

世界拡張版は66港がある一方、内陸はMadrid・Parisの2都市、道路は西欧の8区間のみだった。44内陸都市・59道路・Asanteを追加し、112都市（66港＋46内陸）、23国家、67道路に拡張。海路と既存都市の産品は変更していない。

各国へ機械的に同数の都市を割り当てず、政治・商業・生産上の代表的拠点と沿岸の出口を結ぶ。近距離でもCallao–Lima、Osaka–Kyotoは港と主要内陸都市の役割の違いを採用理由とした。Evora・Oxford・Utrechtは復活させていない。

|地域|道路数（既存含む）|代表的な接続|
|---|---:|---|
|西欧|8|既存ネットワークを維持|
|東欧・西アジア|13|Arkhangelsk–Moscow–Kazan、Izmir–Ankara–Aleppo–Baghdad–Isfahan–Shiraz–Bandar Abbas、Mocha–Sanaa|
|アフリカ|6|Salé–Fez–Marrakesh、Alexandria–Cairo–Damascus、Elmina–Kumasi|
|南アジア|7|Surat–Ahmedabad–Agra–Delhi–Lahore、Agra–Patna–Hughli–Dhaka|
|東アジア|13|北京–南京–蘇州–杭州–寧波、西安–漢口–長沙–広州、景徳鎮–厦門、大阪–京都、釜山–漢城|
|北・中央アメリカ|9|Québec–Montreal、Boston–Albany–New York、Veracruz–Puebla–Mexico City–Acapulco|
|南アメリカ|11|Cartagena–Bogota–Quito–Lima–Cusco–Potosi–Cordoba–Buenos Aires、Cordoba–Santiago de Chile–Valparaíso、Rio de Janeiro–Sao Paulo|

単線の連続区間を巡回する場合は、帰り道にも同じ道路を指定する（例：Surat → Ahmedabad → Agra → Ahmedabad → Surat）。全都市が少なくとも1港へ陸路で接続することをグラフ検証した。各区間は馬車の航続2,000 km以内。

## データ・地理・史実上の扱い

- 新しい内陸市場は各都市の輸出品目から20商品の在庫・生産・需要を生成。Potosiの銀、景徳鎮の陶磁器、杭州の茶・絹、Agraの藍、Kumasiの金など、生産地と消費地の違いを設けた。数量と価格はゲーム用の合成データ。
- 道路は実際の歴史街道の精密な復元ではない。距離kmは概算の回廊距離、経由点は描画のための地理的折れ点。河川渡河・山地輸送も既存の馬車システムで抽象化しており、駄獣キャラバンや内陸水運は別実装していない。
- Asanteの都市はKumasi。Elminaの所属はNetherlandsのまま、国家間の海上距離計算に使う交易窓口のみElminaへ設定。両端の国家の免許を要求し、無免許のルート作成と道路権購入が失敗することを確認。
- キューバの既存Santiagoとチリの都市のID衝突を実装時に発見。チリは`santiagodechile` / `Santiago de Chile`に分離し、既存都市を上書きしていないことをテストした。
- 都市・道路の地図座標、道路沿いの補間位置は既存Natural Earth地形との回帰テスト対象。海上ネットワークの再生成は行わず、既存66港間の距離・航海時間を維持。

選定の背景として参照した公開資料（本文・画像は同梱しない）：

- UNESCO Silk Roads Programme, [Cities along the Silk Roads](https://en.unesco.org/silkroad/silk-road-themes/cities-silk-roads)：交易都市のネットワークとしての位置づけ。
- UNESCO, [Asante Traditional Buildings](https://whc.unesco.org/en/list/35)：Kumasi周辺とAsanteの歴史的な中心地。
- Ghana Commission for UNESCO, [World Heritage Sites](https://unescoghana.gov.gh/world-heritage-sites/)：沿岸交易施設とAsante文化の背景。
- UNESCO, [City of Potosí](https://whc.unesco.org/en/list/420)：銀鉱業都市としての選定。
- UNESCO, [Historic Centre of Lima](https://whc.unesco.org/en/list/500/)：植民地都市としての選定。

## 保存互換性

v11の検証器とデータ依存を`legacy/*-v11.js`へ凍結。旧版は必ずこの検証器を通し、v12移行で新都市・道路・外交だけを追加する。既存会社の現金、会計、研究、船名、船と馬車の貨物・運行残日数、時刻表、旧市場、道路投資、世界と会社の乱数を変更しない。

保存はv12へ分離し、v11以下と旧保全保存は残す。`preserved.continents`へ更新前の正常なJSONを一度だけ保全。現行保存を繰り返し読んでも追加処理や補填は繰り返さない。移行後の市場やAI・外交の推移は旧版と異なる。

## 検証

- `tests/continental.test.js`：5件成功。44都市のID・産品・沿岸接続、59道路の距離・両国免許、旧セーブの状態保持、全59区間の400日運行（各区間2回以上到着）、会計整合、プレイヤー59路線・ライバル各50路線以下、地域別一覧、6言語。
- 既存land / region / world / city-revision / mapの対象実行：37件成功。10年間の3シード、世界海路、地形上の道路描画・補間、旧版移行、ライバル上限を含む。
- 表示文言を世界の陸上交易へ更新した後のlocalizationテスト：2件成功。
- ブラウザ：専用ポート4183。清の免許購入、地図上で景徳鎮 → 杭州 → 寧波 → 杭州の巡回選択、馬車の必要購入資金600・残金4,100表示、開設、16倍速で1,114日／111到着、手動保存・ページ再読込・復元、地域別道路の展開と個別費用の表示を確認。警告・エラーなし。利用者の4176の画面には変更を加えていない。
- `benchmark-world.mjs`：201プレイヤー航路と、初期各50航路・150隻のライバル3社で365日。p95更新21.88 ms、最大184.56 ms、保存＋検証77.94 ms、保存1,025,278 bytes。既定のp95 50 ms・保存1秒基準を通過。全体テストと同時実行した端末上のNode計測であり、ブラウザFPSではない。詳細：`continental-scale-results.json`。
- 全体回帰テストの結果は`continental-full-test-results.txt`に記録。

スクリーンショット：`screenshots/continental-trade.png`。

長期試験の途中で道路検索の全走査を発見し、道路の両方向索引へ変更。運行・距離・通行料の結果は変えずに繰り返し検索の配列生成を除去した。最初の全体試験はシード1の50年完走後に中断し、最終コードで全件を再実行した（中断ログはcontinental-before-index.log）。追加5件は索引変更後にも全件成功。

ブラウザの追加確認：漢口から長沙へのドラッグで、陸上交易・馬車が自動選択され購入費600の開設画面を表示。地域・個別道路の折り畳み展開状態も別の描画後に保持。確認用タブと4183のサーバーを終了し、利用者用4176はHTTP 200で稼働を確認した。

索引化前後のシード1・50年の報告値は、処理時間以外の全フィールドが一致（現金・資産・保有数・イベント・判断・競合結果・保存サイズ）。同一端末の所要時間は601.7秒から317.7秒へ短縮。ただし同時実行負荷を含む単一計測。

## 長期保存時の丸め誤差修正

全件実行は177/178成功し、50年キャンペーンのシード42で会社の残高検証が失敗。現金と費目別累計は加算順序が違うため、大規模残高の微小な誤差が固定許容値0.001を超えた。1億の入金後に0.01の維持費を50万回記帳する短い再現例では差が-0.0026821494となり、旧判定が正常な保存を拒否することを確認。

現行v12の保存検証を max(0.001, abs(cash) × 1e-10) の絶対・相対併用許容値へ変更し、既存長期試験の相対会計条件と合わせた。保存内の現金・累計・履歴は変更しない。50万回記帳後の完全一致による保存復元と、同残高で1.0、小規模残高で0.01の改変を拒否する回帰テストを追加。会計・旧保存保全・新道路の関連8件は全件成功。未完了だったシード42・1700の50年試験は修正後に個別再実行する。

v10→v11の移行ヘルパーも凍結カタログへの委譲へ変更し、直接呼び出しても新内陸都市が旧市場に混入しないようにした。直接呼出しで68都市・v11の検証成功を確認。

## 最終結果

修正後のシード42・1700がそれぞれ18,250日（50年）と50回の年次復元を完了。シード1を含め3シードすべて完走し、未解決の失敗はない。シード42の最終現金937,681.60、シード1700は1,129,586.07。全体実行の失敗ログは経緯として残し、解消確認はcontinental-recovery-final.log、continental-campaign-42.json、continental-campaign-1700.jsonへ分けて保存。最終コードで全件を再度一括実行したという意味ではなく、既存178件と追加会計回帰1件を全体実行＋修正箇所の再実行で確認した。集約はcontinental-validation-summary.json。
