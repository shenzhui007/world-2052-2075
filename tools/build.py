#!/usr/bin/env python3
"""Build the static site with separately obtained model assets. No database is read."""
import argparse
import gzip
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
ASSETS = ROOT / "local-assets"
DIST = ROOT / "dist"
ORIGIN = "https://world-2052-2075.pages.dev/"
LOCK = json.loads((ROOT / "tools/asset-lock.json").read_text(encoding="utf-8"))


def read(path):
    return path.read_text(encoding="utf-8")


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def download():
    ASSETS.mkdir(exist_ok=True)
    for name, pin in LOCK.items():
        request = Request(ORIGIN + name, headers={
            "Accept-Encoding": "gzip", "User-Agent": "2052-read-only-release-check",
        })
        try:
            with urlopen(request, timeout=30) as response:
                if response.url != ORIGIN + name:
                    raise SystemExit(f"Unexpected redirect for {name}")
                data = response.read(10 * 1024 * 1024 + 1)
                if response.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
        except URLError as error:
            raise SystemExit(f"Could not download {name}: {error}. See THIRD_PARTY.md for local asset setup.") from error
        if digest(data) != pin:
            raise SystemExit(f"Asset hash differs: {name}. Use the pinned copy or supply your own compatible assets.")
        (ASSETS / name).write_bytes(data)


def build():
    order = json.loads(read(WEB / "script-order.json"))
    assets = {}
    for name in order:
        if not re.fullmatch(r"[a-z][a-z-]*\.js", name):
            raise SystemExit(f"Invalid script name: {name}")
        sources = [folder / name for folder in (WEB / "ui", WEB / "runtime", ASSETS) if (folder / name).is_file()]
        if len(sources) != 1:
            raise SystemExit(f"Expected one source for {name}. See README for asset setup.")
        assets[name] = read(sources[0])
    for name in ("bootstrap.js", "local-store.js"):
        assets[name] = read(WEB / "runtime" / name)
    assets["language.js"] = (
        "window.PUBLIC_TERMS=" + js(json.loads(read(WEB / "runtime/terminology.json"))) + ";\n"
        "window.PUBLIC_ENGLISH=" + js(json.loads(read(WEB / "runtime/english.json"))) + ";\n"
        + read(WEB / "runtime/language.js")
    )

    def script_ref(name):
        return '<script src="' + name + '"></script>'

    html = read(WEB / "snapshot.html")
    snapshot_order = re.findall(r'<script src="([^"]+)"></script>', html)
    if snapshot_order != [name for name in order if name != "local-runtime.js"] + ["language.js"]:
        raise SystemExit("Snapshot script order differs from the main site.")
    snapshot_assets = {name: assets[name] for name in snapshot_order}
    template = js({"html": html, "assets": snapshot_assets})
    inputs = {}
    metadata = {"id": "site-default", "kind": "user", "name": "网站默认预测（公共基准）", "endYear": 2075}
    payload = js({"assets": snapshot_assets, "inputs": inputs, "kind": "user"})
    result = subprocess.run(
        ["node", str(ROOT / "tools/snapshot-results.cjs")],
        input=payload.encode("utf-8"), stdout=subprocess.PIPE, check=True,
    )
    archive = {**metadata, "results": json.loads(result.stdout)}
    default = html.replace(
        script_ref("data.js"),
        "<script>window.FORECAST_ARCHIVE=" + js(archive)
        + ";window.DATABASE_STATE=" + js({"inputs": inputs, "revision": 0})
        + ";</script>" + script_ref("data.js"), 1,
    )
    for name, code in snapshot_assets.items():
        default = default.replace(script_ref(name), "<script>" + code.replace("</script", "<\\/script") + "</script>", 1)

    guide = read(WEB / "guide.html")
    index = read(WEB / "index.html")
    release = "source-" + digest(js([assets, index, guide, html, default]).encode())[:12]
    config = {
        "release": release, "inputs": inputs, "scripts": order,
        "templateHash": digest(template.encode()),
        "versions": [{**metadata, "file": "default.html", "public": True}],
    }
    DIST.mkdir(exist_ok=True)
    for name, data in {**assets, "index.html": index, "guide.html": guide.replace("__RELEASE__", release),
                       "default.html": default, "snapshot-template.json": template,
                       "release.json": js(config) + "\n"}.items():
        (DIST / name).write_bytes(data.encode("utf-8"))
    for name in ("404.html", "_headers"):
        shutil.copyfile(WEB / name, DIST / name)
    print(f"Built {release} in dist/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-assets", action="store_true", help="Fetch and verify the public runtime assets first.")
    args = parser.parse_args()
    if args.download_assets:
        download()
    build()
