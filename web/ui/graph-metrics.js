// Indicator units, aliases and historical/prediction selection.
// First match wins. Labels may contain a historical plotting range; it is not a unit.
const GRAPH_METRICS = Object.freeze(
  [
    {
      id: "unused-capacity-share",
      match: /^Unused bio-capacity.*\(0\s*-.*%/,
      unit: "%",
    },
    {
      id: "co2-equivalent",
      match: /^CO2 equivalent in atmosphere/i,
      unit: "ppm（二氧化碳当量）",
    },
    { id: "support-burden", match: /^Support burden/i, unit: "倍" },
    { id: "food-production", match: /^Food production/i, unit: "百万吨／年" },
    { id: "gross-yield", match: /^Gross yield/i, unit: "吨／公顷" },
    {
      id: "gdp-per-person",
      match: /^GDP per (person|capita)/i,
      unit: "2005年PPP美元／人／年",
    },
    {
      id: "consumption-per-person",
      match: /^Consumption per (person|capita)/i,
      unit: "2005年PPP美元／人／年",
    },
    {
      id: "labor-productivity",
      match: /^Labor productivity/i,
      unit: "2005年PPP美元／人／年",
    },
    {
      id: "monetary-flow",
      match: /^(Investment|Consumption)(?:$|\s*\()/i,
      unit: "万亿2005年PPP美元／年",
    },
    {
      id: "energy-intensity",
      match: /^Energy intensity/i,
      unit: "吨油当量／百万2005年PPP美元",
    },
    {
      id: "harvested-area",
      match: /^Cultivated land/i,
      unit: "百万公顷（收获面积，含复种）",
    },
    { id: "food-per-person", match: /^Food per person/i, unit: "吨／人／年" },
    {
      id: "energy-per-person",
      match: /^Energy use per person/i,
      unit: "吨油当量／人／年",
    },
    { id: "sea-level", match: /^Sea level rise/i, unit: "米" },
    {
      id: "temperature",
      match: /^Temperature/i,
      unit: "℃（相对工业化前）",
      key: "Temperature rise from pre-industrial times (deg C)",
      global: true,
    },
    {
      id: "co2-atmosphere",
      match: /^CO2 in atmosphere/i,
      key: "CO2 in Atmosphere (ppm)",
      global: true,
    },
    { id: "population", match: /^Population/i, key: "Population, REGION" },
    { id: "birth-rate", match: /^Crude birth rate/i, key: "Crude birth rate" },
    { id: "death-rate", match: /^Crude death rate/i, key: "Crude death rate" },
    {
      id: "gdp",
      match: /^GDP$|^GDP (?:China|USA|OECD|BRISE|ROW|SumWorld)/i,
      key: "GDP REGION",
      unit: "万亿2005年PPP美元／年",
    },
    {
      id: "investment-share",
      match: /^Investment share of GDP|^% Investment share/i,
      key: "% Investment share",
      unit: "%",
    },
    {
      id: "renewable-share",
      match: /^Fraction renewable/i,
      key: "% renewables",
      unit: "%",
    },
    { id: "other-share", match: /^%|Investment share|normal \+/i, unit: "%" },
  ].map(Object.freeze),
);
function graphMetricDefinition(series) {
  const label = typeof series === "string" ? series : series.label;
  return GRAPH_METRICS.find((metric) => metric.match.test(label)) || null;
}
function graphCleanLabel(label) {
  return label.replace(/\s*\(0\s*-.*?\)/, "").trim();
}
function graphConcreteUnit(series) {
  const metric = graphMetricDefinition(series);
  if (metric?.unit) return metric.unit;
  const label = graphCleanLabel(series.label);
  const addr = series.addresses[0],
    formula = FORECAST_MODEL.cells[series.sheet]?.[addr],
    ref =
      typeof formula === "string" &&
      formula.match(/^=(?:(\w+)!)?\$?[A-Z]+\$?(\d+)\//),
    direct = addr.match(/^[A-Z]+(\d+)$/);
  const rows = DATA[ref?.[1] || series.sheet] || [],
    row = ref
      ? rows.find((r) => r.row === +ref[2])
      : rows.find((r) => norm(r.label) === gPointKey(label)) ||
        rows.find((r) => r.row === +direct?.[1]);
  return row?.unit ? localize(row.unit) : null;
}

function isCustomGraphSeries(s) {
  return /your (?:forecast|forcast)/i.test(s.label);
}
function graphSeriesLabel(s, future = false) {
  return (
    (s.displayLabel || localize(s.label)) +
    (s.forecastIntervalResult ? " · 区间末值" : "")
  );
}
function gPointKey(label) {
  const clean = graphCleanLabel(label);
  return graphMetricDefinition(clean)?.key || norm(clean);
}
function graphHistoricalEntry(series) {
  const key = gPointKey(series.label),
    metric = graphMetricDefinition(series);
  return (
    ACTUAL[series.sheet]?.[key] ||
    (metric?.global ? ACTUAL.SumWorld?.[key] : null)
  );
}
function graphIsHistoricalPoint(series, index) {
  if (forecastArchiveState()?.kind === "author") return index <= 8;
  const year = 1970 + index * 5;
  return (
    year <= 2025 &&
    !(year === 2025 && /^Growth in productivity/i.test(series.label)) &&
    !graphUses2025Prediction(series, index)
  );
}
function graphUses2025Prediction(s, i) {
  return (
    i === 11 &&
    (/^(Temperature|Sea level rise|CO2 (?:in|equivalent in) atmosphere)/i.test(
      s.label,
    ) ||
      graphHistoricalEntry(s)?.points[2025] == null)
  );
}
function safeLivingStandardValue(s, i, engine) {
  try {
    const value = livingStandardValue(s, i, engine);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// Classification is shared by page details and the coverage audit.
// Per-year evidence takes priority over a dataset's general description.
function graphHistoricalValueType(entry, year) {
  if (entry?.modelReference) return "历史模型参考";
  if (entry?.yearEvidence?.[year]?.kind === "verified_original_sum")
    return "历史计算值";
  const note = entry?.yearNotes?.[year] || "";
  const hasYearEvidence = Boolean(note);
  if (
    entry?.yearUncertainty?.[year] ||
    entry?.bridge ||
    /估算|回推|插值|外推/.test(note) ||
    (!hasYearEvidence && /估算|回推|插值|外推/.test(entry?.method || ""))
  )
    return "历史估算值";
  if (
    entry?.historicalCalculation ||
    entry?.calculationText ||
    entry?.yearCalculations?.[year] ||
    /计算|汇总|加权/.test(note + " " + (entry?.method || ""))
  )
    return "历史计算值";
  return "历史资料值";
}
