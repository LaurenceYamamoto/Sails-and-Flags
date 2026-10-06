# Sails & Flags

西ヨーロッパ・バルカン・スカンジナビア・アフリカ・南北アメリカに74都市と101道路を追加しました。新しい港と内陸都市で交易・開発ができ、既存セーブも自動移行します。[追加一覧・検証記録](AgentNote/2026-10-06-atlantic-expansion.md)。

中央・東ヨーロッパに19都市と32道路を追加しました。Hamburg・Gdańsk・Königsbergの海上交易と、ドイツ圏・ハプスブルク領・ポーランドからロシア・オスマン方面へつながる陸上交易を利用できます。[詳細・検証記録](AgentNote/2026-10-06-central-europe.md)。

日本商人は大阪 ↔ 長崎と大阪 ↔ 江戸の2航路で開始します。LimaはCallaoと選び分けられるよう、表示だけを内陸側へ移動しています。[江戸・初期航路](AgentNote/2026-10-06-edo.md) / [Lima表示修正](AgentNote/2026-10-06-lima-display.md)。

Pondicherryをフランス領の港として追加し、フランス・ムガル帝国免許とPondicherry ↔ Hughli航路を持つ小規模のフランス東インド会社を配置しました。この追加時点では、世界は江戸を含め116都市でした。[変更・移行記録](AgentNote/2026-10-06-pondicherry.md)。

オマーン商人（中規模）も追加しました。オマーンの免許を保有し、Muscat ↔ MombasaとMombasa ↔ Zanzibarで開始します。[変更記録](AgentNote/2026-10-06-omani-merchants.md)。

2026-10-06：オスマン商人・清国商人へ改名し、イングランド免許とLondon ↔ Kingston航路を持つ中規模の南海会社と、ポルトガル免許でLisbon ↔ LuandaおよびLuanda ↔ Ilha de Moçambiqueの2ルートを持つポルトガル商館を追加しました。[変更記録](AgentNote/2026-10-06-south-sea-company.md)。

新規ゲームでは、指定の東西インド会社・各地域商人14社が21ルート・34隻で活動を開始します。資金規模は小£5,000・中£25,000・大£60,000（初期船価を含む）。既存のセーブは元の会社構成を維持します。[初期配置一覧](AgentNote/2026-10-05-regional-rivals.md)。

1700年ごろをモチーフにした世界規模の海陸交易シミュレーション。**3.3.2 — WebAssemblyエンジン版**。209都市（119港・90内陸都市）、39国家、20交易品、202道路を収録しています。

## 起動

```powershell
npm start
```

[ローカルのゲーム](http://127.0.0.1:4173/)を開きます。Node.js 22以上が必要です。ビルド済みWasmを同梱しているため、通常のプレイにRustやnpm installは不要です。別ポートは`$env:PORT='4176'`を設定して起動できます。

ゲーム状態とルールはRust/WebAssemblyが保持・処理し、Web Worker内で実行します。JSは入力、地図・画面、表示補間、保存I/Oを担当します。

## 遊び方

- 免許なし・資金5,000から開始。最初に選んだ国家との友好度は100になります。
- 例：EnglandとSpainの免許を取得し、Kingston → Havanaをスループで開設。開設時に未使用船を使い、なければ表示された費用で購入します。
- 都市間ドラッグで2都市ルートの開設・選択。「地図で巡回ルートを作る」では同じ都市への再訪を含め、順番に寄港地を選べます。最後は出発地へ戻ります。
- 都市名もクリック・ドラッグで操作できます。「国家」画面では日額の外交投資を直接設定し、友好度の直近30日分の変動と原因を確認できます。外交の臨時投資は廃止しました。
- 船のアイコン、自社/競合の航路線をクリックしてルート情報を表示。自社ルート画面から船の追加、積載条件、護衛、船種指定の自動増減を管理できます。
- 積み込み・荷降ろしは基礎速度が海路・陸路とも各5単位/日で、対応する荷役技術により速くなります。売却は荷降ろし完了時に行います。ルート情報で待機割合と時間の内訳を確認できます。自動増減は標準で待機割合10%未満で拡大、30%超で縮小し、会社設定で変更できます。
- 地図の背景をドラッグして移動、ホイール/ボタンで拡大縮小。国別の色は都市と免許一覧で共通です。地名はLatin表記または漢字を維持します。
- 陸上交易は道路で接続された都市間に馬車・キャラバンを配置します。馬車は整備された道、キャラバンは悪路に適し、道路への整備投資で通行性が改善します。エジプトとパナマ地峡の連絡路も利用できます。
- 交易路は収益順・船や車両の数順・開設順に並べ替え、経由都市名の一部で絞り込めます。会社画面から競合の交易路一覧にも移動できます。
- 「船・車両」で海路・陸路それぞれのデフォルトを設定できます。新規開設では海路を優先し、既定種が不適合ならその方式で最も建造費が低い適合種を選びます。種類別の使用中・未使用数を表示し、一覧を開いて未使用の船や車両を売却できます。船名は自動付与のみです。
- 「都市」、道路開発権、会社の投資一覧は地域順を標準とし、文字列順にも切り替えられます。
- 「会社の帳簿」で月間・年間の項目別収入と支出、売上・支出および総資産の推移を確認できます。月別は最大120か月、年別は最大300年（現在の期間を含む）を保持し、ボタンで集計表とグラフの単位を切り替えます。グラフはデータが存在する期間だけを表示します。直近明細は保持・表示とも200件です。集計のない既存セーブは読込時点から記録し、月別集計を持つ既存セーブは年間集計へ引き継ぎます。
- 「研究・投資」で造船・航海・船舶荷役・車両・陸運・陸運荷役の6技術へ個別に投資できます。船・車両の設計と購入に専用施設は不要です。車両は積載・速度・悪路適性・航続・維持費を改良できます。
- 移動中に遭難すると船・車両と積荷を失います。航海/陸運技術で確率を下げ、陸路では道路整備と悪路適性でも危険を減らせます。喪失補充を有効にすると予算と留保資金の範囲で再購入します。
- 研究・技術投資、品目別生産投資、都市/道路開発、一括船種置換、会社買収、会社/設計の改名に対応します。競合は各社50ルートまでです。

## 保存

**2.xセーブとの互換性はありません。** 旧localStorageのデータは読み込まず、そのまま残します。

既存3.x保存は6技術と統一キャラバンへ自動移行します。旧造船所の取得原価を返還し、処理中の荷役は残時間を引き継ぎます。

IndexedDBに手動5枠と自動5世代を保存します。手動保存は枠を指定して上書き。自動保存はゲーム内約30日ごとで、容量不足の場合は最も古い自動保存から整理して再試行します。手動枠を自動削除することはありません。書込みと整理は同じトランザクションで行い、失敗時には古い保存も復元されます。

起動時は最新の有効なセーブから再開します。「保存」画面で枠や自動履歴を選び直せます。ファイルへの書出し・読込も可能です。ブラウザによる保存禁止や、手動枠と単一セーブだけで容量を超える場合はエラーになります。

## 開発

Rust 1.95.0で検証。コアを変更する場合だけ、Rustのwasmターゲットが必要です。

```powershell
rustup target add wasm32-unknown-unknown
npm run build:wasm
npm test
npm run benchmark:wasm
```

`build:wasm`は世界データを生成し、Cargo.lockで依存を固定してリリースビルドします。バイナリは`assets/wasm/engine.wasm`、ソースとバイナリの対応ハッシュは`assets/wasm/build.json`です。

実ブラウザのIndexedDB/Worker検証ページは[統合テスト](http://127.0.0.1:4173/tests/browser-wasm.html)。独立した一時データベースを使います。既存のJSエンジンと旧テストは参照比較用です。新しいブラウザエントリから旧エンジンはインポートしません。

- [アーキテクチャ](Architecture.md)
- [実装結果](ImplementationNote.md)
- [外部ライブラリとライセンス](ExternalLibrary.md)
- [要件実現状況](Documents/RequirementsStatus.md)
- [今回の作業記録](AgentNote/2026-10-04-wasm-migration.md)

## ライセンス

3.0.0から **GNU General Public License version 3 or later**（SPDX: `GPL-3.0-or-later`）で配布します。[ライセンス全文](LICENSE)と[外部ライブラリのライセンス・通知](ExternalLibrary.md)を参照してください。

Copyright (C) 2026 Laurence Yamamoto.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
