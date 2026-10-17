# オランダの分類と北西欧の名称

- ユーザー指定により、オランダの首都地域を西ヨーロッパへ変更。Amsterdamの表示地域も合わせて変更し、国・都市・会社の共通順位を再生成した。植民地は所在地の地域を維持する。
- 「北欧・北西欧」を「北西欧」（Northwestern Europe）へ改称。全7言語の表示と `Documents/DisplayOrdering.md` を更新した。
- 表示地域ID `northEurope` と都市・国の配列インデックスは維持。経済用の需要地域分類と過去カタログは変更しない。
- 翻訳とWasmを再ビルド。ローカルで `catalog-order-pairs`、`wasm-lists`、`i18n`、`wasm-boundary` の13テストが成功。生成カタログでオランダ・Amsterdamの地域と北西欧の名称を直接確認。`git diff --check` も成功。
- バージョンは3.4.3のまま。GitHubとSitesへの公開操作は行っていない。
