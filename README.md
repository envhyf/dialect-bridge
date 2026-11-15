# 乡音桥 · Dialect Bridge

循着一声乡音，探索汉语方言的区域、片、小片与双向听辨实验。

**[打开网页](https://paisheng.me/dialect-bridge/)** · [数据说明](docs/data-method.md) · [研究依据](docs/research.md)

## 使用

- 点击真实区域，查看分类层级、来源图号、配准误差，以及区域内已有的实验样本。
- 切换大区 / 片 / 小片。小片尚未描绘处保留已知片界；片界尚未覆盖处保留 A2 总图，不用行政边界或城市圆圈补空。
- 选择家乡区域，再点击另一片乡音，颜色显示分类关系。**区域没有实测百分比。** 可另选具体研究点查看双向实验。
- 客家话居民点为独立三角符号；15 个实验样本点可单独开启，缩放时保持小尺寸。
- 本地打开自己持有的扫描图，红线叠加保存的原图描边。图片不上传，公开仓库不含原扫描。

## 当前覆盖

`dist/data/regions.geojson` 的 metadata 记录最新数量与图号。当前为 **88 个原图描边要素、9 个已绘小片合并的局部父片**，来自 B2、B3、B6、B7、B9、B11、B12、B13。分离片块可以是独立要素，数量不是全国方言片总数。

**这是局部人工概化初描，不是全国完整片 / 小片地图，也不是村镇级精确边界。** 部分海岛、混合语言区、方言岛和图幅外片块仍未绘出。每个要素保留来源像素、分类、描绘方式和覆盖限制。

- A2 总图：10 类汉语方言色区，40 个控制点。修正文字/河线误挖孔洞，拟合投影配准的留一 RMSE 为 **15.70 km**；旧版二阶多项式为 21.94 km。
- 各地区详图独立配准，逐图误差公开。该误差不等于方言边界精度。
- 84 个地点代表变体，不代表全市居民；四川盆地 66 个客家居民点是局部符号转录。
- Tang（2009）15 个方言点、225 个有方向组合 × 2 个任务，共450条观测。实验正确率不等于日常对话理解率，也不推广为整个片区的能力。

## 部署和检查

纯静态网页，无 npm 依赖、API Key 或框架打包步骤。Node.js 22+：

```sh
npm start
npm test
npm run build
```

预览为 `http://127.0.0.1:8768`。GitHub Pages 设置为 GitHub Actions，推送 main 后检查并发布 dist。其他静态主机直接上传 dist 的全部内容即可。

## 数据复现

安装 requirements.txt；自备对应扫描图，始终放在公开产物之外。

```sh
python scripts/refine-overview.py --source /private/path/A2.JPG
python scripts/regions_north.py
python scripts/regions_wu_gan.py
python scripts/regions_south.py
python scripts/assemble-regions.py
python tests/test_segmentation.py
```

地区脚本默认读取相邻私有目录 `dialect-atlas/reference/`（路径见脚本顶部）；可按本地存放位置修改。详见 [北方](docs/regions-north.md)、[吴赣湘](docs/regions-wu-gan.md)、[南方](docs/regions-south.md) 的源图控制点、复现步骤和缺失清单。旧 scripts/digitize.py 仅保留为第一版算法记录，不能用它覆盖新版数据。

公开产物验证会阻止扫描图片进入 dist；qa、reference 均被 Git 忽略。

## 来源

《中国语言地图集》用户持有的历史扫描版，版权归原权利人；本仓库未发布完整原图。DataV 为独立行政底图，与「赶集志」同源。[Tang 2009, LOT 228](https://www.lotpublications.nl/Documents/228_fulltext.pdf) 表4.2、4.3为实验来源。D3 v7 使用 ISC 许可，见 dist/vendor/D3-LICENSE.txt。代码公开不改变研究数据和地图原有权利。
