# 長江の水路と都市を持たない河口

## 設定と地理の確認

利用者の指定した5都市を結ぶ水路を追加。上海追加の要否を選択式で質問し、回答がない間は推奨案の「都市を追加しない河口接続」を前提としていることを明示して実装した。上海を当時の交易都市として不適当と判断したわけではない。

- 揚州–南京、南京–漢口、漢口–宜昌、漢口–南昌、南昌–南京の5水路。既存の北米2水路と合わせて7本。
- 南昌は贛江・鄱陽湖を経て湖口付近で長江へ合流する。依頼文の洞庭湖とは異なるため、接続都市を維持しつつ鄱陽湖経由に修正した。
- 上海を追加せず揚州から河口、外洋メッシュの123°E・31°Nへ出る。河口には市場・都市開発・荷役・売買・寄港の機能を持たせない。
- 全区間でスループとスループ由来の設計船のみを許可。小型ジャンクなどの帆走商船を既存スループ枠で表す近似であり、欧州式スループが全区間を定期往来した証拠を意味しない。風待ち・曳航・季節水位の差はモデル化しない。宜昌より上流の峡谷を含む宜昌–重慶は陸路のまま。

## 実装と保存の安全性

`seaFromGateway`は既存メッシュ点から既存港までの線を生成するビルド専用処理。海洋網へ新しい辺を足さないため、既存港同士の距離・経路を変えない。河口から139港への線・合算距離を`waterAccess`としてWasmへ渡す。エンジン起動時の接続キャッシュが河川部分と統合し、毎日の探索は不要。描画は同じ線を使用し、逆向きの場合は線と各点列を反転する。河口経由の表示線は接続キャッシュより先に解決して再帰を防ぐ。

内部city_version=27。揚州–南京・漢口–宜昌だけを`retired_since=27`で退役させ、353道路のインデックスは保持する。有効陸路は330、都市320・国家52は変更なし。旧陸路を含むルートの車両は失わせず未配置へ戻し、積荷原価と道路権取得費・未使用投資金を返金する。読み込み前に全データを検証し、移行後にも再検証する。撤回版24/25の当時の検証には新しいwaterAccessを入れない。

`tests/fixtures/pre-yangtze-26.json.gz`はGitの正式3.3.12バイナリで作成・読み込み検証した人工セーブ。転換対象2陸路の輸送中車両・積荷・道路資本と、無関係なSt. John’s–Montréal航路を含む。返金£2,700、車両の保持、無関係な航路・市場・都市開発・RNGの不変、二重返金防止、不正な資本値を破棄前に拒否することをテストする。個人の保存データではない。

## 検証

- `npm run build:wasm`成功。
- `yangtze-waterways`、`water-connections`、`waterways`、`limited-waterways`、`wasm-boundary`、`asia-expansion`の24件がすべて成功。
- `wasm-core`から旧都市版の移行・破棄前検証・競合初期設定の4件を追加実行し成功。今回の実行合計は28件。全テストスイートの再実行はしていない。
- 変更した29本のJavaScriptファイルの構文検証と`git diff --check`が成功。
- 5水路と寧波から全5都市への両方向接続、船型制限、スループ設計への置換、距離不足の拒否、90日運行と配送・航行中保存復元を確認。
- 世界データを正式3.3.12と比較。都市・国家・商品・船型・競合初期設定・全外洋距離と描画線・既存2水路は完全一致。道路の変更は対象2本のみ。
- 別オリジンの検証用ブラウザで清免許取得後、寧波–宜昌をスループで開設。必要資金£1,800、距離1,021.1/1,800海里、開設後1隻・38日周期を確認。長江と河口をつなぐ地図線を目視。コンソール警告・エラーなし。利用者の127.0.0.1タブは変更していない。
- 画面記録：`2026-10-12-yangtze-waterways.png`。検証タブは終了。

## 参考資料

- [上海市公式：上海の概要](https://japanese.shanghai.gov.cn/ja-Overview/20250912/3558be628f46413abd10936c67784408.html) — 16世紀の綿業、1685年の税関設置。上海を1700年前後に交易上無意味だった都市と扱うことは避ける。
- [Reading late imperial Chinese merchant handbooks as global micro-history（Warwick）](https://wrap.warwick.ac.uk/id/eprint/170323/1/WRAP-Reading-late-imperial-Chinese-merchant-handbooks-global-micro-history-22.pdf) — 検索結果で確認した南昌・贛江・鄱陽湖・湖口の接続。全文取得はタイムアウトしており、全論文を精読したとはしない。
- [Rapids as Compasses（Cambridge）](https://www.cambridge.org/core/journals/international-journal-of-asian-studies/article/rapids-as-compasses-the-riverine-environment-experiential-knowledge-and-steam-navigation-on-the-upper-yangzi-river/18F355A7FE8180AE1E8D25626F32E084) — 宜昌より上流の急流・航行知識・曳航と蒸気航行の背景。主に後代を扱うため、18世紀の欧州式スループ航行の直接根拠とはしない。
- [A Port City in Northeast China: Dengzhou in the Long Eighteenth Century（Cambridge）](https://www.cambridge.org/core/journals/journal-of-the-royal-asiatic-society/article/port-city-in-northeast-china-dengzhou-in-the-long-eighteenth-century/74E598454EE3857A3E8B0A30AFBB9B2B) — 18世紀の山東・上海を含む帆走商船による沿海交易の背景。

資料の文章・図版・地図データの転載、外部ライブラリの追加はない。公開番号の更新・GitHubへのpushは今回の依頼に含まれないため行っていない。
