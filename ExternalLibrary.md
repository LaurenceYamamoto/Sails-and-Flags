# 外部ライブラリ・ライセンス一覧 — 3.2.0

更新：2026-10-05。JavaScript側は標準ブラウザAPIのみを使用し、npm依存や外部CDNはありません。Rustのserde系ライブラリと標準ライブラリをWebAssemblyへ静的リンクしています。

今回の6技術・車両設計・通行性・遭難・保存移行は既存のRust標準機能とブラウザAPIで実装し、外部依存とライセンスの追加・変更はありません。

## Cargo依存

3.1.1の都市投資ソフトキャップはRust標準の対数関数を利用し、外部依存・ライセンスの追加や変更はありません。

3.0.2の一覧・船団・帳簿改修では外部依存を追加していません。月次・年次のグラフは標準SVGで描画し、並べ替えは標準Intlを利用します。

3.1.0の荷役時間・待機割合による自動増減も既存のRust/WebAssemblyと標準ブラウザAPIで実装し、依存・ライセンスの追加や変更はありません。

Cargo.lockおよびローカルに取得済みの各Cargo.tomlから確認しました。下記は推移依存・ビルド時依存を含む全件です。正確な版、リポジトリURL、同梱したライセンス文書は[機械可読一覧](assets/licenses/rust-crates.json)に記録しています。

| ライブラリ | 版 | 用途 | ライセンス |
| --- | --- | --- | --- |
| serde | 1.0.228 | 状態と表示のシリアライズ | MIT OR Apache-2.0 |
| serde_core | 1.0.228 | serde基盤 | MIT OR Apache-2.0 |
| serde_derive | 1.0.228 | 型のシリアライズコード生成 | MIT OR Apache-2.0 |
| serde_json | 1.0.149 | JSON、正確な浮動小数点の復元 | MIT OR Apache-2.0 |
| itoa | 1.0.18 | 整数文字列変換 | MIT OR Apache-2.0 |
| memchr | 2.8.0 | バイト列検索 | Unlicense OR MIT |
| zmij | 1.0.21 | 浮動小数点文字列変換 | MIT |
| proc-macro2 | 1.0.106 | deriveマクロのビルド | MIT OR Apache-2.0 |
| quote | 1.0.45 | deriveマクロのビルド | MIT OR Apache-2.0 |
| syn | 2.0.117 | deriveマクロの構文解析 | MIT OR Apache-2.0 |
| unicode-ident | 1.0.24 | 識別子のUnicode判定 | (MIT OR Apache-2.0) AND Unicode-3.0 |

各パッケージの配布ライセンス・COPYING文書を`assets/licenses/<name>-<version>/`に同梱しています。更新時は`npm run licenses:wasm`で一覧と文書を再収集します。

## 標準ライブラリ・素材・開発環境

| 名称 | 版・用途 | ライセンスと同梱状況 |
| --- | --- | --- |
| Rust標準ライブラリ | Rust 1.95.0、wasm32-unknown-unknown。メモリ、数値処理、コレクション等 | 原則MIT OR Apache-2.0、構成要素は各通知による。[標準ライブラリの通知](assets/licenses/rust-standard-library.html)を同梱。Rust配布物のCOPYRIGHT.htmlからIn libstd: Yesの依存とツリー内通知を収集した全ターゲット分の一覧で、すべてがWasmへリンクされるという意味ではありません |
| Natural Earth | 1:50m Land v5.1.2、世界の陸地形状 | Public Domain。[利用条件](https://www.naturalearthdata.com/about/terms-of-use/)。原典、加工手順、ハッシュは[地図データ記録](assets/maps/README.md)。Wasm内の描画データにも利用 |
| Node.js | v24.15.0でビルド補助・HTTP配信・テスト・計測 | Node.js本体MIT、内部依存は各通知。本体を成果物には同梱しません |
| DOM/SVG/Worker/WebAssembly/IndexedDB/Web Locks/Intl | 標準ブラウザ機能 | ライブラリの追加配布なし |
| OSフォント、Unicode記号 | 画面表示 | フォント・アイコンの外部ファイルは取得・配布しません |
| Codex内蔵ブラウザ | 画面とIndexedDBの実動作確認 | 開発用ツール。成果物に同梱しません |

ゲームルール、名称リスト、都市・商品・国家のゲーム用定義、独自の海路生成・地図表示は本プロジェクトのコードです。3.0.0からプロジェクトのライセンスを[GNU GPL version 3 or later](LICENSE)（SPDX: `GPL-3.0-or-later`）へ変更しました。外部ライブラリ・素材には上記の各ライセンスが引き続き適用され、同梱した著作権・ライセンス通知を維持します。外部地図サービス、翻訳API、解析サービスへの通信は行いません。Rust/Cargo依存の初回取得とターゲット追加には開発時のネットワーク接続が必要です。
