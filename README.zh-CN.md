# 2052 → 2075 · 世界预测探索

这是一个受约尔根·兰德斯的[《2052》](https://www.2052.info/)启发的独立项目。它展示六个区域、15 张联动图表，并可调整假设以探索至 2075 年的情景。个人预测和命名版本只保存在浏览器。项目使用了 AI 辅助开发，与原作者及出版方无隶属或背书关系。

[访问线上示例](https://world-2052-2075.pages.dev/) · [English](README.md) · [数据与再利用说明](THIRD_PARTY.md)

本项目原创代码采用 [MIT 许可证](LICENSE)。第三方模型与资料遵循各自的条款。

## 本地运行

需要 Python 3 和 Node.js 18 或更高版本，无需安装额外软件包或配置数据库。

```sh
python3 tools/build.py --download-assets
python3 -m http.server --bind 127.0.0.1 --directory dist 8000
```

打开 http://127.0.0.1:8000/。第一条命令从示例网站下载 8 个运行文件并核对哈希，文件只保存在 Git 忽略的 `local-assets/`。下载供本地运行不代表可以重新分发。也可在该目录放入自己有权使用的兼容文件。

此源码版使用模型默认假设，不附带线上示例的保存情景或原作者的只读档案。

## 修改代码

- `web/index.html`、`web/guide.html`：页面、样式和双语说明。
- `web/ui/`：图表绘制、输入交互与预测计算代码。
- `web/runtime/`：浏览器存档、快照和翻译。
- `web/snapshot.html`：保存的预测快照模板。

改完运行 `python3 tools/build.py` 并刷新。运行 `node tests/check-public-runtime.cjs` 可检查保存、历史值隔离和快照规则；存储层由测试替身模拟。自行部署时只使用生成的 `dist/`，并先核对所用数据和模型资料的再分发条款。
