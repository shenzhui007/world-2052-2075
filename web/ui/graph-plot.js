// Build SVG from model quantities.
function graphPointBrief(series, index, value) {
  if (forecastArchiveState()?.kind === "author")
    return graphPointDetails(series, index, value)
      .split("\n")
      .slice(0, 3)
      .join("；");
  const year = 1970 + index * 5,
    historical = graphIsHistoricalPoint(series, index),
    unit = series.population ? "人" : graphConcreteUnit(series),
    raw = series.actualValues?.[index] ?? value,
    number = series.population ? Math.round(raw * 1e6) : raw,
    interval =
      !historical &&
      (series.forecastIntervalResult ||
        /^Growth in productivity/i.test(series.label));
  return (
    (series.displayLabel || localize(series.label)) +
    "；" +
    year +
    (interval
      ? "—" +
        (year + 5) +
        (series.forecastIntervalResult ? "年区间（末年值）" : "年区间假设")
      : "年") +
    " · " +
    (historical ? "历史数据" : "情景预测") +
    "；数值：" +
    (unit ? fmt(number) + " " + unit : "—（单位尚未核实，暂不显示）")
  );
}
function workbookPlot(g, engine) {
  const authorView = forecastArchiveState()?.kind === "author",
    historyLimit = authorView ? 2010 : 2025;
  const historic = historicalEngine();
  const ss = g.series
    .filter(
      (s, index) =>
        !isCustomGraphSeries(s) &&
        !/UN Low/i.test(s.label) &&
        !(
          g.number === 4 &&
          g.series
            .slice(0, index)
            .some((previous) => previous.label === s.label)
        ),
    )
    .map((s) => ({
      ...s,
      forecastIntervalResult:
        !authorView &&
        ((g.number === 12 && /^Nonenergy footprint \(/i.test(s.label)) ||
          (g.number === 6 && /^Energy intensity/i.test(s.label))),
      values: Array.from({ length: 22 }, (_, i) => {
        const year = 1970 + i * 5;
        if (authorView && year > 2050) return null;
        if (
          !authorView &&
          ((g.number === 12 && /^Nonenergy footprint \(/i.test(s.label)) ||
            (g.number === 6 && /^Energy intensity/i.test(s.label))) &&
          i >= 11
        ) {
          if (i < 11 || i >= 21) return null;
          try {
            return engine.cell(s.sheet, graphSeriesAddress(s, i + 1));
          } catch {
            return null;
          }
        }
        if (g.number === 7 && year <= 2020) {
          const entry = ACTUAL[s.sheet]?.[gPointKey(s.label)];
          if (entry?.points[year] != null) return entry.points[year];
        }
        if (
          g.number === 4 &&
          /^normal \+/i.test(s.label) &&
          year < (authorView ? 2015 : 2025)
        )
          return null;
        if (
          !authorView &&
          g.number === 3 &&
          /^Growth in productivity/i.test(s.label) &&
          i >= 11
        ) {
          if (i === 21) return null;
          try {
            return engine.cell(s.sheet, graphSeriesAddress(s, i + 1));
          } catch {
            return null;
          }
        }
        if (year <= 2025 && /forecast|forcast|estimate|UN Low/i.test(s.label))
          return null;
        const first = s.addresses[0].match(/^([A-Z]+)(\d+)$/);
        let col =
          Array.from(first[1]).reduce(
            (n, c) => n * 26 + c.charCodeAt(0) - 64,
            0,
          ) + i;
        let name = "";
        while (col) {
          col--;
          name = String.fromCharCode(65 + (col % 26)) + name;
          col = Math.floor(col / 26);
        }
        const a = name + first[2];
        if (
          i < 17 &&
          FORECAST_MODEL.cells[s.sheet]?.[a] == null &&
          !(year <= 2020 && Object.hasOwn(HISTORY_VALUES, s.sheet + "!" + a))
        )
          return null;
        if (i >= 17 && FORECAST_MODEL.extension[s.sheet]?.[a] == null)
          return null;
        try {
          const v = (
            year <= 2025 && !graphUses2025Prediction(s, i) ? historic : engine
          ).cell(s.sheet, a);
          return typeof v === "number" && Number.isFinite(v) ? v : null;
        } catch {
          return null;
        }
      }),
    }));
  if (g.number === 1)
    for (const s of ss) {
      const formula = FORECAST_MODEL.cells[s.sheet]?.[s.addresses[0]],
        match =
          typeof formula === "string"
            ? formula.match(/\/\s*(\$?[A-Z]+\$?\d+)$/)
            : null;
      const scale = match ? historic.cell(s.sheet, match[1]) : null;
      s.population = /^Population/i.test(s.label);
      if (!s.population && graphIntervalTarget(s, 11, g)?.interval)
        s.values[21] = null;
      s.actualValues = s.values.map((v) =>
        v != null && typeof scale === "number" ? v * scale : null,
      );
      if (!authorView && !/forecast|forcast|estimate|UN Low/i.test(s.label)) {
        const key = s.population
            ? "Population, REGION"
            : /birth rate/i.test(s.label)
              ? "Crude birth rate"
              : "Crude death rate",
          entry = graphHistoricalEntry(s);
        for (let i = 0; i < 12; i++) {
          const year = 1970 + i * 5,
            latest = entry?.points[year];
          let accepted = latest != null;
          if (s.population && year <= 2010) {
            const row = DATA[s.sheet].find((r) => r.row === 9),
              old = row?.originalValues?.[i];
            if (old && latest != null && Math.abs(latest / old - 1) > 0.05)
              accepted = false;
          }
          s.actualValues[i] = accepted ? latest : null;
          s.values[i] = accepted && scale ? latest / scale : null;
        }
      }
      s.displayLabel =
        localize(s.label.replace(/\s*\(0\s*-.*?\)/, "")).trim() +
        "（" +
        (s.population ? "人" : "%／年") +
        "）";
    }
  if (g.number !== 1 && g.number !== 15)
    for (const s of ss) {
      const firstFormula = s.addresses
          .map((a) => FORECAST_MODEL.cells[s.sheet]?.[a])
          .find((f) => typeof f === "string" && /\/(\$?[A-Z]+\$?\d+)$/.test(f)),
        divisor =
          typeof firstFormula === "string" &&
          firstFormula.match(/\/(\$?[A-Z]+\$?\d+)$/);
      s.physicalSeries = true;
      s.actualValues = s.values.map((v, i) => {
        if (v == null) return null;
        try {
          return divisor
            ? v *
                (i <= 11 && !graphUses2025Prediction(s, i)
                  ? historic
                  : engine
                ).cell(s.sheet, divisor[1])
            : v;
        } catch {
          return null;
        }
      });
    }
  if (g.number === 10)
    for (const s of ss) {
      if (/^Sea level rise/i.test(s.label)) {
        s.livingStandard = true;
        s.actualValues = s.values.map((v, i) =>
          v == null
            ? null
            : safeLivingStandardValue(
                s,
                i,
                i <= 11 && !graphUses2025Prediction(s, i) ? historic : engine,
              ),
        );
      }
    }
  if (g.number !== 1 && g.number !== 2)
    for (const s of ss)
      s.displayLabel = localize(s.label.replace(/\s*\(0\s*-.*?\)/, "").trim());
  if (authorView)
    for (const s of ss)
      if (/^Cultivated land/i.test(s.label)) s.displayLabel = "耕地面积";
  if (g.number === 15)
    for (const s of ss) {
      s.livingStandard = true;
      s.actualValues = s.values.map((v, i) =>
        v == null
          ? null
          : safeLivingStandardValue(
              s,
              i,
              i <= 11 && !graphUses2025Prediction(s, i) ? historic : engine,
            ),
      );
      s.displayLabel = localize(s.label.replace(/\s*\(0\s*-.*?\)/, "").trim());
      if (/^Sea level rise/i.test(s.label)) {
        s.displayLabel = "较1850年的海平面上升";
        const target = graphDragTarget(s.sheet, graphSeriesAddress(s, 11));
        s.values = s.values.map((v) =>
          v == null ? null : v + 200 / target.scale,
        );
      }
    }
  if (g.number === 2)
    for (const s of ss)
      s.displayLabel = localize(s.label.replace(/\s*\(0\s*-.*?\)/, "").trim());
  for (const s of ss)
    if (s.actualValues)
      s.values = s.values.map((v, i) => (s.actualValues[i] == null ? null : v));
  const fixedAxis = graphAxisLocks.get(graphInteractionKey(g));
  const popAxis =
      g.number === 1
        ? (fixedAxis?.popAxis ??
          Math.max(
            1,
            Math.ceil(
              Math.max(
                ...ss
                  .filter((s) => s.population)
                  .flatMap((s) => s.actualValues.filter((v) => v != null))
                  .map((v) => v / 1000),
              ),
            ),
          ))
        : null,
    rateAxis =
      g.number === 1
        ? (fixedAxis?.rateAxis ??
          Math.max(
            1,
            Math.ceil(
              Math.max(
                ...ss
                  .filter((s) => !s.population)
                  .flatMap((s) => s.actualValues.filter((v) => v != null)),
                ...ss.map(graphPopulationIntervalRate).filter(Number.isFinite),
              ),
            ),
          ))
        : null;
  const values = ss.flatMap((s) => s.values).filter((v) => v != null);
  let lo = Math.min(0, ...values),
    hi = Math.max(...values);
  if (g.stacked) {
    hi = Math.max(
      ...Array.from({ length: 22 }, (_, i) =>
        ss.reduce((v, s) => v + (s.values[i] ?? 0), 0),
      ),
    );
  }
  if (!Number.isFinite(hi) || hi === lo) {
    lo = 0;
    hi = 1;
  }
  if (g.number === 1) {
    lo = 0;
    hi = 1;
  } else if (fixedAxis) {
    lo = fixedAxis.lo;
    hi = fixedAxis.hi;
  } else {
    const span = hi - lo;
    hi += span * 0.3;
    if (lo < 0) lo -= span * 0.1;
  }
  const x = (i) => 55 + (i / 21) * 685,
    y = (v) => 260 - ((v - lo) / (hi - lo)) * 220;
  const boundary = x(((authorView ? 2010 : 2026) - 1970) / 5),
    timeClip = "graph-time-" + ++graphHoverSequence;
  let svg =
    '<svg viewBox="0 0 780 310" role="img" aria-label="' +
    esc("Graph " + g.number + " · " + graphLabels[g.number - 1]) +
    ' · 过去与未来"><defs><clipPath id="' +
    timeClip +
    '-past"><rect x="55" y="35" width="' +
    (boundary - 55) +
    '" height="225"/></clipPath><clipPath id="' +
    timeClip +
    '-future"><rect x="' +
    boundary +
    '" y="35" width="' +
    (740 - boundary) +
    '" height="225"/></clipPath></defs><rect x="55" y="35" width="' +
    (boundary - 55) +
    '" height="225" fill="var(--history-bg, #f5f8f5)"/><rect x="' +
    boundary +
    '" y="35" width="' +
    (740 - boundary) +
    '" height="225" fill="var(--future-bg, #fff5e8)"/><text x="60" y="25" fill="var(--history-ink, #527460)" font-size="14">过去 · 历史数据</text><text x="' +
    (boundary + 8) +
    '" y="25" fill="var(--future-ink, #80511f)" font-size="14">未来 · 情景预测</text><line x1="' +
    boundary +
    '" x2="' +
    boundary +
    '" y1="35" y2="260" stroke="var(--future-ink, #80511f)" stroke-dasharray="4 4"/><text x="' +
    boundary +
    '" y="302" text-anchor="middle" fill="var(--future-ink, #80511f)" font-size="12">现在 · 2026</text>';
  if (g.number !== 1 && g.number !== 7 && g.number !== 8)
    svg +=
      '<text x="55" y="12" font-size="12" fill="var(--history-ink, #527460)">纵轴：各指标按各自尺度缩放，交点不代表数量相等</text>';
  for (let j = 0; j <= 4; j++) {
    const v = lo + ((hi - lo) * j) / 4;
    svg +=
      '<line x1="55" x2="740" y1="' +
      y(v) +
      '" y2="' +
      y(v) +
      '" stroke="var(--grid, #e6ece5)"/><text x="49" y="' +
      (y(v) + 4) +
      '" text-anchor="end" font-size="12" fill="var(--muted, #526b5e)">' +
      fmt(g.number === 1 ? v * popAxis : v) +
      "</text>";
    if (g.number === 1)
      svg +=
        '<text x="747" y="' +
        (y(v) + 4) +
        '" font-size="12" fill="var(--muted, #526b5e)">' +
        fmt(v * rateAxis) +
        "</text>";
  }
  if (g.number === 1)
    svg +=
      '<text x="55" y="12" font-size="12" fill="var(--history-ink, #527460)">人口 · 十亿人</text><text x="740" y="12" text-anchor="end" font-size="12" fill="var(--future-ink, #80511f)">出生率／死亡率 · %／年</text>';
  for (const yr of [1970, 1990, 2010, 2030, 2050, 2075])
    svg +=
      '<text x="' +
      x((yr - 1970) / 5) +
      '" y="285" text-anchor="middle" font-size="14" fill="var(--muted, #526b5e)">' +
      yr +
      "</text>";
  const sums = Array(22).fill(0);
  ss.forEach((s, j) => {
    const color = graphPalette[j % graphPalette.length],
      intervalRate = g.number === 1 ? graphPopulationIntervalRate(s) : null;
    if (Number.isFinite(intervalRate)) {
      svg +=
        '<circle data-interval-series="' +
        j +
        '" data-index="11" cx="' +
        x(11) +
        '" cy="' +
        y(intervalRate / rateAxis) +
        '" r="2" fill="' +
        color +
        '" aria-label="' +
        esc(graphPopulationIntervalDetails(s)) +
        '"></circle>';
    }
    let path = "",
      futurePath = "",
      prev = false,
      prevFuture = false;
    const lower = sums.slice();
    s.values.forEach((v, i) => {
      if (v == null) {
        prev = false;
        prevFuture = false;
        return;
      }
      const top =
        g.number === 1
          ? s.actualValues[i] / (s.population ? 1000 * popAxis : rateAxis)
          : g.stacked
            ? sums[i] + v
            : v;
      if (
        !(s.forecastIntervalResult && i >= 11) &&
        1970 + i * 5 <= historyLimit &&
        !(
          i === 11 &&
          /^(Temperature|Sea level rise|CO2 (?:in|equivalent in) atmosphere)/i.test(
            s.label,
          )
        )
      ) {
        path += (prev ? "L" : "M") + x(i) + "," + y(top) + " ";
        prev = true;
      } else {
        const lastHistorical = !prevFuture
          ? s.values
              .slice(0, Math.min(i, authorView ? 9 : 12))
              .findLastIndex((value) => value != null)
          : -1;
        if (!prevFuture && intervalRate != null) {
          if (lastHistorical >= 0)
            futurePath +=
              "M" +
              x(lastHistorical) +
              "," +
              y(s.actualValues[lastHistorical] / rateAxis) +
              " L";
          else futurePath += "M";
          futurePath +=
            x(11) +
            "," +
            y(intervalRate / rateAxis) +
            " L" +
            x(i) +
            "," +
            y(top) +
            " ";
        } else if (!prevFuture && lastHistorical >= 0) {
          const previous =
            g.number === 1
              ? s.actualValues[lastHistorical] /
                (s.population ? 1000 * popAxis : rateAxis)
              : g.stacked
                ? lower[lastHistorical] + s.values[lastHistorical]
                : s.values[lastHistorical];
          futurePath +=
            "M" +
            x(lastHistorical) +
            "," +
            y(previous) +
            " L" +
            x(i) +
            "," +
            y(top) +
            " ";
        } else
          futurePath += (prevFuture ? "L" : "M") + x(i) + "," + y(top) + " ";
        prevFuture = true;
      }
      if (g.stacked) sums[i] = top;
      svg +=
        '<circle data-series="' +
        j +
        '" data-index="' +
        i +
        '" cx="' +
        x(i) +
        '" cy="' +
        y(top) +
        '" r="2" fill="' +
        color +
        '" stroke="transparent" stroke-width="12" aria-label="' +
        esc(graphPointBrief(s, i, v)) +
        '"></circle>';
    });
    if (g.stacked && s.values.every((v) => v != null)) {
      const bottom = lower
        .map((v, i) => [x(i), y(v)])
        .reverse()
        .map(([a, b]) => "L" + a + "," + b)
        .join("");
      svg +=
        '<path d="' +
        path +
        bottom +
        'Z" fill="' +
        color +
        '" fill-opacity=".55" stroke="' +
        color +
        '"/>';
    } else
      svg +=
        '<path d="' +
        path +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="2"/><path d="' +
        futurePath +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="2" clip-path="url(#' +
        timeClip +
        '-past)"/><path d="' +
        futurePath +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="2" stroke-dasharray="6 4" clip-path="url(#' +
        timeClip +
        '-future)"/>';
  });
  svg += "</svg>";
  const sourceNotes = authorView
    ? ""
    : g.number === 10
      ? '<p class="note">历史温升采用HadCRUT5，CO₂采用NOAA冒纳罗亚年均值。海平面1970—1990年采用PSMSL观测重建，1995—2020年采用科罗拉多大学卫星观测，统一到1850年基准。2025年起可手动预测。CO₂当量仅折合长寿命温室气体的增温作用；1970、1975年为IPCC资料换算的历史估算，1980—2020年采用NOAA发布值。</p>'
      : g.number === 15
        ? '<p class="note">海平面与图10统一显示较1850年的上升量，两图共用同一预测。</p>'
        : g.number === 4
          ? '<p class="note">1970—2010年投资占比使用同价历史锚点，2015—2020年按PWT 11.0趋势估算。投资与消费均采用2005年PPP价格口径；2025年起为预测。</p>'
          : g.number === 11
            ? ""
            : g.number === 12
              ? '<p class="note">各地区1970—2020年历史已按NFBA 2026版更新，补齐2015、2020年。缺少消费分项、早期国家拆分及小地区资料的部分标为历史估算值；世界其他地区由全球减四区计算。2025年起为预测。</p>'
              : "";
  const hoverId = String(++graphHoverSequence);
  if (authorView)
    svg = svg
      .replace("过去 · 历史数据", "原书历史参考")
      .replace("未来 · 情景预测", "作者当时的预测")
      .replace("现在 · 2026", "基准 · 2010");
  graphHoverData.set(hoverId, {
    ss,
    g,
    lo,
    hi,
    y,
    popAxis,
    rateAxis,
    details: (s, i) => graphPointDetails(s, i, s.values[i]),
  });
  return (
    '<div class="chart" data-graph-hover="' +
    hoverId +
    '" style="height:auto;position:relative">' +
    svg +
    "</div>" +
    sourceNotes +
    '<div class="legend">' +
    ss
      .map(
        (s, i) =>
          '<button type="button" data-line-select="' +
          hoverId +
          ":" +
          i +
          '" class="legend-item"><i style="background:' +
          graphPalette[i % graphPalette.length] +
          '"></i>' +
          esc(graphSeriesLabel(s)) +
          "</button>",
      )
      .join("") +
    "</div>"
  );
}
