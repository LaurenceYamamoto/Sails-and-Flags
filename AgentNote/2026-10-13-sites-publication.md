# 3.3.13 ライセンス更新とSites公開

- GitHubの`main`と`3.3.13`を`2b8aa870993139936bef2c04c1784c7b59ec433a`へatomic pushし、両リモート参照の一致を確認。バージョン番号は3.3.13のまま。
- 英語のみのEULA・OSS通知、GPL原本一致、内部リンク・構文・差分を検証済み。
- 公開URL: https://sails-and-flags.regalbrush1.chatgpt.site
- Sites project: `appgprj_6acd91c473388191a9fbed4cd8a739ce`
- Sites saved version: `appgprj_6acd91c473388191a9fbed4cd8a739ce~appgver_c934a64cc24881918ad45a5a3c4bcb2b`
- Deployment: `appgdep_6acd9292baf88191ad58e85169c7f2b7`、結果`succeeded`、アクセス範囲`public`。
- Sites側ソースコミット: `20291d7a5a26d7bb7453e90c6dd254c57fd87736`。GitHub版を複製し、静的配布の設定と梱包スクリプトを追加した独立した履歴。ゲームのWasmはGitHub版とバイト単位で一致。

## 配布と再公開

独立したSites用コピーを`sites/sails-and-flags`に保存。`.openai/hosting.json`に上記IDを保存済みなので、今後は同じSiteを再利用し、新規登録しない。元リポジトリのローカル`.git/info/exclude`で`/sites/`を除外した。認証トークンはファイルに保存していない。

`scripts/build-static-site.mjs`で`index.html`、`wasm-style.css`、`src/`、`assets/`、`legal/`、`LICENSE`を`dist/`へコピー。Sites公式source helperでソース同期・梱包し、保存済みバージョンを公開した。今後の更新時はGitHub側の変更をこのコピーへ反映してから同じ手順を使う。

WindowsではGit BashをPATHの先頭に置く。初回の梱包時にGNU tarが`C:/...`をリモートパスと解釈して失敗したため、`TAR_OPTIONS=--force-local`を設定して再実行し成功。

## 公開先の検証

Sitesの公開成功を確認後、ブラウザでゲーム3.3.13の地図・初期会社・資金の表示、英語固定フッター、EULAとOSSページを確認。ブラウザの警告・エラーなし。ゲーム全体の再テストは行わず、配布ファイル一致と公開先の起動確認を実施した。

[公開画面](2026-10-13-sites-published.png)
