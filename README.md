# Sails & Flags

1700年ごろをモチーフにした世界規模の海陸交易シミュレーション。**3.0.0 — WebAssemblyエンジン版**。114都市（68港・46内陸都市）、23国家、20交易品、69道路を収録しています。

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
- 船のアイコン、自社/競合の航路線をクリックしてルート情報を表示。自社ルート画面から船の追加、積載条件、護衛、船種指定の自動増減を管理できます。
- 地図の背景をドラッグして移動、ホイール/ボタンで拡大縮小。国別の色は都市と免許一覧で共通です。地名はLatin表記または漢字を維持します。
- 陸上交易は道路で接続された都市間に馬車・ラクダ・ラバを配置します。エジプトとパナマ地峡の連絡路も利用できます。
- 研究・技術投資、品目別生産投資、都市/道路開発、一括船種置換、会社買収、会社/船/設計の改名に対応します。競合は各社50ルートまでです。

## 保存

**2.xセーブとの互換性はありません。** 旧localStorageのデータは読み込まず、そのまま残します。

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
