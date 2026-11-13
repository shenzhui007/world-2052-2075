// Public provenance uses named quantities; internal cell identifiers are never source citations.
function provenanceSources(entry) {
  return (
    (entry?.sources || [])
      .filter(
        (s) =>
          s.url &&
          /^https?:/.test(s.url) &&
          !/(source\.xlsx|工作[簿薄]|excel)/i.test(s.title + " " + s.url),
      )
      .map((s) => localize(s.title) + " · " + s.url)
      .join("\n") || "来源待核实"
  );
}
function calculationProvenance(series, index) {
  const interval =
      (series.forecastIntervalResult ||
        /^Growth in productivity/i.test(series.label)) &&
      index >= 11,
    year = 1970 + index * 5,
    engine = graphIsHistoricalPoint(series, index)
      ? historicalEngine()
      : scenarioEngine(),
    address = graphSeriesAddress(series, index + (interval ? 1 : 0)),
    raw = (sheet, a) =>
      FORECAST_MODEL.extension[sheet]?.[a] ?? FORECAST_MODEL.cells[sheet]?.[a];
  let formula = raw(series.sheet, address),
    sheet = series.sheet;
  // Strip plotting normalization, retaining only the physical calculation.
  if (typeof formula === "string")
    formula = formula.replace(/\/\$[A-Z]+\$?\d+$/, "");
  if (
    /^(GDP|Consumption) per person/i.test(series.label) &&
    typeof formula === "string"
  )
    formula = formula.replace(/\*1000\b/, "*1000000");
  if (/^Sea level rise/i.test(series.label) && typeof formula === "string")
    formula += " /1000";
  const direct =
    typeof formula === "string" &&
    formula.match(/^=(?:(\w+)!)?(\$?[A-Z]+\$?\d+)$/);
  let count = 0;
  const seen = new Set(),
    lines = [];
  function info(sh, a) {
    a = a.replaceAll("$", "");
    const match = a.match(/^([A-Z]+)(\d+)$/),
      row = DATA[sh]?.find((r) => r.row === +match?.[2]);
    let col = 0;
    for (const c of match?.[1] || "") col = col * 26 + c.charCodeAt(0) - 64;
    const yr = 1970 + (col - 2) * 5;
    return {
      a,
      row,
      yr,
      name:
        (names[sh] || sh) +
        " · " +
        localize(row?.label || "辅助参数") +
        "（" +
        yr +
        "年）",
      unit: localize(row?.unit || ""),
    };
  }
  function value(sh, a) {
    try {
      return engine.cell(sh, a);
    } catch {
      return null;
    }
  }
  function visit(sh, a, depth) {
    const meta = info(sh, a),
      key = sh + "!" + meta.a;
    if (seen.has(key) || count++ >= 60) return;
    seen.add(key);
    const v = value(sh, meta.a),
      entry = Object.entries(ACTUAL[sh] || {}).find(
        ([label]) => norm(label) === gPointKey(meta.row?.label || ""),
      )?.[1],
      actual = entry?.points[meta.yr],
      f = raw(sh, meta.a),
      user = Object.hasOwn(forecastOverrides, key);
    lines.push(meta.name + " = " + fmt(v) + (meta.unit ? " " + meta.unit : ""));
    if (Object.hasOwn(HISTORY_VALUES, key) || actual != null) {
      lines.push(
        "输入来源：" +
          provenanceSources({
            ...entry,
            sources: entry?.yearSources?.[meta.yr] || entry?.sources,
          }),
      );
      if (entry?.method)
        lines.push(
          "数据处理：" +
            (entry.yearEvidence?.[meta.yr]?.kind === "verified_original_sum"
              ? "PWT7原始记录汇总，未桥接"
              : entry.method),
        );
      if (entry?.yearNotes?.[meta.yr] || entry?.note)
        lines.push("输入说明：" + (entry.yearNotes?.[meta.yr] || entry.note));
      if (meta.row?.label === "Labor productivity") {
        lines.push(
          "计算方法：劳动生产率 = GDP ÷ 15—64岁人口 × 1000000（万亿2005年PPP美元／百万人换算为2005年PPP美元／人）",
        );
        visit(sh, meta.a.replace(/\d+$/, "96"), depth + 1);
        visit(sh, meta.a.replace(/\d+$/, "97"), depth + 1);
      } else if (meta.row?.label === "Support burden (pop/age15-64)") {
        lines.push("计算方法：人口负担 = 总人口 ÷ 15—64岁人口");
        visit(sh, meta.a.replace(/\d+$/, "55"), depth + 1);
        visit(sh, meta.a.replace(/\d+$/, "56"), depth + 1);
      }
      return;
    }
    if (user) {
      lines.push("输入来源：预测值（用户设定）");
      return;
    }
    if (typeof f === "string" && f.startsWith("=")) {
      lines.push("计算方法：" + describe(sh, f));
      if (depth < 5) refs(sh, f).forEach((r) => visit(r.sh, r.a, depth + 1));
      else lines.push("更深层输入需继续核实；以上为直接计算数据");
    } else
      lines.push(
        "输入来源：" +
          (meta.yr > 2025 ? "默认预测假设；外部出处待核实" : "来源待核实"),
      );
  }
  function refs(sh, f) {
    return [
      ...f.matchAll(/(?:(\w+)!)?(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/g),
    ].flatMap((m) => {
      const rs = m[1] || sh;
      if (!m[3]) return [{ sh: rs, a: m[2] }];
      const start = m[2].replaceAll("$", "").match(/^([A-Z]+)(\d+)$/),
        end = m[3].replaceAll("$", "").match(/^([A-Z]+)(\d+)$/);
      if (start[1] === end[1])
        return Array.from(
          { length: Math.min(30, +end[2] - +start[2] + 1) },
          (_, i) => ({ sh: rs, a: start[1] + (+start[2] + i) }),
        );
      return [
        { sh: rs, a: m[2] },
        { sh: rs, a: m[3] },
      ];
    });
  }
  function describe(sh, f) {
    return f
      .replace(/^=/, "")
      .replaceAll("*", " × ")
      .replaceAll("/", " ÷ ")
      .replace(/(?:(\w+)!)?(\$?[A-Z]+\$?\d+)/g, (_, rs, a) => {
        const m = info(rs || sh, a);
        return (
          m.name +
          " [" +
          fmt(value(rs || sh, a)) +
          (m.unit ? " " + m.unit : "") +
          "]"
        );
      })
      .replace(/SUM\(/g, "求和(");
  }
  if (
    series.population &&
    year >= 2030 &&
    index === 12 &&
    forecastInputAllowed(sheet + "!POP_BIRTH_2025")
  ) {
    const pop = engine.cell(sheet, "M9"),
      birth = populationIntervalRate(sheet, true),
      death = populationIntervalRate(sheet, false);
    lines.push(
      "计算方法：2030人口 = 2025人口 × [1 + (出生率 − 死亡率) ÷ 100 × 5]",
      "代入数据：" +
        fmt(pop) +
        " 百万人 × [1 + (" +
        fmt(birth) +
        " − " +
        fmt(death) +
        ") ÷ 100 × 5]",
      "假设区间：2025—2030年；出生率、死亡率单位为%／年",
      "输入来源：" +
        (Object.hasOwn(forecastOverrides, sheet + "!POP_BIRTH_2025") ||
        Object.hasOwn(forecastOverrides, sheet + "!POP_DEATH_2025")
          ? "预测值（用户设定的区间假设）"
          : "默认区间假设；外部出处待核实"),
    );
    visit(sheet, "M9", 0);
  } else if (direct) visit(direct[1] || sheet, direct[2], 0);
  else if (typeof formula === "string" && formula.startsWith("=")) {
    lines.push("计算方法：" + describe(sheet, formula));
    refs(sheet, formula).forEach((r) => visit(r.sh, r.a, 0));
  } else lines.push("来源待核实；当前保留值尚未取得独立外部出处");
  return lines
    .join("\n")
    .replace(/原工作[簿薄]|原表/g, "基准模型")
    .replace(/source\.xlsx/gi, "来源待核实");
}
function provenanceHTML(text) {
  return esc(text)
    .replace(
      /https?:\/\/[^\s<]+/g,
      (url) =>
        '<a href="' + url + '" target="_blank" rel="noopener">查看资料</a>',
    )
    .replaceAll("\n", "<br>");
}

function graphIsForecastInput(series, index) {
  if (
    index >= 11 &&
    /^(Temperature|Sea level rise|CO2 (?:in|equivalent in) atmosphere)/i.test(
      series.label,
    ) &&
    graphIntervalTarget(series, index, { number: 10 })
  )
    return true;
  const isGrowth = /^Growth in productivity/i.test(series.label),
    firstPopulationInterval =
      index === 11 && /^Crude (birth|death) rate/i.test(series.label);
  if (
    firstPopulationInterval &&
    FORECAST_MODEL.modules[series.sheet]?.some(
      (g) => g.title.startsWith("Graph 1.") && g.inputs.length,
    )
  )
    return true;
  let sheet = series.sheet,
    target = graphSeriesAddress(
      series,
      index + (isGrowth && index >= 11 ? 1 : 0),
    );
  const seen = new Set();
  for (let depth = 0; depth < 20; depth++) {
    const key = sheet + "!" + target;
    if (seen.has(key)) return false;
    seen.add(key);
    if (forecastInputAllowed(key)) return true;
    const raw =
      FORECAST_MODEL.extension[sheet]?.[target] ??
      FORECAST_MODEL.cells[sheet]?.[target];
    if (typeof raw === "number") return Number.isFinite(raw);
    if (typeof raw !== "string" || !raw.startsWith("=")) return false;
    // Only aliases and chart normalization preserve an input's identity.
    // Multiplication, differences, ratios of actual quantities, sums and recurrences are calculations.
    const ref = raw.match(
      /^=(?:(\w+)!)?(\$?[A-Z]+\$?\d+)(?:\/\$[A-Z]+\$?\d+)?$/,
    );
    if (!ref) return false;
    sheet = ref[1] || sheet;
    target = ref[2].replaceAll("$", "");
  }
  return false;
}

function livingStandardValue(series, index, engine) {
  const first = graphSeriesAddress({ addresses: ["B1"] }, index).replace(
      /1$/,
      "",
    ),
    sheet = series.sheet,
    pop = engine.cell(sheet, first + "9");
  if (/^GDP per person/i.test(series.label))
    return (engine.cell(sheet, first + "96") / pop) * 1000000;
  if (/^Consumption per person/i.test(series.label))
    return (engine.cell(sheet, first + "136") / pop) * 1000000;
  if (/^Food per person/i.test(series.label)) {
    const row = sheet === "OECD" ? 411 : sheet === "SumWorld" ? 433 : 412;
    return engine.cell(sheet, first + row) / pop;
  }
  if (/^Energy use per person/i.test(series.label))
    return (
      engine.cell(sheet, first + (sheet === "SumWorld" ? "240" : "250")) / pop
    );
  if (/^Sea level rise/i.test(series.label))
    return (engine.cell("SumWorld", first + "403") + 200) / 1000;
  return null;
}

function graphHasQueriedValue(series, index) {
  const year = 1970 + index * 5;
  if (
    year > 2025 ||
    (year === 2025 && /^Growth in productivity/i.test(series.label))
  )
    return false;
  const label = series.label.replace(/\s*\(0\s*-.*?\)/, "").trim(),
    key = gPointKey(label),
    entry = graphHistoricalEntry(series);
  return entry?.points[year] != null;
}
function conciseCalculation(series, index) {
  const full = calculationProvenance(series, index).split("\n"),
    method = full.find((line) => line.startsWith("计算方法：")),
    substitution = full.find((line) => line.startsWith("代入数据："));
  const compact = (text) =>
    text
      .replace(/(?:中国|美国|全球|其他地区|OECD|BRISE) · /g, "")
      .replace(/（(\d{4})年）/g, "（$1）");
  const lines = [];
  if (method) lines.push(compact(method));
  if (substitution) lines.push(substitution);
  if (!method) lines.push("计算规则尚未核实");
  if (1970 + index * 5 <= 2025 && method) {
    if (full.some((line) => line.includes("桥接估算")))
      lines.push("输入说明：包含桥接估算值");
    else if (full.some((line) => line === "输入来源：来源待核实"))
      lines.push("输入说明：部分输入的独立出处尚待核实");
  }
  return lines.join("\n");
}
