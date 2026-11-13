# Third-party model and data / 第三方模型与资料

The code license applies only to this project's own contributions. It grants no rights to the book, original workbook or the contents of separately obtained runtime files. Some runtime files contain workbook-derived equations, data, labels or chart definitions, alongside public-source statistics and project estimates. The download helper provides local access to files already served by the demo; verify applicable terms and attribution separately before redistributing them. References in the guide and chart details identify sources where available.

代码许可证仅适用于本项目有权授权的原创部分，不授予《2052》原书、工作簿或另行取得的模型与数据文件的权利。这些运行文件可能混合了原表派生内容、机构统计资料与项目估算。构建脚本只从现有示例站获取浏览器本来就会加载的文件；再次分发前请单独核对许可和署名要求。

| Required file | Role |
| --- | --- |
| `data.js` | Workbook-based display series |
| `forecast-model.js` | Model cells, formulas and extensions |
| `forecast-input-policy.js` | Allowed model inputs |
| `graphs.js` | Chart definitions, workbook links and series |
| `actual.js` | Historical series and provenance |
| `history.js` | Historical anchors and coverage gaps |
| `reference-data.js` | Auxiliary historical series |
| `methods.js` | Data method and source notes |

If providing your own replacements, keep the script globals and input schema compatible with `web/ui/`. The pinned download rejects changed files, so the same command cannot silently fetch a different model. It does not fetch the book, a workbook, a database or anyone’s forecasts. Keep downloaded files and build outputs out of commits.
