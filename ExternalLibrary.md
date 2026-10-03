# 外部ライブラリ・ライセンス一覧

対象：Sails & Flags 2.0.0-alpha.2（2026-10-02）。外部ライブラリは追加せず、地形データとしてNatural Earthを採用しています。P7の内陸都市・道路・地形係数・治安・翻訳は本リポジトリのゲーム用定義です。外部地図API、経路探索・翻訳ライブラリは追加していません。

## アプリケーションの依存ライブラリ

**外部ライブラリは使用していません。** `package.json`にdependencies/devDependenciesはなく、`npm install`も不要です。外部CDN、API、解析サービスへの通信は行いません。

| 区分 | 使用内容 | ライセンス・配布上の扱い |
| --- | --- | --- |
| 実行時ライブラリ | なし | 第三者ライブラリの同梱なし |
| UI | 標準DOM・SVG・CSS | UIライブラリ、画像・アイコンパッケージの同梱なし |
| 地形データ | Natural Earth 1:50m Land v5.1.2。全世界world-land.jsと旧地域land.js、事前生成world-network.jsを同梱 | パブリックドメイン。[利用条件](https://www.naturalearthdata.com/about/terms-of-use/)・[固定版データ](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_land.geojson)。出典・加工手順・ハッシュは[assets/maps/README.md](assets/maps/README.md)と生成ファイルに記録 |
| フォント | OSにインストール済みのGeorgia、Yu Gothic UI、Meiryo等をCSSで指定 | フォントファイルを取得・同梱・再配布しない |
| 絵文字・記号 | Unicode文字をブラウザで表示 | 外部の画像アセットを同梱しない |
| 保存 | ブラウザ標準localStorage / JSON / Blob / File / URL | 追加ライブラリなし |

## 開発・検証環境

| 名称 | 使用版・目的 | ライセンス・参照先 |
| --- | --- | --- |
| Node.js | v24.15.0。HTTP配信、標準テストランナー、性能計測 | Node.js本体はMIT。内部に含まれる第三者コンポーネントは各ライセンス。[Node.js LICENSE](https://github.com/nodejs/node/blob/v24.15.0/LICENSE) を参照。Node.jsバイナリはこの成果物に同梱しない |
| Node.js標準モジュール | node:http、node:fs/promises、node:path、node:url、node:test、node:assert/strict、node:perf_hooks | 上記Node.jsに含まれる機能。個別npmパッケージ追加なし |
| Codex内蔵ブラウザ・検証ツール | Chromium上の画面確認・ブラウザ操作 | 開発環境のツールとして使用。成果物へのソースコード・バイナリ同梱なし |

本一覧は第三者依存の棚卸しです。プロジェクト本体は、GitHubリポジトリで既に指定されている[MITライセンス](LICENSE)に従います（Copyright (c) 2026 Laurence Yamamoto）。既存のLICENSEを保持しています。

P6で追加した4言語の翻訳は本リポジトリの実装文言です。翻訳API・外部翻訳ライブラリは使用していません。Intlと端末のシステムフォントを使用し、フォントファイルは同梱・配信しません。

1.1.0-alpha.2の都市再選定でも外部依存の追加はありません。新港の位置、合成市場、道路の経由点はリポジトリ内の定義を使用します。

1.1.0-alpha.3の海上経路探索・海岸線交差判定・球面距離・補間は独自実装。既存Natural Earth陸地データを再利用し、外部ライブラリや地図サービスは追加していません。


2.0.0-alpha.1（P8第1地域）も新しい外部ライブラリ・地図配信・画像・フォントは追加していません。Genoa / Livornoの描画と海路探索は既存Natural Earthデータを利用します。地理・国家・市場は独自のゲーム用定義、翻訳は同梱文言です。都市選定の歴史的背景に使用した公開機関の資料は[作業記録](AgentNote/2026-10-02-p8-mediterranean.md)へリンクし、資料の本文・画像・PDFは再配布しません。


## 2.0.0-alpha.2：全世界地図

外部ライブラリの追加はありません。同じNatural Earth 50m Land v5.1.2の全世界データをworld-land.jsとして同梱し、独自コードで事前計算したworld-network.jsを追加しました。地形データはPublic Domain、生成・探索・カメラ・翻訳コードは本プロジェクトのMITライセンスです。地図は同梱データから読み込み、地図配信サービス・CDN・追跡サービスへの通信はありません。引用した歴史資料の本文・画像は同梱していません。

生成方法と元データのSHA256は[地図資産の記録](assets/maps/README.md)、選定・精度上の判断は[世界拡張の作業記録](AgentNote/2026-10-02-world-expansion.md)に記載しています。


## 2.0.0-alpha.3：大陸交易網

外部ライブラリ・画像・地図配信の追加はありません。都市・産品・道路の値は本プロジェクト独自のゲーム用定義です。既存のNatural Earth Public Domain地図を使用します。都市選定の背景として参照したUNESCOの公開資料は[作業記録](AgentNote/2026-10-02-continental-trade.md)にURLを記録し、資料本文・画像は配布していません。

## 2.0.0-alpha.4：地峡陸上連絡

外部ライブラリ・地図データの追加はありません。既存Natural Earth（Public Domain）と独自MITコードを利用します。道路と新港の定義・翻訳は独自作成です。UNESCO等の歴史資料は背景確認のために参照し、本文や画像は同梱していません。参照先は[作業記録](AgentNote/2026-10-03-overland-crossings.md)に記載しています。
