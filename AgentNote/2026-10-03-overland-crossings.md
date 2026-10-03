# エジプト・パナマの陸上連絡路

## 実装した内容

- 2.0.0-alpha.4 / 保存v13。Suez・Panama Cityを追加し、114都市（68港＋46内陸）・69道路。既存の23国家・20品目は維持。
- Alexandria–Cairoの225 kmにCairo–Suezの150 kmを接続。設定ボタンはAlexandria → Cairo → Suez → Cairoの巡回を作り、暗黙の帰着を含め全区間が道路で結ばれる。
- Portobelo–Panama CityはCamino Realをモチーフに100 km・山地として定義。港同士だが、ドラッグと巡回プレビューで陸上を初期選択する。
- 陸上交易画面に説明と2つの設定ボタン、地図に24倍の地域プリセットを追加。必要免許はエジプトがオスマン帝国、パナマがスペイン。道路開発権の購入は運行の前提ではない。
- 船便・馬車便は個別の交易ルートであり、港の共通市場を介して売却・再購入する。自社の荷物を保持した直送・専用倉庫・船の陸越え・運河は実装していない。各区間の採算によって出発を待機する場合がある。馬車は駄獣・隊商を含む陸上輸送のゲーム上の共通表現。

## 経路と保存の安全性

world-network.jsは変更せず、メモリ上のコピーに2ゲートウェイ・5接続辺を追加。接続先は既存メッシュの水上可視点を検証して定義し、起動のたびに海岸線との交差探索をしない。SuezはGulf of Suezの[33,29]へ、Panama Cityは太平洋側4点へ接続。港内の短い進入区間は他港と同じ近似で、実際の水深を再現しない。

既存66港間2,145組は凍結v12ルーターへ委譲し、距離・座標列を完全一致で維持。新港を含む133組を追加した全2,278組を検証。Suez–Alexandriaの海路は12,378海里、Panama City–Portobeloは10,741海里で、それぞれ喜望峰・南米南端を回る。Suez–Mochaは1,185海里、Panama City–Callaoは1,409海里。

v12実装の依存モジュールをlegacyへ凍結し、v1～v12を旧検証器で確認してから、2市場・2都市権・2道路権だけを追加する。既存会計・市場・外交・船・馬車・貨物・運行・道路投資・乱数は不変。保存先はv13とpreserved.crossingsに分離し、v12の3スロットとpreserved.continentsも選択できる。追加後の将来の市場・AI判断は変化しうる。

## 検証と発見事項

- 50年campaign.test.jsを除く全185件が成功（154.7秒）。既存の10年・複数シード試験を含む。50年試験は前フェーズで実施済み、今回は再実行していない。
- 新機能8件：免許と資金見積り、迂回海路、全旧港対の不変性、v12移行の追加部分を除く完全一致、保全保存、壊れた保存の拒否、陸路プレビュー、3シード×1年の6ルート同時運行と復元、馬車売却量と共有港在庫の増分一致。
- 海路の接続先を事前定義する最適化後、経路・地図・移行・翻訳の関連23件成功。地域プリセットの最終調整後も関連試験を再確認。
- 初回回帰では旧大陸交易テストのNew York–Albanyが400日で1到着となった。追加市場に伴う将来の市場・AIの変化により、最低利益率10%で帰路が正しく待機していた。道路運行そのものを検証する当該テストは最低利益率0%を明示し、到着2回以上・売上・会計・保存の検証は維持した。製品の初期利益率10%は変更しない。
- 初回回帰のv9移行比較は追加された2市場権・2道路権を期待値から除く処理が不足していたため修正。過去形式のJSONフィクスチャや旧検証器は変更しない。
- 内蔵ブラウザの分離サーバー4184で、免許不足の開設拒否、免許取得後の馬車600購入、両ルート開設、244日運行を確認。保存・再読込・再開で2台／2ルートと資金92,090.8を復元。Portobelo–Panama Cityのドラッグは既存ルートを選択し、地図の巡回選択もlandとなる。警告・エラーなし。
- スクリーンショット：screenshots/egypt-crossing.png、screenshots/panama-crossing.png。詳細ログはcrossings-regression-tests.log、crossings-feature-tests.log、crossings-final-tests.log（ローカルログはGit対象外）、検証要約はcrossings-validation-summary.json。
- ユーザーの4176の保存領域・タブを操作していない。作業用タブ・サーバーは検証後に終了する。コミット・pushは今回行わない。

## 背景資料・精度の範囲

- [UNESCO: Fortifications on the Caribbean Side of Panama, Portobelo–San Lorenzo](https://whc.unesco.org/en/list/135/)：Portobeloの交易港としての役割、Panama Cityと結ぶCamino Realの背景。
- [UNESCO: The Colonial Transisthmian Route of Panamá](https://whc.unesco.org/en/list/1582/)：植民地期の地峡横断交通と港湾の関係。
- [UNESCO: Ottoman Empire and Spice Routes in the 16th Century](https://en.unesco.org/silkroad/knowledge-bank/ottoman-empire-and-spice-routes-16th-century)：紅海を含む交易の歴史的背景。

道路の曲線・距離・地形係数・産品量はゲーム用の概算。特定年の実測道路、当時の全商流、駄獣の編成や国境を忠実に再現するものではない。資料本文・画像は転載せず、外部ライブラリも追加していない。
