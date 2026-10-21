# Rustによる共有メモリ並列実行

2026-10-21。4.1.4収録。ネイティブアプリへの移行は行わない。

## 責務

- JSの`simulation-runtime.js`は環境検出、WASM読込、スレッドの初期化、外部入出力のみを行う。
- `thread_pool.rs`のRust/Rayonが仕事の分割、同期、結果の順序維持、並列／逐次の選択を行う。
- 主担当のゲーム状態はRustにのみ存在する。各スレッドは同じWASMメモリ内の不変入力を借用し、Rustの結果ベクトルを返す。計算ごとのJSON変換、WorkerへのpostMessage、別インスタンスへの入力コピーは行わない。
- 船の移動、都市内の売買、会社の継続投資、運行間隔、競合候補評価を対象とする。Rayonの順序を保つ収集後、主担当が4.1.3と同じ順序で確定する。乱数・現金・在庫の競合処理は主担当に残す。
- 画面との命令・表示・保存の受け渡しは既存のJSON形式を維持する。JSはゲームの判断や資金確定を行わない。入力ジョブ作成や結果ベクトルの割当自体がなくなるわけではない。

## 実行方針

Rustが論理CPU数から最大4スレッドを選ぶ。小さな仕事は逐次実行する。初回は逐次計算をウォームアップして計測し、0.1ms未満の仕事ではプールを起こして比較すること自体を省く。対象の純粋計算で並列が30%以上速い場合に採用する。仕事量が2倍に増えるか、軽量な仕事では1024回、それ以外では256回経過したとき再計測する。並列候補は初回にウォームアップし、採用後も実測が基準を大きく超えれば逐次へ戻す。較正はゲーム状態を変更せず、採用結果は一度だけ確定する。`parallelMs: 0`は未測定（軽量として比較を省略した場合も含む）。テスト用の`threadMode`は0=自動、1=逐次、2=強制並列。モードと計測値はセーブに含めない。

## ビルド・配信

- `npm run build:all`で通常版と共有メモリ版を生成する。通常版は従来の安定版Rust、共有版は`nightly-2026-04-15`とrust-src（ライセンス収集時はrust-docsも）を使用し、標準ライブラリもatomics有効で再ビルドする。
- `wasm-bindgen-cli 0.2.129`が必要。ローカルの`wasm-core/target/tools/bin`またはPATHから使用し、`WASM_BINDGEN_CLI`でも指定できる。Cargo.lock、ビルドスクリプト、生成物マニフェストにより入力を追跡する。
- `assets/wasm/shared/`にWASM、JS、およびWorker初期化コードを同梱する。Rayonのno-bundler起動コードを元に、同一オリジンからの読込、起動失敗時の終了処理、30秒の待機上限を追加した。変更と元のApache-2.0通知を明示する。
- ブラウザでは安全なコンテキストとcross-origin isolationが必要。通常の配信では`Cross-Origin-Opener-Policy: same-origin`と`Cross-Origin-Embedder-Policy: require-corp`をHTML・Worker等に設定し、全アセットを同一オリジンから配信する。
- ローカルサーバーは上記ヘッダーを既定で返す。`ISOLATION=0`で非対応時の検証ができる。公開用の`_headers`にも同じ設定を同梱し、公開時に配信ヘッダーを確認する。ヘッダーなしでは通常版が動き、共有並列にはならない。

## 失敗と保存

共有メモリ非対応・共有版読込失敗・スレッド初期化失敗では、ゲーム状態を作る前に通常版へ切り替える。初期化後は同じメモリに複数スレッドがアクセスするため、旧方式のように実行中のWorkerを切り捨ててその仕事だけ再送することはできない。実行中の致命的な障害では状態を勝手に再実行せず、最後の正常な保存から再開する。通常の保存要求は日次処理が完了してから扱う。

セーブ形式・ゲームルール・日次確定順序は4.1.3から変更しない。既存データの移行やリセットは不要。

## 検証

`tests/shared-simulation.test.js`は共有メモリの実体、4スレッド・自動選択・通常版の90日完全一致、初期化後のJSメッセージ数が増えないこと、保存再読込、非対応時の起動、生成物ハッシュを検証する。`tests/parallel-browser.html`はローカル専用の実ブラウザ・IndexedDB試験。

`scripts/benchmark-shared.mjs`は4.1.3の通常実行と、共有メモリ版の逐次・2スレッド・4スレッド・自動選択を比較する。各条件を別プロセスで起動し、30日ウォームアップ後に同じ初期状態へ戻し、180日×3試行、実行順を回転する。起動・描画・保存は計時外。全条件の最終保存ハッシュ一致を必須とする。比較元WASMはGit対象外の`sites/local-shared-baseline.wasm`に保存する。

比較元がない新しいチェックアウトでは、4.1.3ブランチからバイナリとして取得する（シェルのテキストリダイレクトは使用しない）。

```js
// node --input-type=module に渡すコード
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
mkdirSync('sites',{recursive:true});
writeFileSync('sites/local-shared-baseline.wasm',execFileSync('git',
 ['show','4.1.3:assets/wasm/engine.wasm'],{maxBuffer:32*1024*1024}));
```

`npm run benchmark:shared`の既定は60経路×10隻。`BENCH_SHIPS_PER_ROUTE=40`で2,400隻、`BENCH_SAVE`で保存ファイルを指定できる。最終測定では通常設定が従来より約5〜12%遅く、高速化は確認できていない。[試行別結果と制約](../AgentNote/2026-10-21-rust-shared-memory.md)。

上記は共有メモリ移行直後の記録。続く最適化と変更前後比較は[最適化記録](../AgentNote/2026-10-21-shared-memory-optimization.md)を参照。正常な船種検索での不要なエラー文字列生成、同型船の運行計算、船ごとの時差配列コピー、危険度キャッシュのキー文字列コピー、都市ごとの基礎生産量の繰返し集計を削減した。日次確定順序・保存形式は維持する。

参考: [wasm-bindgen-rayon](https://github.com/RReverser/wasm-bindgen-rayon)、[共有WASMメモリ](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)。
