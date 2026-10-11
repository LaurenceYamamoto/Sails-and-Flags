> **2026-10-12撤回済み**：この文書は以前の試作の記録です。現行仕様は[限定水路の記録](2026-10-12-limited-sailing-waterways.md)を参照してください。

# ドナウ・エルベ・長江の河口接続

2026-10-11。公開バージョン3.3.10は維持。内部world revisionを25へ。

## 対応と近似

| 水系 | 追加・転換 | 外洋への出口 |
| --- | --- | --- |
| ドナウ | Belgrade–Bucharestを陸路から転換、Bucharest–Sulinaを追加 | オスマン領Sulinaを追加し黒海へ |
| エルベ | Dresden–Hamburgを追加 | 既存Hamburgから北海へ |
| 長江 | Hankou–Nanjing、Nanjing–Shanghaiを追加 | 清領上海を追加し黄浦江・長江河口から東シナ海へ |

依頼の「カスピ海」はドナウの河口に関する誤記と判断し、黒海へ接続した。Bucharestはドナウ本流上の都市ではないため、周辺の河港（Giurgiu付近）と短い陸上連絡を含む地域市場として抽象化。市街への歴史的な航行可能運河を表すものではない。専用の積み替え処理は導入しない。Sulinaは18世紀の大商港としてではなく、小さな河口の交易拠点として食料中心の供給を設定した。

Dresden–Hamburgはザクセン・ブランデンブルク・ハンブルクの免許を要求する。長江2区間は清、ドナウ2区間はオスマン。河川区間のスループ系限定、海路と水路の同一巡回を維持。Shanghaiは日本語・両中国語では上海、韓国語では상하이、その他はShanghai。

経由点は概略の水系を表す独自設定。実座標と都市表示位置は分離。新港は外洋網の各1点（Sulina:31E/45N、Shanghai:123E/31N）に接続し、旧港間の海路を短絡しない。都市表示位置の最低間隔はSantiago de Chile–Valparaísoの既存基準を使用。

## 保存

322都市・52国家・279有効陸路・59水路。道路番号353件は維持。旧54転換路線はretired_since=24、Belgrade–Bucharestだけ25。新規4水路は道路スロットを消費しない。

旧22～24の都市数320を明示して検証し、市場・開発配列の末尾のみ追加。RNG・既存市場・既存開発・適合する水路の状態を維持。Belgrade–Bucharestを含む旧陸路は解除し、積み荷原価と道路権basis+poolを返金、車両は未配置へ戻す。移行後の再ロードでは二重返金しない。

## 参考資料

- [ICPDR: Danube Delta](https://www.icpdr.org/danube-basin/sub-basins/danube-delta)：ドナウ河口と黒海の関係。
- [Romanian Cultural Institute: Sulina In History](https://www.icr.ro/pagini/sulina-in-history/en)：Sulinaの河口立地、ビザンツ期の記録、オスマン期の漁村・砦と19世紀の発展を区別。
- [Hamburg Port Authority: Port Development Plan](https://www.hamburg-port-authority.de/fileadmin/user_upload/port-development-plan2025.pdf)：Hamburgから北海へのエルベ川接続を地理確認に使用。現代の港湾能力はゲームへ移植しない。
- [上海市政府: 歴史沿革](https://japanese.shanghai.gov.cn/ja-Overview/20250912/3558be628f46413abd10936c67784408.html)：16世紀の綿織物産業、1685年の税関設置。上海の経済品目と開始時からの配置の根拠。

## 検証

- `npm run build:wasm`成功。
- `tests/river-mouths.test.js`：3水系の連続性、新港の外洋経路・表示間隔・言語表記、追加5区間の双方向船型制約、3本の海河混合巡回の120日運行・配送、旧24からの移行と一度だけの返金を確認。
- `tests/waterways.test.js`：全59水路、スループ設計の制約、開設・置換・自動増減・保存検証、旧設計船復元を回帰確認。
- 専用9件成功。欧州・アジア・北米・Mexico旧保存・翻訳・リスト・Wasm境界の25件中、初回23件成功。残る2件は「北米追加が都市配列末尾」という旧期待値と、水路化済みVienna–Budaへの馬車配置という旧テスト条件を更新し、再実行で成功。
- 最終ビルド後の8件（上記2件、地理、Wasmソース整合性、既定船型、14社初期艦隊、Pondicherry/江戸旧保存移行）成功。今回確認した異なる関連テストは計38件。全件の`npm test`や50年耐久テストは今回未実行。
- Git HEAD（3.3.10）と比較し、既存320都市・353道路の番号と、旧海路距離行列102,400要素が完全一致。
- 変更JS 11モジュールの構文確認、`git diff --check`成功。
- localhost:4176の独立タブで3水系を表示確認。上海ラベルが蘇州へ近接していたため、上海のラベルのみ右下へ移動。最終ビルドで再確認し、ブラウザーの警告・エラーログなし。ユーザーの127.0.0.1側のゲームには操作せず、検証タブは終了。
- 表示記録：[ドナウ](River-mouth-Danube.jpg)、[エルベ](River-mouth-Elbe.jpg)、[長江](River-mouth-Yangtze.jpg)。
