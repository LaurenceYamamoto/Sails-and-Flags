# シベリア毛皮交易路の追加（2026-10-06）

## シベリアの毛皮交易路（2026-10-06）

14内陸都市と17道路を追加し、Moscow―Kazanからウラル・シベリア・モンゴルを経由して北京へ至る交易網を接続しました。世界は223都市（119港・104内陸都市）・39国家・219道路です。既存のロシアと清の免許を使用します。

幹線：Kazan → Kungur → Tyumen → Tobolsk → Tara → Tomsk → Krasnoyarsk → Irkutsk → Verkhneudinsk → Kyakhta → 庫倫（Urga）→ 張家口（Kalgan）→ 北京。Yeniseysk・Kirensk・Yakutskを結ぶ集荷路もあります。既存の北京から中国内地、Moscowから欧州の路網へ接続します。

シベリアの毛皮生産と茶・織物・工具等への需要を設定。北方内陸の新都市では茶・絹・陶磁器を現地生産せず、既存の中国側産地から輸送します。国境区間には両国の免許が必要です。各道路は既存の馬車・キャラバンの航続範囲で運行でき、山道とゴビ砂漠は既存の地形・乾燥路のルールを使います。中継地の消費もあるため、遠方へ転送するには供給側の輸送能力を確保する必要があります。

Kyakhta交易は1727年以降の発展を含む18世紀の交易網として、シナリオ開始時から利用可能にしました。都市の年代別解禁、河川舟運や橇の独立した輸送方式は実装せず、河川沿い・陸路・冬道を代表する陸上輸送に簡略化しています。既存セーブの市場・会社・外交等を保持し、新都市と道路を追加します。


## 都市

| 都市 | 免許 | 主な生産品ID |
| --- | --- | --- |
| Kungur | ロシア | food, tools |
| Tyumen | ロシア | fur, cloth |
| Tobolsk | ロシア | fur, timber |
| Tara | ロシア | fur, food |
| Tomsk | ロシア | fur, timber |
| Krasnoyarsk | ロシア | fur, timber |
| Irkutsk | ロシア | fur, food |
| Verkhneudinsk | ロシア | food, fur |
| Kyakhta | ロシア | food, cloth |
| 庫倫 | 清 | food |
| 張家口 | 清 | cloth, food |
| Yeniseysk | ロシア | fur, timber |
| Kirensk | ロシア | fur, timber |
| Yakutsk | ロシア | fur |

庫倫はUrga、張家口はKalgan。中国側の都市はユーザーの方針に沿って漢字で表示する。Verkhneudinskは後年のUlan-Udeの名称を使わない。

## 道路

| 区間（都市ID） | km | 地形 |
| --- | ---: | --- |
| kazan ↔ kungur | 950 | hill |
| kungur ↔ tyumen | 650 | mountain |
| tyumen ↔ tobolsk | 250 | plain |
| tobolsk ↔ tara | 650 | hill |
| tara ↔ tomsk | 900 | hill |
| tomsk ↔ krasnoyarsk | 600 | hill |
| krasnoyarsk ↔ irkutsk | 1100 | hill |
| irkutsk ↔ verkhneudinsk | 500 | mountain |
| verkhneudinsk ↔ kyakhta | 240 | hill |
| kyakhta ↔ urga | 350 | hill |
| urga ↔ kalgan | 1150 | hill / arid |
| kalgan ↔ beijing | 220 | mountain |
| tomsk ↔ yeniseysk | 750 | hill |
| yeniseysk ↔ krasnoyarsk | 340 | hill |
| yeniseysk ↔ kirensk | 1250 | hill |
| irkutsk ↔ kirensk | 1000 | hill |
| kirensk ↔ yakutsk | 1950 | hill |

区間距離は史実の道程測量値ではなくゲーム用の近似。Irkutsk―Verkhneudinskはバイカル湖南岸を回り、Kyakhta―Urgaがロシア・清の免許を要する国境区間。Urga―Kalganはゴビの乾燥路。Yeniseysk/Kirensk/Yakutsk方面の河川輸送・曳船・冬道も現行の陸上輸送に統合し、新しい船種や季節の道路閉鎖は追加しない。

## 発見と実装判断

- 既存の経度主体の需要分類ではシベリアが南アジア・東アジアになり、東経100度以東の茶・絹生産も発生し得た。新都市に市場圏・気候・北方内陸生産区分を明示し、既存209都市の基礎値は変えずに対応。
- Kyakhtaは主要な取引拠点だが、輸送品を現地生産として生成しない。Verkhneudinsk等から流入する毛皮は、まず現地需要を満たす。そのため集荷側1台と国境側1台の試行では国境での毛皮取引が発生しなかった。集荷側8台・国境側4台で供給能力を増やすと、372日で庫倫への毛皮売却を確認した。中継消費と輸送能力の既存ルールを維持する。
- 新都市の追加によって既存の都市・国家・道路番号は変えない。シベリアは全都市が内陸なので海路メッシュを拡張せず、旧海路・距離を完全維持する。
- 最小表示間隔はSantiago de Chile―Valparaíso以上。表示位置補正は新都市にも適用可能とした。

## 検証

- リリースWasmビルド成功。新都市・道路の接続、供給適性、表示間隔、両国免許、旧保存移行、不正保存の状態保全をテスト。
- 全17区間と再訪を含む国境巡回路をキャラバンで開設し、400日進行・保存復元に成功。
- 毛皮だけを積む集荷路Verkhneudinsk―Kyakhtaと国境路Kyakhta―庫倫を372日運転し、庫倫での毛皮の荷降ろし・売却を帳簿で確認する専用テスト成功。
- 変更前の3.3.2実Wasmで生成した31日目の保存を移行。新都市と道路を除く全項目が厳密一致し、さらに31日進行・保存・読込成功。旧world.jsonとの比較で209都市・39国家・202道路と全海上経路・旧都市間距離が一致。
- 別ポート4207でブラウザ確認。Kyakhtaと庫倫の都市名ドラッグ、両免許不足で開設できない表示、ロシアと清の免許取得、£900のキャラバン購入とルート開設を確認。

## 参考資料

歴史事項を設計の参考とした。文献の本文・画像・地図データはゲームに取り込んでいない。新しい外部ライブラリはなく、ExternalLibrary.mdの変更は不要。

- [Library of Congress — The Russian Discovery of Siberia](https://www.loc.gov/collections/meeting-of-frontiers/articles-and-essays/exploration/russian-discovery-of-siberia/)：毛皮を求めたシベリア進出、Tobolsk・Tomsk・Yeniseysk・Irkutskから北京への行程。
- [Michal Wanner, The Russian-Chinese Trade in Kyakhta, Its Organisation and Commodity Structure, 1727–1861 (2014)](https://dspace.cuni.cz/handle/20.500.11956/96411?show=full)：毛皮などのロシア側輸出、茶・織物等の中国側輸出と長距離輸送の制約。

今回は実装のみ。バージョン表示は3.3.2を維持し、GitHub公開・保存用ブランチ作成は行わない。

ブラウザの警告・エラーは0件。追加14都市の座標はすべて陸地上で最小間隔を満たすため、今回は表示オフセット不要。JS構文・文字化け・差分空白検査も成功。[確認画像](2026-10-06-siberian-trade.png)。

最終確認：npm testの回帰73件が全件成功（50年運転を含む）。実行開始後に追加した毛皮転送テスト1件も別途成功し、合計74件を確認。確認用タブ・サーバー4207は終了し、ユーザーの4176はHTTP 200で稼働中。
