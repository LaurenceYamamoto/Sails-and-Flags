# 中央アジアの都市・陸上交易路追加

## 方針と実装

9内陸都市・4免許主体・12道路を既存配列末尾へ追加。世界265都市（129港・136内陸都市）、48国家、20交易品、293道路スロット（有効276・廃止17）です。公開バージョン表記は3.3.6のまま、内部保存版はcity_version=14としました。今回はリリース・pushの依頼ではありません。

ユーザー指定に従いKashgarはDzungar Khanateに所属します。Samarkandを含め通常の都市として扱い、衰退・征服・領有変更を年月で強制する歴史イベントは追加しません。通常の需要・生産・投資・外交・戦争の既存ルールは継続します。

| 都市 | 免許主体 | 主産品 |
|---|---|---|
| Bukhara | ブハラ・ハン国（追加） | 織物・絹 |
| Khiva | ヒヴァ・ハン国（追加） | 綿花・織物 |
| Balkh | ブハラ・ハン国 | 食料・綿花 |
| Mashhad | サファヴィー朝ペルシア | 織物・工具 |
| Herat | サファヴィー朝ペルシア | 絹・食料 |
| Kabul | ムガル帝国 | 食料・織物 |
| Samarkand | ブハラ・ハン国 | 綿花・食料 |
| Tashkent | カザフ・ハン国（追加） | 食料・織物 |
| Kashgar | ジュンガル・ハン国（追加） | 綿花・織物 |

市場圏centralAsiaと生産区分centralAsianOasisを追加。綿花・絹は指定都市で生産し、その他の都市では少量のみ。茶・香辛料・コーヒー・陶磁器・藍・毛皮は生産せず、木材もわずかとします。全品目の消費需要を維持し、茶・織物・工具・陶磁器に穏やかな需要倍率を設定しました。新しいライブラリ・素材の導入はありません。

## 道路

距離・地形・通過免許は、1700年前後をモチーフとするゲーム用の近似です。実測や当時の厳密な国境線ではありません。

| 区間 | 距離km | 地形 | 必要免許 |
|---|---:|---|---|
| Isfahan–Mashhad | 1250 | 丘陵 | ペルシア |
| Mashhad–Herat | 370 | 丘陵 | ペルシア |
| Herat–Balkh | 750 | 丘陵 | ペルシア・ブハラ |
| Balkh–Kabul | 500 | 山岳 | ブハラ・ムガル |
| Kabul–Lahore | 700 | 山岳 | ムガル |
| Balkh–Samarkand | 500 | 山岳 | ブハラ |
| Samarkand–Bukhara | 280 | 平地 | ブハラ |
| Bukhara–Khiva | 450 | 丘陵 | ブハラ・ヒヴァ |
| Bukhara–Mashhad | 1100 | 丘陵 | ブハラ・ペルシア |
| Samarkand–Tashkent | 320 | 平地 | ブハラ・カザフ |
| Tashkent–Kashgar | 1000 | 山岳 | カザフ・ブハラ・ジュンガル |
| Khiva–Kazan | 2450 | 丘陵 | ヒヴァ・カザフ・ロシア |

Tashkent–Kashgarはフェルガナ盆地側の通過をブハラ免許へ抽象化。Khiva–Kazanはアラル海・カスピ海の西側を通る草原回廊で、途中都市は省略しています。標準キャラバンの航続2500km以内ですが、馬車の2000kmでは走れません。Kashgarから中国本土への長大な直接道路は追加していません。

## 保存・表示の保全

- 旧13は256都市・44国家・281道路として読み込み前に検証し、追加分だけ初期化。旧0～12の検証・移行条件も保持します。
- 新国家に対する各社友好度60、外交予算・取引量0。既存の国家間関係ペアの順序を保持し、新ペアだけ追加します。
- 既存の都市番号・道路番号・市場・資金・運行・投資・免許・乱数を保持。新都市はすべて内陸のため海上ネットワークを変更しません。
- Santiago de Chile–Valparaíso以上の表示間隔を全追加都市に適用。表示補正を距離計算用の経緯度と分離し、道路端点も表示位置へ合わせます。
- ビルド時とテストの両方で、表示補正後の道路全線分が陸地上を通ることを検査します。

## 検証

- `npm run build:wasm`成功。
- `node --test --test-concurrency=2 tests/central-asia.test.js tests/indochina.test.js tests/asia-road-revisions.test.js tests/wasm-boundary.test.js`：14件成功。
- 追加の8件（wasm-core、asia-expansion、siberian-expansion、europe-expansionから旧世界移行・初期状態・競合配置・50年運行を選択）も成功。合計22件成功、失敗0。50年後も競合のルート上限と保存再読込の整合を確認しました。
- 変更JavaScript20ファイルの構文、差分空白、更新文書の文字化け検査が成功。
- 新5ルートを744日運行し、すべてで配送成立、道路整備、競合50ルート上限、保存再読込の完全一致を確認。
- 全12陸路で免許不足を拒否。Kashgarは清の免許で代用できず、ジュンガル免許を要求。馬車の航続不足と海上船の陸路利用を拒否。
- HEADの3.3.6 WasmをGitから直接読み込み、31日進めた実セーブを移行。新規追加部分を取り除くと旧セーブと全項目が一致。その後31日進行と再保存・再読込も一致。
- HEAD世界データとの比較で、旧256都市・44国家・281道路・初期競合配置・旧都市間の全海上距離・全海路形状が不変。
- 内蔵ブラウザを再読込し、新9都市の表示とKashgarの都市選択、ジュンガル所属、地図ジャンプと12倍表示を確認。console警告・エラーなし。[確認画像](2026-10-09-central-asia.jpg)。
- ブラウザの新規ルート画面でTashkent–Kashgarを指定し、1000kmの見積もり、必要免許3か国、免許不足時の開設ボタン無効を確認。確認後に閉じ、ゲームの日付・所持金を変更せずKashgar画面へ戻しました。

追加都市名・国家名は既存の日本語／英語フォールバックで表示します。都市名はLatin表記を維持。道路・市場値はプレイ用の調整値であり、歴史的な輸送量や利益率の再現を保証しません。

## 参考資料と近似の範囲

地理・免許主体の検討に参照。文章や画像の転載、新しい外部依存の追加はありません。

- [Encyclopaedia Iranica: Bukhara VIII](https://www.iranicaonline.org/articles/bukhara-viii/) — ブハラとバルフのジャーン朝支配。
- [Encyclopaedia Iranica: Herat VI](https://www.iranicaonline.org/articles/herat-vi/) — ヘラートのサファヴィー朝期。
- [Encyclopaedia Iranica: Kabul III](https://www.iranicaonline.org/articles/kabul-iii-history/) — カーブルのムガル期。
- [History of Kazakhstan: Tauke Khan](https://e-history.kz/en/prominent-figures/show/12748) — タウケ・ハン期の統治圏の参考。
- [Encyclopaedia Iranica: Indian Merchants in Central Asia and Iran](https://www.iranicaonline.org/articles/india-xxx-indian-merchants-in-central-asia-and-iran/) — 中央アジア・イラン・インド間の商人ネットワーク。

ジュンガル所属のKashgarと、Samarkandの歴史的衰退を扱わない点は、今回のユーザー指定を優先したゲーム設定です。
