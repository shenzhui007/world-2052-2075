const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto").webcrypto;
const { createContext } = require("./helpers/runtime.cjs");
const path = require("node:path");
const site = path.resolve(__dirname, "../dist");
(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(site, "release.json")));
  const records = new Map();
  let fail = false;
  const store = {
    async get(id) {
      return records.get(id);
    },
    async all() {
      return [...records.values()];
    },
    async put(record) {
      if (fail) throw Error("QuotaExceededError");
      records.set(record.id, record);
    },
    async commitCurrent(record, revision) {
      if (fail) throw Error("QuotaExceededError");
      if ((records.get("current")?.revision || 0) !== revision)
        throw Error("其他页面已保存");
      records.set("current", record);
    },
    async remove(id) {
      records.delete(id);
    },
  };
  const context = createContext();
  Object.assign(context, {
    window: { PUBLIC_CONFIG: config },
    publicStore: store,
    crypto,
    TextEncoder,
    fetch: async (name) => ({
      ok: true,
      text: async () => fs.readFileSync(path.join(site, name), "utf8"),
    }),
  });
  vm.runInContext(
    fs.readFileSync(path.join(site, "local-runtime.js"), "utf8"),
    context,
  );
  const runtime = context.window.PUBLIC_LOCAL;
  const inputs = { ...config.inputs, "China!POP_BIRTH_2025": 0.6 };
  const call = (url, payload) =>
    runtime.request(url, payload ? { body: JSON.stringify(payload) } : {});
  await call("/api/forecast", { inputs, revision: 0 });
  const current = records.get("current");
  assert.equal(current.inputs["China!POP_BIRTH_2025"], 0.6);
  assert.deepEqual(config.inputs, {}, "no maintainer forecast bundled");
  assert(!Object.hasOwn(config, "sourceSavedAt"), "no maintainer save metadata");
  assert(current.html.includes("window.FORECAST_ARCHIVE="));
  assert(!/<script src=/.test(current.html), "snapshot is self-contained");
  const archive = JSON.parse(
    current.html.match(
      /window.FORECAST_ARCHIVE=(.*?);window.DATABASE_STATE=/s,
    )[1],
  );
  const historyBefore = vm.runInContext(
    'historicalEngine().cell("China","M9")',
    context,
  );
  assert.equal(
    archive.results.historical["China!M9"],
    historyBefore,
    "historical values unchanged",
  );
  assert.equal(
    archive.results.scenario["China!N9"],
    historyBefore *
      (1 +
        ((0.6 -
          vm.runInContext('populationIntervalRate("China",false)', context)) /
          100) *
          5),
  );
  await assert.rejects(
    call("/api/forecast", { inputs, revision: 0 }),
    /其他页面/,
  );
  assert.equal(records.get("current").revision, 1);
  await call("/api/versions", {
    inputs,
    name: "较低出生率 <情景>",
    requestId: "test-personal",
  });
  assert.equal((await call("/api/versions")).data.versions.length, 2);
  assert.equal(records.get("test-personal").name, "较低出生率 <情景>");
  const frozen = records.get("test-personal").html;
  vm.runInContext('forecastOverrides={"China!POP_BIRTH_2025":2}', context);
  assert.equal(
    records.get("test-personal").html,
    frozen,
    "later edits never rewrite frozen snapshots",
  );
  fail = true;
  await assert.rejects(
    call("/api/forecast", { inputs: {}, revision: 1 }),
    /Quota/,
  );
  await assert.rejects(
    call("/api/versions", { inputs, name: "满空间", requestId: "not-written" }),
    /Quota/,
  );
  assert(!records.has("not-written"));
  assert.equal(
    records.get("current"),
    current,
    "failed save retains previous current",
  );
  await assert.rejects(runtime.remove("site-default"), /不能删除/);
  fail = false;
  await runtime.remove("test-personal");
  assert(!records.has("test-personal"));
  for (const file of fs.readdirSync(site))
    assert(!/sqlite|xlsx|epub|backup/i.test(file));
  console.log(
    "PASS: browser-only adapter, frozen numerical results, unchanged history, explicit saves, conflicts, quota failure, naming, deletion and release whitelist. Store mocked; actual IndexedDB covered by browser acceptance.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
