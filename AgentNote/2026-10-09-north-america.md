# 北米・メキシコ北方の交易網

## 追加内容

推奨した北米4都市と、メキシコ北方の4都市を追加した。York Factoryについては任意の追加範囲確認を提示したが返答がなく、今回は推奨8都市を実装した。Michilimackinacは河川・湖沼交通の将来候補のままとする。公開バージョン3.3.8を維持し、Gitへのコミット・プッシュは行わない。

| 都市 | 免許主体 | 生産品目 | 輸送 |
|---|---|---|---|
| Vincennes | フランス | 毛皮・食料 | 陸路 |
| Kaskaskia | フランス | 食料 | 陸路 |
| Louisbourg | フランス | 食料（漁業を集約） | 海路 |
| St. John’s | イングランド | 食料（漁業を集約） | 海路 |
| Durango | スペイン | 銀 | 陸路 |
| Chihuahua | スペイン | 銀・食料 | 陸路 |
| El Paso del Norte | スペイン | 食料 | 陸路 |
| Santa Fe | スペイン | 織物・食料 | 陸路 |

| 陸路 | 距離 | 地形 |
|---|---:|---|
| Detroit–Vincennes | 650km | 丘陵 |
| Vincennes–Kaskaskia | 260km | 平地 |
| Kaskaskia–New Orleans | 1,400km | 平地 |
| Zacatecas–Durango | 310km | 丘陵 |
| Durango–Chihuahua | 700km | 丘陵 |
| Chihuahua–El Paso del Norte | 380km | 平地 |
| El Paso del Norte–Santa Fe | 550km | 丘陵 |

Detroit–New Orleans方面は水陸複合の交易を陸路に集約するゲーム上の近似。距離はこの暫定陸路としての近似で、史実の河川航行距離ではない。メキシコ北方はCamino Real de Tierra Adentroを集約したものであり、19世紀の米国東方からのSanta Fe Trailではない。後世の領有変化・建設年イベントは追加しない。

## 実装上の配慮

- 新都市・道路を既存スロットの末尾へ追加。city_version=22、旧21は312都市・346道路で検証し、新8都市・7道路だけ初期化する。国家数と外交状態は維持。
- 海上対応はLouisbourg・St. John’sのみ。各港を既存海洋グラフの1点だけに接続し、既存港間の新たな近道を発生させない。
- Vincennesは緯度だけの適性判定では毛皮が0になるため明示例外に追加。Durango・Chihuahuaも銀産地リストへ明記。
- 都市数を増やすためだけの小さな中継市場は作らず、経由点を利用。都市の最小表示間隔はSantiago de Chile–Valparaíso基準、全7新道路の表示線分を陸地判定。
- 各市場で全品目の需要を維持し、香辛料・茶・コーヒーの生産は0。隣接市場を同一の生産構成だけにせず、食料と毛皮・銀の地域差を持たせる。

## 検証記録

- データ出力時に7新道路すべての陸地検証が成功。
- 変更前世界データと比較し、既存312都市・346道路・国家・既存全海上経路・距離が一致。
- `npm run build:wasm`成功。
- `node --test --test-concurrency=2 tests/north-america.test.js tests/american-interior.test.js tests/french-caribbean.test.js tests/wasm-boundary.test.js`：14/14成功。
- 全新港と全既存港の航路到達・距離対称性・沖合線分の水域判定を確認。
- 新7陸路、2港からLondonへの海路、Detroit–New Orleans方面とZacatecas–Santa Fe方面の往復巡回の計11ルートを744日進行し、全ルートで配送を確認。免許不足・輸送モード不一致の拒否、道路投資、競合50ルート上限、保存再読込を確認。
- 旧21保存の既存状態保持、一度だけの追加初期化、欠損・将来保存の拒否を確認。旧20および223都市時点の保存の回帰テストも通過。
- `git diff --check`成功。全テスト一括実行とブラウザ目視は未実施。既存ブラウザの進行状態を変更せず、独立Wasmテストを使用した。

## 参考資料

- [Indiana Historical Bureau: Wabash River](https://www.in.gov/history/state-historical-markers/find-a-marker/the-wabash-river/)
- [Canadian Museum of History: Pays d’en Haut and Louisiana](https://www.historymuseum.ca/virtual-museum-of-new-france/population/pays-den-haut-and-louisiana/)
- [Parks Canada: Louisbourg](https://www.pc.gc.ca/lhn-nhs/ns/louisbourg/info/plan/plan-2024)
- [Newfoundland and Labrador Heritage: settlement patterns](https://www.heritage.nf.ca/articles/exploration/settlement-patterns.php)
- [UNESCO: Camino Real de Tierra Adentro](https://whc.unesco.org/en/list/1351)
- [NPS: History and Significance of El Camino Real](https://www.nps.gov/articles/000/history-and-significance-of-el-camino-real-de-tierra-adentro.htm)
