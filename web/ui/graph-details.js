// Year detail text and provenance presentation.
function graphPointDetails(s, i, v) {
  const year = 1970 + i * 5,
    historical = graphIsHistoricalPoint(s, i);
  let entry = null;
  if (historical) {
    const label = s.label
      .replace(/\s*\(0\s*-.*?\)/, "")
      .replace(/,?\s*Your (?:forecast|forcast).*$/i, "")
      .trim();
    const key = gPointKey(label);
    entry = graphHistoricalEntry(s);
  }
  const raw = Object.hasOwn(s, "actualValues") ? s.actualValues[i] : v;
  let number = s.population && s.actualValues ? Math.round(raw * 1e6) : raw,
    unit = s.actualValues
      ? s.livingStandard || s.physicalSeries
        ? graphConcreteUnit(s)
        : s.population
          ? "人"
          : "%／年"
      : graphConcreteUnit(s);
  if (historical && entry?.points[year] != null && !s.actualValues) {
    number = entry.points[year];
    const row = DATA[s.sheet]?.find(
      (r) =>
        norm(r.label) ===
        gPointKey(s.label.replace(/\s*\(0\s*-.*?\)/, "").trim()),
    );
    unit = graphConcreteUnit(s);
  }
  if (!s.actualValues) {
    const clean = s.label.replace(/\s*\(0\s*-.*?\)/, "").trim(),
      row = DATA[s.sheet]?.find((r) => norm(r.label) === gPointKey(clean));
    if (!historical || entry?.points[year] == null) {
      const displayIndex =
          forecastArchiveState()?.kind !== "author" &&
          /^Growth in productivity/i.test(s.label) &&
          i >= 11
            ? i + 1
            : i,
        formula =
          FORECAST_MODEL.extension[s.sheet]?.[
            graphSeriesAddress(s, displayIndex)
          ] ??
          FORECAST_MODEL.cells[s.sheet]?.[graphSeriesAddress(s, displayIndex)],
        divisor =
          typeof formula === "string" && formula.match(/\/(\$?[A-Z]+\$?\d+)$/);
      if (divisor) {
        try {
          number =
            v *
            (historical ? historicalEngine() : scenarioEngine()).cell(
              s.sheet,
              divisor[1],
            );
          unit = graphConcreteUnit(s);
        } catch {}
      }
    }
    if (/^Support burden/i.test(s.label)) unit = "倍";
  }
  if (forecastArchiveState()?.kind === "author") {
    // Original chart coordinates sometimes divide people by 1000 before scaling.
    // Prefer the author's unscaled cached quantity to avoid changing its unit.
    const key = gPointKey(s.label).toLowerCase();
    const original = DATA[s.sheet]?.find(
      (row) => row.kind === "原表基准" && norm(row.label).toLowerCase() === key,
    );
    if (!s.livingStandard && Number.isFinite(original?.values[i])) {
      number = original.values[i];
      if (s.population) number = Math.round(number * 1e6);
    }
    if (/^Cultivated land/i.test(s.label)) unit = "百万公顷（耕地面积）";
    return (
      (s.displayLabel || localize(s.label)) +
      "\n" +
      year +
      "年 · " +
      (historical ? "原书历史参考" : "作者当时的预测") +
      "\n数值：" +
      (unit ? fmt(number) + " " + unit : "—（单位待核实）") +
      "\n" +
      (historical ? "来源：《2052》原始表历史参考" : "数据类型：作者预测")
    );
  }
  const pointSources = provenanceSources({
    ...entry,
    sources: entry?.yearSources?.[year] || entry?.sources,
  });
  const calculation =
      historical &&
      entry?.points[year] != null &&
      entry?.yearCalculations?.[year]
        ? entry.yearCalculations[year]
        : historical &&
            entry?.points[year] != null &&
            entry?.yearUncertainty?.[year]?.type === "proxy"
          ? entry.yearCalculations?.[year] || ""
          : historical &&
              entry?.points[year] != null &&
              (entry?.agriculture || entry?.footprint)
            ? entry.yearCalculations?.[year] || entry.calculationText || ""
            : historical &&
                entry?.points[year] != null &&
                /^Sea level rise/i.test(s.label)
              ? ""
              : calculationProvenance(s, i),
    sources =
      calculation.includes("预测值（用户设定") ||
      Object.hasOwn(
        forecastOverrides,
        graphIntervalTarget(s, i, { number: activeForecastGraph })?.key || "",
      )
        ? graphIsForecastInput(s, i)
          ? "预测值（用户设定）"
          : "预测计算值（依据用户设定计算）"
        : entry?.points[year] != null && pointSources !== "来源待核实"
          ? graphHistoricalValueType(entry, year) +
            (entry.yearEvidence?.[year]?.complete === false
              ? "（区域资料不完整）"
              : "") +
            " · " +
            pointSources +
            (entry.yearNotes?.[year] && !entry.footprint
              ? "\n" + entry.yearNotes[year]
              : "") +
            (entry.historicalCalculation
              ? "\n" +
                (/^Investment/.test(s.label)
                  ? "投资 = " +
                    fmt(entry.calculationInputs[year].gdp) +
                    " × " +
                    fmt(entry.calculationInputs[year].share) +
                    "%"
                  : "消费 = " +
                    fmt(entry.calculationInputs[year].gdp) +
                    " − " +
                    fmt(entry.calculationInputs[year].investment)) +
                " 万亿2005年PPP美元／年（桥接估算）"
              : "")
          : historical
            ? calculation.includes("计算方法：")
              ? calculation.includes("桥接估算")
                ? "历史估算值"
                : "历史计算值"
              : "来源待核实"
            : graphIsForecastInput(s, i)
              ? "预测值（模型默认假设）"
              : "预测计算值（依据模型假设计算）",
    basis = historical
      ? "来源：" + sources + "\n" + calculation
      : "数据类型：" + sources;
  if (!unit)
    return (
      (s.displayLabel || localize(s.label)) +
      "\n" +
      year +
      "年\n数值：—（单位尚未核实，暂不显示）\n" +
      basis
    );
  return (
    (s.displayLabel || localize(s.label)) +
    "\n" +
    year +
    (!historical &&
    (/^Growth in productivity/i.test(s.label) || s.forecastIntervalResult)
      ? "—" +
        (year + 5) +
        (s.forecastIntervalResult ? "年区间（末年值）" : "年区间假设")
      : "年") +
    " · " +
    (historical
      ? entry?.modelReference
        ? "历史模型参考"
        : "历史数据"
      : "情景预测") +
    "\n数值：" +
    fmt(number) +
    " " +
    unit +
    "\n" +
    basis +
    (historical && entry?.bridge && entry.native?.points[year] != null
      ? "\n来源原值：" +
        fmt(entry.native.points[year]) +
        " " +
        entry.native.unit +
        "（模型数值为桥接估算）"
      : "")
  );
}
function originalGraphPointDetails(series, index) {
  try {
    const engine = forecastEngine(FORECAST_MODEL, {}, true),
      addr = graphSeriesAddress(series, index),
      value = engine.cell(series.sheet, addr);
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const formula =
        FORECAST_MODEL.cells[series.sheet]?.[addr] ??
        FORECAST_MODEL.extension[series.sheet]?.[addr],
      scaleRef =
        typeof formula === "string" && formula.match(/\/(\$?[A-Z]+\$?\d+)$/);
    let number = value,
      unit = graphConcreteUnit(series);
    if (scaleRef) {
      number = value * engine.cell(series.sheet, scaleRef[1]);
      const row = DATA[series.sheet]?.find(
        (r) =>
          norm(r.label) ===
          gPointKey(series.label.replace(/\s*\(0\s*-.*?\)/, "").trim()),
      );
      unit = graphConcreteUnit(series);
    }
    if (/^(GDP|Consumption) per person/i.test(series.label)) number *= 1000;
    if (/^Sea level rise/i.test(series.label)) number /= 1000;
    if (series.population) {
      number = Math.round(number * 1e6);
      unit = "人";
    } else if (/^Crude (birth|death) rate/i.test(series.label)) unit = "%／年";
    if (!unit) return null;
    return {
      number,
      unit,
      source: "来源待核实",
      note:
        1970 + index * 5 >= 2015
          ? "当时的预测值，非实际统计"
          : "历史保留值，出处待核实",
    };
  } catch {
    return null;
  }
}

function graphPopulationIntervalDetails(series) {
  const value = graphPopulationIntervalRate(series);
  if (!Number.isFinite(value)) return null;
  const birth = /birth/i.test(series.label),
    key = series.sheet + "!" + (birth ? "POP_BIRTH_2025" : "POP_DEATH_2025"),
    type =
      series.sheet === "SumWorld"
        ? "预测计算值（按各地区人口加权）"
        : Object.hasOwn(forecastOverrides, key)
          ? "预测值（用户设定）"
          : "预测值（模型默认假设）";
  return (
    (birth ? "粗出生率" : "粗死亡率") +
    "（2025—2030年区间）\n2025—2030年 · 情景预测\n数值：" +
    fmt(value) +
    " %／年\n数据类型：" +
    type
  );
}

function graphPopulationIntervalMatchesHistory(series) {
  const forecast = graphPopulationIntervalRate(series),
    actual = series.actualValues?.[11];
  return (
    Number.isFinite(actual) &&
    Number.isFinite(forecast) &&
    Math.abs(actual - forecast) <= 1e-10 * Math.max(1, Math.abs(actual))
  );
}
