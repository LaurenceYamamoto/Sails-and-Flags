# Mexico City–Guadalajara直接陸路の廃止

ユーザー指定によりmexicocity_guadalajaraをretired_since=23として廃止。マップ、新規開設、道路開発一覧から除外する。Mexico City–Guanajuato、Guanajuato–Guadalajara等の他道路は維持する。

city_versionを23へ更新。道路スロット自体は353件を維持し、有効道路は335→334件、廃止道路は19件。都市320・国家52、公開バージョン3.3.8は変更しない。

旧保存のプレイヤー・競合の該当区間を含む陸上ルートを既存retire_roads処理で解除する。待機・荷積み・走行・荷降ろしのいずれの状態でも車両を未配置へ戻し、積み荷の購入原価を返金する。道路権取得費と積立残高も返金し、日額投資を解除する。保存再読込で二重返金しない。その他の市場・都市開発・乱数状態・影響しないルートを保持する。

新規外部ライブラリ・素材は使用しない。既存ブラウザは再読み込みしない。

## 検証

- `npm run build:wasm`成功。
- `node --test --test-concurrency=2 tests/mexico-road-retirement.test.js tests/road-revisions.test.js tests/wasm-boundary.test.js`：8/8成功。
- 両方向の開設・投資拒否、Guanajuato経由の開設・進行・保存を確認。
- 旧22保存でプレイヤー・競合それぞれの待機・荷積み・走行・荷降ろし車両を用意し、ルート解除・車両保持・返金・二重返金防止を確認。旧6保存など既存の廃止陸路の移行テストも通過。
- `git diff --check`成功。全テスト一括実行とブラウザ目視は未実施。
