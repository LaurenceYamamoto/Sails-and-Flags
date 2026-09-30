# 地図データ

Natural Earth「1:50m Land」v5.1.2を大西洋地域（西経92～東経14、北緯6～60）でクリップしたもの。パブリックドメイン。政治境界は使用せず、国の所属はゲーム定義で管理する。

- 配布元：https://github.com/nvkelso/natural-earth-vector
- 固定版ソース：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson
- 利用条件：https://www.naturalearthdata.com/about/terms-of-use/
- 加工：scripts/build-map.mjs（入力GeoJSONを引数で指定）。入力SHA256はland.js先頭に記載。

追加の実行時ライブラリ・外部通信は不要。海岸線は縮尺に応じた近似で、現代の自然地形を使用する。都市はおおよその市街地座標をsrc/geography.jsに記録し、海岸線と同じ正距円筒の座標変換で描く。航海用の精密地図ではない。ゲーム上の航海距離は従来の定義を保持する。
