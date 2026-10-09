# アジア・アフリカの15交易都市（2026-10-09）

## 対象と実装

ユーザーが承認した15都市を追加。Cebu、Ternate、Peshawarなどは今回の対象外。公開バージョンは3.3.8を維持し、内部データ形式のみcity_version=18へ進めた。

| 都市 | 種別 | 免許主体 | 市場の特徴 |
|---|---|---|---|
| Ambon | 港 | オランダ | 香辛料・木材 |
| Banda Neira | 港 | オランダ | 香辛料 |
| Syriam | 港 | タウングー朝ビルマ | 食料・木材 |
| Ava | 内陸 | タウングー朝ビルマ | 綿花・織物 |
| Thatta | 内陸 | ムガル帝国 | 織物・藍 |
| Lahori Bandar | 港 | ムガル帝国 | 食料・インダス河口の積出港 |
| Tiflis | 内陸 | サファヴィー朝 | 絹・工具 |
| Yerevan | 内陸 | サファヴィー朝 | 綿花・食料 |
| Jeddah | 港 | オスマン帝国 | 輸入港・低い地元生産 |
| Agadez | 内陸 | アイル・スルタン国 | 工具・隊商の消費市場 |
| Kano | 内陸 | カノ王国 | 織物・綿花 |
| Suakin | 港 | オスマン帝国 | 紅海の輸入・積出港 |
| Sennar | 内陸 | フンジ・スルタン国 | 食料・綿花 |
| Mecca | 内陸 | オスマン帝国 | 食料基礎需要×1.8、織物×1.5、地元生産は少量 |
| Medina | 内陸 | オスマン帝国 | オアシスの食料供給と消費市場 |

世界304都市（137港・167内陸）、52国家、20品目、332道路スロット（有効314・廃止18）。14競合の初期設定と各社50ルート制限は維持。

## 陸上接続

| 区間 | km | 地形 |
|---|---:|---|
| Syriam–Ava | 690 | 平地 |
| Multan–Thatta | 900 | 平地 |
| Thatta–Lahori Bandar | 70 | 平地 |
| Tabriz–Yerevan | 330 | 山地 |
| Yerevan–Tiflis | 280 | 山地 |
| Timbuktu–Agadez | 1450 | 丘陵 |
| Agadez–Kano | 750 | 平地 |
| Sennar–Suakin | 850 | 丘陵 |
| Jeddah–Mecca | 85 | 丘陵 |
| Mecca–Medina | 450 | 丘陵 |
| Medina–Damascus | 1450 | 丘陵 |

距離・地形・安全性はゲーム用近似。河川沿いの輸送はユーザー方針どおり陸路へ抽象化。Tabuk、Ma'anなどの宿駅や通過地は経由点に留め、市場・荷役地点を増やしていない。国境を越える道路では両国の免許が必要。Timbuktuの既存免許主体はモロッコではなくトンブクトゥ・パシャ領（arma）であることを確認し、道路にも反映。

6港には既存海洋網への単一接続を追加。世界の既存港との航路を計算できる。外洋の接続は陸地と交差しないことを検証し、港座標から最初の海上点までは既存方式の港内接近区間として扱う。

## 地理・歴史の近似と発見課題

- Tiflisは1700年前後のKartliのサファヴィー朝への従属を、同朝の通商免許に抽象化。独立国家としての追加やロシア領への分類はしない。ヒジャーズもオスマン免許に抽象化。
- Kanoを後世のSokotoに、Sennarをオスマン領にしない。ビルマ・アイル・カノ・フンジの4免許主体を末尾へ追加。
- Lahori Bandarの正確な遺跡位置には議論があるため、インダス河口の概略位置（67.42E, 24.52N）を採用。正確な考古学的位置の再現は主張しない。
- Banda Neiraは基図の簡略化で省略されていた。独自の小さな島の概略輪郭をsrc/map-land.jsに追加し、描画と陸水判定の両方で同じ輪郭を使用。元のNatural Earthデータは改変しない。
- Lahori BandarとMeccaは近隣都市との最小表示間隔に従って表示のみ補正。Lahori Bandarでは補正後の道路端点へ水面を横切らず接続する経由点を設定。MeccaのラベルはJeddahとの重なりを避けて下側へ配置。
- 全15都市でSantiago de Chile–Valparaíso以上の表示間隔を検証。補正は地理座標・航路距離・費用・時間を変えない。
- 香辛料の既存生産許可リストにAmbon・Banda Neiraを追加。Yerevanの綿花は既存の緯度40度上限によりゼロとなる問題を検出し、地域適性を個別に認めた。他の都市の生産は変更しない。
- メッカの需要は静的な基礎需要係数であり、巡礼の季節イベントではない。全都市・全品目に消費需要を持たせた。

## 保存・既存データ

旧17の289都市・321道路・48国家、および旧14〜16の48国家を明示して検証する。新市場・道路・都市開発・外交配列・国家間関係だけを補う。既存のインデックス、会社・車両・ルート・乱数状態を保持。追加免許への友好度は60、日額投資は0。再ロードで再初期化しない。不正・欠損・未知の将来形式は拒否する。

比較用に変更前3.3.8のWasmと世界データをignored target領域へ保存し、既存289都市・321道路・48国家と全8,515港ペアの距離・描画経路の完全一致を検証した。

## 参考資料

文章・図版は転載せず、史実の確認とゲーム設定の参考に用いた。

- [UNESCO: Spice Trade Route on XIII–XVIII AD（暫定リスト）](https://whc.unesco.org/en/tentativelists/6828)：香料交易網、AmbonとBanda。
- [Dutch in 17th-century Burma](https://www.burmalibrary.org/sites/burmalibrary.org/files/obl/docs/Dutch_in_17CBurma.htm)：Syriam、Avaの交易拠点。
- [Macao文化局：ThattaとLahori Bandar](https://www.icm.gov.mo/rc/viewer/20013/959)：港と内陸市場の関係。
- [Encyclopaedia Iranica: Abbas-Qoli Khan](https://www.iranicaonline.org/articles/abbas-qoli-khan/)：Kartliの従属王とTiflis。
- [UNESCO: Historic Jeddah](https://whc.unesco.org/en/list/1361/)：インド洋交易とMeccaへの玄関港。後世の建築を1700年へ遡及しない。
- [Khalili Collections: Hajj and the Arts of Pilgrimage](https://khalilicollections.org/all-collections/hajj-and-the-arts-of-pilgrimage/)：Damascus方面の巡礼隊商。
- [UNESCO: Historic Centre of Agadez](https://whc.unesco.org/en/list/1268)：隊商交易の拠点。
- [UNESCO: Ancient Kano City Walls（暫定リスト）](https://whc.unesco.org/en/tentativelists/5171/)：KanoとKurmi市場。
- [The Ottoman Port of Suakin](https://doi.org/10.5871/BACAD/9780197264423.003.0024)：オスマン期の紅海港。
- [Annales islamologiques: Sudan trade](https://www.persee.fr/doc/anisl_0570-1716_1979_num_15_1_983?pageId=T1_212)：SennarとSuakinの交易。

## 検証

- npm run build:wasm 成功。配布Wasmとソースのハッシュ一致・JSゲームコールバック不使用を検証。
- trade-hubs / central-asia / europe-expansion / japan-expansion / manchuria-korea / silk-road / wasm-boundary の関連27テストが修正後に通過（複数回の実行を通算した重複なしの件数）。最終ビルド後には地形・経済・Wasm境界の5テストも再確認。
- 新規11陸路と6海路すべてで744日間に配送。必要免許、海陸の区別、道路投資、保存再読込、競合50ルート制限を確認。
- 旧14・15・16・17および3.3.0/3.3.6形式の移行を確認。既存配列長を仮定していたテストの固定値を更新。
- 変更前3.3.8の実Wasmで31日進行したセーブを移行し、追加領域を除いた全状態の完全一致を確認。移行後さらに31日進行し、保存・再読込で完全一致。
- 全既存8,515港ペアの距離・経路、289都市・321道路スロット・48国家の不変を確認。
- ブラウザで追加都市の選択、Mecca周辺の道路、拡大表示を確認。拡大時の陸路破線にnon-scaling-strokeを適用し、都市名の個別配置をズーム時にも維持。コンソール警告・エラーなし。
- git diff --check、変更した描画JSの構文確認に合格。全npm testの一括実行は行っていない。
- スクリーンショット：2026-10-09-trade-hubs.jpg。
