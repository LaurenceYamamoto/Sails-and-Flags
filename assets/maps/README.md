# 地図データ

Natural Earth「1:50m Land」v5.1.2を大西洋地域（西経92～東経14、北緯6～60）でクリップしたもの。パブリックドメイン。政治境界は使用せず、国の所属はゲーム定義で管理する。

- 配布元：https://github.com/nvkelso/natural-earth-vector
- 固定版ソース：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson
- 利用条件：https://www.naturalearthdata.com/about/terms-of-use/
- 加工：scripts/build-map.mjs（入力GeoJSONを引数で指定）。入力SHA256はland.js先頭に記載。

追加の実行時ライブラリ・外部通信は不要。海岸線は縮尺に応じた近似で、現代の自然地形を使用する。都市はおおよその市街地座標をsrc/geography.jsに記録し、海岸線と同じ正距円筒の座標変換で描く。航海用の精密地図ではない。ゲーム上の航海距離は従来の定義を保持する。


## 全世界版（2.0.0-alpha.2）

- world-land.js：同じv5.1.2の全世界データを小数点4桁へ丸めて格納。元JSONのSHA256を生成ファイル先頭に記録。
- world-network.js：海上グラフ8,961点・84,527辺。河口進入を除く全辺は世界海岸線との交差を検査して生成。
- land.jsは旧セーブ・距離互換用に維持し、上書きしない。

再生成（リポジトリルートで実行）：

~~~sh
node scripts/build-world-map.mjs /path/to/ne_50m_land.geojson
node scripts/build-world-network.mjs
node --test tests/world.test.js tests/sea-routing.test.js
~~~

港座標・進入経路はsrc/world-data.js、海峡補助点・海上メッシュは生成スクリプトに定義。日付変更線の接続は折り返し扱い。現代海岸線の一般化データであり、港内・河口航行・1700年当時の海岸線・季節風・水深を厳密には再現しない。Suez/Panamaの人工運河を接続しない。
