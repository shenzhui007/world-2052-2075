// Loaded after model policy, before forecast UI; never contacts a forecast server.
window.PUBLIC_LOCAL = (() => {
  let templatePromise;
  const config = window.PUBLIC_CONFIG;
  const template = () =>
    (templatePromise ||= fetch("snapshot-template.json")
      .then(async (r) => {
        if (!r.ok) throw Error("无法读取版本模板");
        const raw = await r.text();
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(raw),
            ),
          ),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== config.templateHash)
          throw Error("网站文件已更新，请另开页面核对；当前草稿仍保留。");
        return JSON.parse(raw);
      })
      .catch((error) => {
        templatePromise = null;
        throw error;
      }));
  const encode = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
  function freezeResults() {
    const all = { historical: {}, scenario: {} };
    for (const [kind, engine] of [
      ["historical", historicalEngine()],
      ["scenario", scenarioEngine()],
    ]) {
      for (const [sheet, cells] of Object.entries(FORECAST_MODEL.cells)) {
        const keys = new Set([
          ...Object.keys(cells),
          ...Object.keys(FORECAST_MODEL.extension[sheet] || {}),
        ]);
        for (const key of Object.keys(HISTORY_VALUES))
          if (key.startsWith(sheet + "!")) keys.add(key.split("!")[1]);
        for (const addr of keys) {
          try {
            const value = engine.cell(sheet, addr);
            all[kind][sheet + "!" + addr] =
              typeof value === "number" && !Number.isFinite(value)
                ? null
                : (value ?? null);
          } catch {
            all[kind][sheet + "!" + addr] = null;
          }
        }
      }
    }
    return all;
  }
  async function capture(inputs, metadata) {
    const base = await template();
    // The complete numerical result, assets and presentation are retained locally.
    // Inputs passed by the click are evaluated synchronously without a draft race.
    const draft = forecastOverrides;
    let results;
    try {
      forecastOverrides = { ...inputs };
      results = freezeResults();
    } finally {
      forecastOverrides = draft;
    }
    let html = base.html;
    const boot =
      "<script>window.FORECAST_ARCHIVE=" +
      encode({ ...metadata, results }) +
      ";window.DATABASE_STATE=" +
      encode({ inputs, revision: 0 }) +
      ";</script>";
    html = html.replace(
      '<script src="data.js"></script>',
      boot + '<script src="data.js"></script>',
    );
    for (const [name, code] of Object.entries(base.assets))
      html = html.replace(
        '<script src="' + name + '"></script>',
        () =>
          "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>",
      );
    html = html.replace(
      "</style>",
      "header{display:none}main{max-width:none;padding:0;margin:0}body{background:transparent}</style>",
    );
    return html;
  }
  const ok = (data) => ({ ok: true, status: 200, data });
  return {
    async request(url, options = {}) {
      if (window.PUBLIC_STORAGE_ERROR) {
        if (url === "/api/versions" && !options.body)
          return ok({ versions: config.versions });
        throw Error("浏览器存储不可用：" + window.PUBLIC_STORAGE_ERROR);
      }
      const payload = options.body ? JSON.parse(options.body) : null;
      if (url === "/api/forecast" && payload) {
        const revision = payload.revision + 1;
        const html = await capture(payload.inputs, {
          kind: "user",
          endYear: 2075,
        });
        await publicStore.commitCurrent(
          {
            id: "current",
            inputs: payload.inputs,
            revision,
            release: config.release,
            html,
          },
          payload.revision,
        );
        return ok({ revision });
      }
      if (url === "/api/versions" && !payload) {
        const personal = (await publicStore.all())
          .filter((v) => v.id !== "current")
          .map(({ html, inputs, ...v }) => v);
        for (const version of personal)
          window.PUBLIC_LANGUAGE?.protectName(version.name);
        return ok({
          versions: [
            ...config.versions,
            ...personal.sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
          ],
        });
      }
      if (url === "/api/versions" && payload) {
        const id = payload.requestId;
        const previous = await publicStore.get(id);
        if (previous) return ok({ version: previous });
        window.PUBLIC_LANGUAGE?.protectName(payload.name);
        const version = {
          id,
          kind: "user",
          name: payload.name,
          savedAt: new Date().toISOString(),
          endYear: 2075,
          release: config.release,
        };
        const html = await capture(payload.inputs, version);
        await publicStore.put({ ...version, html });
        return ok({ version });
      }
      throw Error("公开版不支持此操作");
    },
    async openVersion(id, frame, region, graph) {
      const baseline = config.versions.find((v) => v.id === id);
      let html;
      if (baseline) {
        const response = await fetch(baseline.file);
        if (!response.ok) throw Error("公共基准加载失败");
        html = await response.text();
      } else html = (await publicStore.get(id))?.html;
      if (!html) throw Error("本地版本不存在");
      const view =
        '<script>window.addEventListener("load",()=>{const r=document.getElementById("graphs-region"),g=document.getElementById("graphs-select");if(r){r.value=' +
        encode(region) +
        ';r.dispatchEvent(new Event("change"));}if(g){g.value=' +
        encode(String(graph)) +
        ';g.dispatchEvent(new Event("change"));}});</script>';
      frame.srcdoc = html.replace("</html>", view + "</html>");
    },
    async remove(id) {
      if (id === "current" || config.versions.some((v) => v.id === id))
        throw Error("不能删除公共基准");
      await publicStore.remove(id);
    },
  };
})();
