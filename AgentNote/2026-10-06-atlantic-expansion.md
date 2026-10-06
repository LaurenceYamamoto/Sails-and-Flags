# 西欧・バルカン・北欧・アフリカ・南北アメリカの都市拡充

2026-10-06。3.3.1からの追加実装。バージョン番号とGitHub公開は今回の変更対象外。

## 追加した都市

| 地域 | 追加数 | 都市（無印は港・河港） |
| --- | ---: | --- |
| 西ヨーロッパ | 28 | Seville、Valencia、Bilbao、Zaragoza（内陸）、Salamanca（内陸）、Coimbra（内陸）、Bordeaux、Lyon（内陸）、Toulouse（内陸）、Rouen、Lille（内陸）、Brest、Strasbourg（内陸）、Bristol、Plymouth、Liverpool、Edinburgh、Glasgow、York（内陸）、Dublin、Cork、Milan（内陸）、Turin（内陸）、Florence（内陸）、Rome（内陸）、Naples、Palermo、Cagliari |
| バルカン半島 | 5 | Sarajevo（内陸）、Sofia（内陸）、Thessaloniki、Athens、Ragusa |
| スカンジナビア | 5 | Bergen、Christiania、Gothenburg、Trondheim、Turku |
| アフリカ | 16 | Tunis、Algiers、Tripoli、Gorée、Saint-Louis、Accra、Benin City（内陸）、Benguela、Sofala、Quelimane、Mbanza Kongo（内陸）、Timbuktu（内陸）、Djenné（内陸）、Gondar（内陸）、Massawa、Kilwa |
| 南北アメリカ | 20 | Philadelphia、Annapolis、Port Royal (Acadia)、Pensacola、St. Augustine、Mérida（内陸）、Santiago de Guatemala（内陸）、Zacatecas（内陸）、Guanajuato（内陸）、Caracas（内陸）、Cayenne、Paramaribo、Guayaquil、Trujillo（内陸）、Arequipa（内陸）、La Paz（内陸）、Asunción（内陸）、Recife、Belém、Concepción |

74都市の内訳は46港・28内陸都市。世界合計209都市（119港・90内陸都市）、39免許主体、202道路。新道路は101本。競合14社・初期21交易路・34隻は従来の構成を維持。

免許主体を追加：スコットランド、サヴォイア公国、教皇領、ラグサ共和国、ベニン王国、コンゴ王国、トンブクトゥ・パシャ領、エチオピア帝国。

## 設計上の判断

- 西欧は既存のMadrid・Paris・London等を残し、Bordeaux・Lyon・Bristol・Milan・Rome等の主要拠点を追加。内陸都市を港や隣接地域へ接続した。バルカンは5都市に抑え、Belgrade・Bucharest・Istanbulへ接続。
- アフリカでは北岸、セネガル、ギニア湾、コンゴ、モザンビーク沿岸、ニジェール内陸、エチオピア高地を補完。アメリカでは大西洋岸・メキシコ銀産地・中央アメリカ・アンデス・ブラジルを補完した。
- 1700年ごろの所属をゲーム用に簡略化。Scotlandはイングランドと別免許、Milan・Naples・Palermo・Cagliariはスペイン、ノルウェーの港はデンマーク、Turkuはスウェーデン。Accraは複数国の砦・交易拠点を代表するChristiansborgのデンマーク免許とし、市域の排他的支配の再現ではない。北アフリカのオスマン宗主権も既存免許へ集約する。
- Guatemalaは現在のGuatemala Cityではなく、旧都Santiago de Guatemala（Antiguaの位置）。Port RoyalはAcadiaと明記し、ジャマイカの同名都市と区別する。道路の距離・山道の補正・途中の小領邦は近似モデル。
- 特産は地域の生産適性へ反映し、Zacatecas/Guanajuatoの銀、Accra/Sofalaの金、Lyon等の絹を設定。欧州の香辛料等は生産ゼロを維持し、全都市・全品目の消費需要は正とする。新しい交易品や金融要素は追加していない。

## 地図・海路での発見と対応

新港を既存メッシュの最寄り点へ接続する初期生成で、Port Royalが孤立したメッシュ点に接続され、外洋への経路が存在しない問題を発見。外洋側の連結成分を幅優先探索で識別し、そこに属する点への水上接続だけを採用した。46港の固定接続をソースへ保存し、実行時の探索コストを増やさない。各港は一本の枝として追加するため、古い港同士の近道は生まれない。

Seville・Bordeaux・Rouen・Bristol・Glasgow・Christiania・Trondheim・Philadelphia・Annapolis・Belémには河口・湾・フィヨルドの接近経路を指定。これらは詳細な河道の航行可能性まで再現せず、既存の粗い海上メッシュへ接続する近似である。沖合の全経路は陸地を横切らないことを検査する。

新都市の表示だけをビルド時に陸上へ補正し、全周辺都市との間隔をSantiago de Chile―Valparaíso以上とした。今回12都市を補正、最大変位0.35 SVG単位（Seville）。経緯度、経済上の距離、旧都市の配置は不変。マーカー・都市名・カメラ・ルート/道路端点・船車両表示を同じ補正座標に揃えた。

## 保存移行

city_version=4（209都市・39国家・202道路）。旧0/1/2/3の都市数114/115/116/135と国家数23/23/23/31を検証し、末尾追加で移行。国際関係の追加は移行元の国家数を使い、3.3.0以前と3.3.1の双方からの移行で重複を防いだ。資金・運行・投資・戦争・乱数は維持する。

3.3.1のビルド済みWasmから事前に保存した31日目の実ファイルを新エンジンで読み込み、旧部分の全項目が厳密一致することを確認。さらに31日進行、再保存・再読込に成功。旧world.jsonとの比較で最初の135都市・31国家・101道路・全旧都市間距離・全旧海路形状が一致した。

## 検証

- Wasmリリースビルド成功。
- 追加地域の5テストと既存の欧州/港テストを合わせた12テスト成功。46新港の全世界への到達性、沖合経路、表示間隔、市場・道路、旧保存、不正保存のロールバック、5地域10ルートの90日運転・保存復元を検証。
- 独立した確認用ポート4206のブラウザでBordeauxの市場・国家、8追加免許を表示。都市名のドラッグでBordeaux→Toulouseを選び、フランス免許取得・馬車購入・ルート開設に成功。
- Seville名のクリックとSeville→Cadiz名へのドラッグも成功。表示補正が都市選択や経路設定を壊さないことを確認。
- ブラウザの警告・エラーなし。ユーザーの4176のセーブには触れずに検証。
- [確認画像](2026-10-06-atlantic-expansion.png)。

## 参考資料・依存関係

地図座標と交易圏はゲーム用に編集したデータで、追加の外部ライブラリ・地図素材は使用していない。ExternalLibrary.mdの依存・ライセンス一覧は変更不要。

- Scotlandの連合時期：[UK Parliament — The Articles: constitution and trade](https://www.parliament.uk/about/living-heritage/evolutionofparliament/legislativescrutiny/act-of-union-1707/overview/the-articles-constitution-and-trade/)。
- Gondar：[UNESCO — Fasil Ghebbi](https://whc.unesco.org/en/list/19)。
- Saint-Louis：[UNESCO — Island of Saint-Louis](https://whc.unesco.org/en/list/956)。
- Gorée：[UNESCO — Island of Gorée](https://whc.unesco.org/en/list/26/)。

最終確認：npm test 全69件成功（失敗0、50年間の複数会社運転を含む）。JS構文・文字化け・git diff --checkも成功。ビルド済みWasmは約8.0 MB（追加前約4.3 MB）で、増加分の主因は事前計算した港間経路。実行時の会社数と競合各50ルート上限は維持。

## 3.3.2公開への更新

ユーザー指定により3.3.2として公開する。npm・Cargo・画面・ビルド定義とドキュメントの現行版表記を更新。旧版の記録は維持し、Wasm再ビルドとテスト後にmainと保存用ブランチ3.3.2を同一コミットでpushする。

3.3.2の再ビルド成功。直前の全69件成功に加え、公開用Wasmの境界・バイナリ整合性・追加都市・航路・旧保存移行の8件を再実行し全件成功。差分空白検査も成功。
