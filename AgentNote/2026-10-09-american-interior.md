# Vila Rica・Detroitと陸上交易路

## 範囲

ユーザー指定により、河川交通がない現段階ではDetroit–Montreal / Albanyを陸路として実装する。Vila RicaはRio de JaneiroとSao Pauloへ接続する。新規市場は2都市のみ。公開バージョン3.3.8を維持し、リリース・Git pushは行わない。

| 都市 | 国 | 生産 | 地理座標 |
|---|---|---|---|
| Vila Rica | ポルトガル | 金 | -43.50, -20.39 |
| Detroit | フランス | 毛皮 | -83.045, 42.331 |

Detroitの1701年成立、Vila Ricaの18世紀初頭の発展をシナリオ開始時から利用可能な市場に集約。地域の生産と輸入需要を表現し、全品目の正の需要を維持する。地理座標・道路距離・生産量は精密な歴史復元ではない。

| 陸路 | 距離 | 地形 | 必要免許 |
|---|---:|---|---|
| Vila Rica–Rio de Janeiro | 520km | 山地 | ポルトガル |
| Vila Rica–Sao Paulo | 650km | 山地 | ポルトガル |
| Detroit–Montreal | 1,100km | 丘陵 | フランス |
| Detroit–Albany | 1,050km | 丘陵 | フランス・イングランド |

Vila Rica–RioはCaminho Novo方面、Sao Paulo方面は内陸への往来を集約。Detroit方面は歴史的な水陸複合交易を現行の陸路へ置換したゲーム上の近似であり、史実にそのままの長距離街道があったとするものではない。地図上では五大湖を横断しない経由点を使用する。河川輸送・専用船・積み替え機構は追加しない。

## 発見と修正

- 既存の生産適性ではVila Ricaの金が0、緯度42度のDetroitの毛皮も0になるため、金産地リストと毛皮供給地域の明示例外へ追加した。他都市の生産は維持する。
- 新道路の地形検証でRioの点が簡略地図の湾内、Montreal周辺の線分が水面を横断することを検出。Rioを西へ約0.08度、Montrealを北へ0.24度の表示補正とし、接続する道路の表示端点も追従させた。都市の実座標、距離、費用や既存保存には影響させない。
- 2都市にはSantiago de Chile–Valparaíso基準の表示間隔検証を適用する。

## 保存と既存世界

city_version=21。旧20（310都市・342道路）を受理し、追加市場・開発・道路のみ初期化する。旧19以下も既存の段階別サイズを維持する。現在312都市・52国家・346道路スロット（有効328・廃止18）、港数137。

変更前のworld.jsonと比較し、既存都市の実座標・市場、国家、道路の距離・地形・免許、全海上距離・航路形状が一致することを確認。例外はRio / Montrealの表示位置と接続する既存3道路の表示端点のみ。

## 検証

- Wasmビルド成功。4本の新道路は表示端点を含む全線分の陸地判定を通過。
- `node --test --test-concurrency=2 tests/american-interior.test.js tests/caspian.test.js tests/wasm-boundary.test.js tests/atlantic-expansion.test.js`：14/14成功。
- 新4路線を744日進行させ、すべてで配送を確認。免許不足と船による開設は拒否され、道路投資・既存50ルート制限・保存再読込が動作する。
- 旧20保存の既存状態保持と一度限りの追加初期化、欠損・将来形式の拒否を確認。旧19および3.3.1相当の保存移行テストも通過。
- 独立Wasmの検証を使用し、既存ブラウザのゲームは再読み込みしていない。ブラウザ目視と全テスト一括実行は未実施。
- `git diff --check`成功。

## 参考資料

- [Estrada Real](https://institutoestradareal.com.br/estrada-real/)：Vila RicaとRio方面の金の輸送。
- [Detroit市の歴史](https://detroitmi.gov/departments/detroit-history)：1701年のフランス交易拠点。
- [カナダ歴史博物館の毛皮交易解説](https://www.historymuseum.ca/virtual-museum-of-new-france/economic-activities/fur-trade/)：MontrealからDetroitへの交易。今回はユーザー指定により陸上輸送へ近似。
