# 外部ライブラリ・ライセンス一覧

対象：Sails & Flags 0.1.0（2026-09-29）。

## アプリケーションの依存ライブラリ

**外部ライブラリは使用していません。** `package.json`にdependencies/devDependenciesはなく、`npm install`も不要です。外部CDN、API、解析サービスへの通信は行いません。

| 区分 | 使用内容 | ライセンス・配布上の扱い |
| --- | --- | --- |
| 実行時ライブラリ | なし | 第三者ライブラリの同梱なし |
| UI / 地図 | 標準DOM・SVG・CSS、独自作成の海域略図 | 地図データ、画像素材、アイコンパッケージの転載なし |
| フォント | OSにインストール済みのGeorgia、Yu Gothic UI、Meiryo等をCSSで指定 | フォントファイルを取得・同梱・再配布しない |
| 絵文字・記号 | Unicode文字をブラウザで表示 | 外部の画像アセットを同梱しない |
| 保存 | ブラウザ標準localStorage / JSON | 追加ライブラリなし |

## 開発・検証環境

| 名称 | 使用版・目的 | ライセンス・参照先 |
| --- | --- | --- |
| Node.js | v24.15.0。HTTP配信、標準テストランナー、性能計測 | Node.js本体はMIT。内部に含まれる第三者コンポーネントは各ライセンス。[Node.js LICENSE](https://github.com/nodejs/node/blob/v24.15.0/LICENSE) を参照。Node.jsバイナリはこの成果物に同梱しない |
| Node.js標準モジュール | node:http、node:fs/promises、node:path、node:url、node:test、node:assert/strict、node:perf_hooks | 上記Node.jsに含まれる機能。個別npmパッケージ追加なし |
| Codex内蔵ブラウザ・検証ツール | Chromium上の画面確認・ブラウザ操作 | 開発環境のツールとして使用。成果物へのソースコード・バイナリ同梱なし |

本一覧は第三者依存の棚卸しです。プロジェクト本体は、GitHubリポジトリで既に指定されている[MITライセンス](LICENSE)に従います（Copyright (c) 2026 Laurence Yamamoto）。既存のLICENSEを保持しています。
