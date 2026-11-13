const names = {
    SumWorld: "全球",
    China: "中国",
    USA: "美国",
    OECD: "OECD（不含美国）",
    BRISE: "BRISE",
    ROW: "世界其他地区",
  },
  colors = ["#237462", "#e58e49", "#547eb6", "#a27caf", "#aeb659", "#6b989a"],
  years = Array.from({ length: 17 }, (_, i) => 1970 + i * 5),
  $ = (id) => document.getElementById(id);
let region = "SumWorld",
  selected = 0,
  compare = new Set(["SumWorld"]);
const translations = {
  Population: "人口",
  Births: "出生人口",
  Deaths: "死亡人口",
  "Crude birth rate": "粗出生率",
  "Crude death rate": "粗死亡率",
  GDP: "国内生产总值",
  "GDP per person": "人均 GDP",
  "Labor productivity": "劳动生产率",
  "Growth in productivity": "生产率增长",
  Consumption: "消费",
  "Consumption per person": "人均消费",
  Investment: "投资",
  "Energy use": "能源使用",
  "Oil use": "石油使用",
  "Gas use": "天然气使用",
  "Coal use": "煤炭使用",
  "Nuclear use": "核能使用",
  "Hydro use": "水电使用",
  "Renewables use": "可再生能源使用",
  "CO2 Emissions": "二氧化碳排放",
  "Food production": "作物总产量",
  "Cultivated land": "作物收获面积",
  "Gross yield": "平均收获单产",
  "Food per person": "人均作物产量",
  "Nonenergy footprint": "非能源生态足迹",
  "Total bio-capacity": "总生物承载力",
  "Unused bio-capacity": "剩余生物承载力",
  "Temperature rise from pre-industrial times (deg C)": "较工业化前的升温",
  "CO2 in Atmosphere (ppm)": "大气二氧化碳浓度",
  "CO2e in Atmosphere (ppme)": "大气温室气体当量",
  "Sealevel rise above level in 2000 (mm)": "较 2000 年的海平面上升",
};
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const norm = (s) =>
  s.replace(/SumWorld|China|USA|OECD-less-US|OECD|BRISE|ROW/g, "REGION");
function zh(s) {
  return localize(s);
}
const fmt = (v) =>
  v == null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

// Keep JSON reads and writes bounded, including a response whose body stalls.
async function forecastRequestJSON(url, options = {}, timeout = 15000) {
  if (
    typeof window !== "undefined" &&
    window.PUBLIC_LOCAL &&
    url.startsWith("/api/")
  )
    return window.PUBLIC_LOCAL.request(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (controller.signal.aborted)
      throw Error("服务响应超时，请确认网页服务仍在运行后重试。");
    if (error instanceof SyntaxError)
      throw Error("服务返回了无法识别的响应，请重试。");
    if (error instanceof TypeError)
      throw Error("无法连接网页服务，请确认服务已启动后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
