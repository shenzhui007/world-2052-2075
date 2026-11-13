# 2052 → 2075 · World Forecast Explorer

A bilingual, browser-based explorer inspired by Jørgen Randers’s [2052](https://www.2052.info/). It displays 15 linked charts across six regions and lets readers explore scenarios through 2075. Forecasts and named snapshots are saved in the browser. This independent project was developed with AI assistance; it is not endorsed by the book’s author or publisher.

[Public demo](https://world-2052-2075.pages.dev/) · [中文说明](README.zh-CN.md) · [Data and reuse notes](THIRD_PARTY.md)

The original project code is available under the [MIT License](LICENSE). Third-party data and model materials have separate terms.

## Run a local copy

Requires Python 3 and Node.js 18 or newer. No package installation, database or account is needed.

```sh
python3 tools/build.py --download-assets
python3 -m http.server --bind 127.0.0.1 --directory dist 8000
```

Open http://127.0.0.1:8000/. The first command downloads eight runtime files from the demo and checks their hashes. They are stored in the ignored `local-assets/` directory. Downloading files for local evaluation does not grant redistribution rights. You can instead provide your own compatible files in that directory; see [Data and reuse notes](THIRD_PARTY.md).

This source edition starts from model defaults. It does not include the demo’s saved default scenario or the original author’s archived snapshot.

## Make changes

| Files | Purpose |
| --- | --- |
| `web/index.html`, `web/guide.html` | Main page, styling and bilingual guide |
| `web/ui/` | Chart rendering, input controls and forecast calculations |
| `web/runtime/` | Browser storage, snapshot handling, and translations |
| `web/snapshot.html` | Page template used in saved forecasts |
| `tools/build.py` | Build static files in `dist/` and update the release hash |
| `local-assets/` | Separately obtained model and data files; see the asset list and reuse notes |

After editing, run `python3 tools/build.py` and refresh. To test forecast saving, historical values, snapshot persistence rules, and storage errors, run `node tests/check-public-runtime.cjs`. This test uses an in-memory stand-in for browser storage. When changing forecast logic, keep historical observations separate from forecast assumptions. Existing named snapshots retain their recorded results.

For your own deployment, use `dist/` only and obtain the necessary permissions for any model and data files you include. The original demo is not linked to this repository and is not updated by a fork.
