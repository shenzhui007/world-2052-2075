// Load complete DOM-free modules in the same order as the page.
// Tests never copy function bodies or depend on source-text boundaries.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const dist = path.resolve(__dirname, "../../dist");
exports.createContext = function createContext(options = {}) {
  const context = vm.createContext({
    console,
    ...(options.archive
      ? { window: { FORECAST_ARCHIVE: options.archive } }
      : {}),
  });
  vm.runInContext(
    `let forecastOverrides={};
    const names={China:'中国',USA:'美国',OECD:'OECD',BRISE:'BRISE',ROW:'其他地区',SumWorld:'全球'};
    function norm(s){return s.replace(/SumWorld|China|USA|OECD-less-US|OECD|BRISE|ROW/g,'REGION')}
    function fmt(v){return Number.isFinite(v)?String(Math.round(v*100)/100):'—'}
    function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}
  `,
    context,
  );
  for (const file of [
    "forecast-model.js",
    "forecast-engine.js",
    "actual.js",
    "history.js",
    "graphs.js",
    "data.js",
    "localization.js",
    "forecast-input-policy.js",
    "forecast-policy.js",
    "graph-metrics.js",
    "graph-state.js",
    "provenance.js",
    "graph-details.js",
    "graph-plot.js",
    "graph-edit.js",
    "graph-hover.js",
  ]) {
    vm.runInContext(
      options.assets?.[file] ?? fs.readFileSync(path.join(dist, file), "utf8"),
      context,
      {
        filename: file,
      },
    );
  }
  return context;
};
