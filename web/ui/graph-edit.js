// Input mapping and selected-line drag interaction.
function graphDragTarget(sheet, addr) {
  const model = FORECAST_MODEL;
  let targetSheet = sheet,
    target = addr,
    scale = 1;
  let formula = model.extension[sheet]?.[addr] ?? model.cells[sheet]?.[addr];
  if (!/^[M-W]\d+$/.test(addr)) {
    const match =
      typeof formula === "string" &&
      formula.match(/^=(?:(\w+)!)?(\$?[M-W]\$?\d+)\/(\$?[A-Z]+\$?\d+)$/);
    if (!match) {
      const ref =
        typeof formula === "string" &&
        [...formula.matchAll(/(?:(\w+)!)?(\$?[M-W]\$?\d+)/g)]
          .reverse()
          .find((m) =>
            forecastInputAllowed(
              (m[1] || sheet) + "!" + m[2].replaceAll("$", ""),
            ),
          );
      if (!ref) return null;
      targetSheet = ref[1] || sheet;
      target = ref[2].replaceAll("$", "");
      const key = targetSheet + "!" + target;
      if (!forecastInputAllowed(key)) return null;
      const anchors = sourceAnchors();
      try {
        const evaluate = (value) =>
            forecastEngine(
              FORECAST_MODEL,
              { ...forecastOverrides, ...anchors, [key]: value },
              true,
            ).cell(sheet, addr),
          zero = evaluate(0),
          one = evaluate(1),
          two = evaluate(2),
          slope = one - zero;
        if (
          !Number.isFinite(slope) ||
          slope === 0 ||
          Math.abs(two - zero - 2 * slope) >
            Math.max(1e-8, Math.abs(slope) * 1e-6)
        )
          return null;
        return { key, scale: 1 / slope, offset: zero };
      } catch {
        return null;
      }
    }
    targetSheet = match[1] || sheet;
    target = match[2].replaceAll("$", "");
    scale = match[3];
  }
  for (let n = 0; n < 8; n++) {
    const value =
        model.extension[targetSheet]?.[target] ??
        model.cells[targetSheet]?.[target],
      alias =
        typeof value === "string" &&
        value.match(/^=(?:(\w+)!)?(\$?[M-W]\$?\d+)$/);
    if (!alias) break;
    targetSheet = alias[1] || targetSheet;
    target = alias[2].replaceAll("$", "");
  }
  if (!forecastInputAllowed(targetSheet + "!" + target)) return null;
  if (typeof scale === "string") {
    try {
      scale = scenarioEngine().cell(sheet, scale);
    } catch {
      return null;
    }
  }
  return Number.isFinite(scale) && scale !== 0
    ? { key: targetSheet + "!" + target, scale }
    : null;
}
function graphSeriesAddress(s, i) {
  const first = s.addresses[0].match(/^([A-Z]+)(\d+)$/);
  let col =
      [...first[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) + i,
    name = "";
  while (col) {
    col--;
    name = String.fromCharCode(65 + (col % 26)) + name;
    col = Math.floor(col / 26);
  }
  return name + first[2];
}
function updateLivePrediction(svg, data) {
  const calc = scenarioEngine();
  for (const s of data.ss) {
    const formula = s.addresses
        .map((a) => FORECAST_MODEL.cells[s.sheet]?.[a])
        .find((f) => typeof f === "string" && /\/(\$?[A-Z]+\$?\d+)$/.test(f)),
      scaleRef =
        typeof formula === "string" && formula.match(/\/(\$?[A-Z]+\$?\d+)$/),
      nativeScale = scaleRef ? calc.cell(s.sheet, scaleRef[1]) : 1;
    for (
      let i =
        [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(data.g.number) ||
        (data.g.number === 3 && /^Growth in productivity/i.test(s.label))
          ? 11
          : 12;
      i < 22;
      i++
    ) {
      if (
        (s.forecastIntervalResult ||
          (data.g.number === 3 && /^Growth in productivity/i.test(s.label))) &&
        i === 21
      ) {
        s.values[i] = null;
        continue;
      }
      if (
        i === 21 &&
        data.g.number === 1 &&
        graphIntervalTarget(s, 11, data.g)?.interval
      ) {
        s.values[i] = null;
        if (s.actualValues) s.actualValues[i] = null;
        continue;
      }
      try {
        s.values[i] = calc.cell(
          s.sheet,
          graphSeriesAddress(
            s,
            s.forecastIntervalResult ||
              (data.g.number === 3 && /^Growth in productivity/i.test(s.label))
              ? i + 1
              : i,
          ),
        );
        if (data.g.number === 15 && /^Sea level rise/i.test(s.label))
          s.values[i] +=
            200 / graphDragTarget(s.sheet, graphSeriesAddress(s, i)).scale;
        if (s.actualValues)
          s.actualValues[i] = s.livingStandard
            ? livingStandardValue(s, i, calc)
            : s.values[i] * nativeScale;
      } catch {
        s.values[i] = null;
      }
    }
  }
  let lower = Array(22).fill(0);
  data.ss.forEach((s, j) => {
    const tops = s.values.map((v, i) =>
      v == null
        ? null
        : data.g.number === 1
          ? s.actualValues[i] /
            (s.population ? 1000 * data.popAxis : data.rateAxis)
          : data.g.stacked
            ? lower[i] + v
            : v,
    );
    if (
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(data.g.number) ||
      (data.g.number === 3 && /^Growth in productivity/i.test(s.label))
    ) {
      svg
        .querySelector('[data-series="' + j + '"][data-index="11"]')
        ?.setAttribute("cy", data.y(tops[11]));
      svg
        .querySelector('[data-drag-series="' + j + '"][data-drag-index="11"]')
        ?.setAttribute("cy", data.y(tops[11]));
    }
    const intervalRate =
      data.g.number === 1 ? graphPopulationIntervalRate(s) : null;
    if (Number.isFinite(intervalRate))
      svg
        .querySelector('[data-interval-series="' + j + '"]')
        ?.setAttribute("cy", data.y(intervalRate / data.rateAxis));
    let future = "",
      previous = false,
      lastHistory = -1;
    const futureStart =
      s.forecastIntervalResult ||
      /^(Temperature|Sea level rise|CO2 (?:in|equivalent in) atmosphere)/i.test(
        s.label,
      )
        ? 11
        : 12;
    for (let i = 0; i < futureStart; i++) if (tops[i] != null) lastHistory = i;
    for (let i = futureStart; i < 22; i++) {
      if (tops[i] == null) {
        previous = false;
        continue;
      }
      if (!previous && intervalRate != null) {
        if (lastHistory >= 0)
          future +=
            "M" +
            (55 + (lastHistory / 21) * 685) +
            "," +
            data.y(tops[lastHistory]) +
            " L";
        else future += "M";
        future +=
          55 +
          (11 / 21) * 685 +
          "," +
          data.y(intervalRate / data.rateAxis) +
          " ";
      } else if (!previous && lastHistory >= 0)
        future +=
          "M" +
          (55 + (lastHistory / 21) * 685) +
          "," +
          data.y(tops[lastHistory]) +
          " ";
      future +=
        (previous || intervalRate != null || lastHistory >= 0 ? "L" : "M") +
        (55 + (i / 21) * 685) +
        "," +
        data.y(tops[i]) +
        " ";
      previous = true;
      svg
        .querySelector('[data-series="' + j + '"][data-index="' + i + '"]')
        ?.setAttribute("cy", data.y(tops[i]));
      svg
        .querySelector(
          '[data-drag-series="' + j + '"][data-drag-index="' + i + '"]',
        )
        ?.setAttribute("cy", data.y(tops[i]));
    }
    const paths = [...svg.querySelectorAll("path")].filter(
      (path) =>
        path.getAttribute("stroke") === graphPalette[j % graphPalette.length],
    );
    if (paths.length === 3) {
      if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(data.g.number)) {
        let past = "",
          joined = false;
        for (let i = 0; i < futureStart; i++) {
          if (tops[i] == null) {
            joined = false;
            continue;
          }
          past +=
            (joined ? "L" : "M") +
            (55 + (i / 21) * 685) +
            "," +
            data.y(tops[i]) +
            " ";
          joined = true;
        }
        paths[0].setAttribute("d", past);
      }
      paths[1].setAttribute("d", future);
      paths[2].setAttribute("d", future);
    } else if (
      data.g.stacked &&
      paths.length === 1 &&
      tops.every((v) => v != null)
    ) {
      const top = tops
          .map(
            (v, i) => (i ? "L" : "M") + (55 + (i / 21) * 685) + "," + data.y(v),
          )
          .join(" "),
        bottom = lower
          .map((v, i) => "L" + (55 + (i / 21) * 685) + "," + data.y(v))
          .reverse()
          .join(" ");
      paths[0].setAttribute("d", top + bottom + "Z");
    }
    if (data.g.stacked) lower = tops.map((v) => v ?? 0);
  });
}
function graphIntervalTarget(series, i, g) {
  // Future interval-start markers edit the following five-year assumption.
  const intensity = g.number === 6 && /^Energy intensity/i.test(series.label),
    footprint =
      g.number === 12 && /^Nonenergy footprint \(/i.test(series.label);
  if (intensity || footprint) {
    if (i < 11 || i > 20) return null;
    const row = intensity
      ? 252
      : FORECAST_MODEL.modules[series.sheet]
          ?.find((group) => group.title.startsWith("Graph 12."))
          ?.inputs.find((input) => input.label === "Rate of change of NEFPP")
          ?.row;
    if (!row) return null;
    const key = series.sheet + "!" + String.fromCharCode(66 + i + 1) + row;
    if (!forecastInputAllowed(key)) return null;
    const addr = graphSeriesAddress(series, i + 1),
      anchors = sourceAnchors();
    try {
      const evaluate = (value) =>
        forecastEngine(
          FORECAST_MODEL,
          { ...forecastOverrides, ...anchors, [key]: value },
          true,
        ).cell(series.sheet, addr);
      const zero = evaluate(0),
        slope = evaluate(1) - zero;
      if (
        !Number.isFinite(slope) ||
        Math.abs(slope) < 1e-12 ||
        Math.abs(evaluate(2) - zero - 2 * slope) >
          Math.max(1e-8, Math.abs(slope) * 1e-6)
      )
        return null;
      return { key, scale: 1 / slope, offset: zero };
    } catch {
      return null;
    }
  }
  if (
    g.number === 3 &&
    /^Growth in productivity/i.test(series.label) &&
    i >= 11
  )
    return i < 21
      ? graphDragTarget(series.sheet, graphSeriesAddress(series, i + 1))
      : null;
  if (
    g.number === 1 &&
    i === 11 &&
    /^Crude (birth|death) rate/i.test(series.label)
  ) {
    const birth = /birth/i.test(series.label),
      key = series.sheet + "!" + (birth ? "POP_BIRTH_2025" : "POP_DEATH_2025");
    return forecastInputAllowed(key)
      ? { key, scale: 1, interval: true, birth }
      : null;
  }
  const target = graphDragTarget(series.sheet, graphSeriesAddress(series, i));
  if (target && g.number === 15 && /^Sea level rise/i.test(series.label))
    return { ...target, offset: (target.offset || 0) + 200 / target.scale };
  return target;
}
function bindPredictionDrag(box, svg, data) {
  if (forecastArchiveState()) {
    graphGallery
      .querySelectorAll(
        '[data-line-select="' +
          box.dataset.graphHover +
          ':0"], [data-line-select^="' +
          box.dataset.graphHover +
          ':"]',
      )
      .forEach((button) => {
        button.disabled = true;
        button.title = "留存版本，只读";
      });
    return;
  }
  const selectionKey = graphInteractionKey(data.g),
    selected = graphEditableSelection.get(selectionKey),
    choose = (j) => {
      if (!forecastCanNavigate()) return;
      graphEditableSelection.clear();
      graphEditableSelection.set(selectionKey, j);
      drawWorkbookGraphs();
    };
  data.ss.forEach((series, j) => {
    const editable = Array.from({ length: 11 }, (_, n) => n + 11).some(
      (i) =>
        (series.values[i] != null || i === 11) &&
        graphIntervalTarget(series, i, data.g),
    );
    const legend = graphGallery.querySelector(
      '[data-line-select="' + box.dataset.graphHover + ":" + j + '"]',
    );
    if (legend) {
      legend.disabled = !editable;
      legend.classList.toggle("editable-legend", editable);
      if (editable) {
        const badge = document.createElement("span");
        badge.className = "edit-badge";
        badge.textContent = selected === j ? "拖动调整" : "✎";
        badge.setAttribute("aria-hidden", "true");
        legend.append(badge);
      }
      legend.style.cursor = editable ? "pointer" : "default";
      legend.style.fontWeight = selected === j ? "700" : "400";
      legend.style.background = selected === j ? "#e6efe9" : "transparent";
      legend.setAttribute("aria-pressed", String(selected === j));
      legend.title = editable
        ? "点击选中，仅拖动这条线的预测假设"
        : "公式计算结果，不可拖动";
      legend.onclick = () => choose(j);
    }
    const paths = [...svg.querySelectorAll("path")].filter(
      (path) =>
        path.getAttribute("stroke") === graphPalette[j % graphPalette.length],
    );
    for (const path of paths) {
      path.setAttribute("stroke-width", selected === j ? "4" : "2");
      path.setAttribute(
        "opacity",
        selected == null || selected === j ? "1" : ".45",
      );
    }
    if (editable) {
      const futurePath = paths.find((path) =>
        path.hasAttribute("stroke-dasharray"),
      );
      if (futurePath) {
        const hit = futurePath.cloneNode(false);
        hit.removeAttribute("clip-path");
        hit.setAttribute("stroke", "transparent");
        hit.setAttribute("stroke-width", "16");
        hit.setAttribute("stroke-dasharray", "none");
        hit.setAttribute("pointer-events", "stroke");
        hit.setAttribute("data-line-hit", j);
        hit.style.cursor = "pointer";
        hit.addEventListener("click", (event) => {
          event.stopPropagation();
          choose(j);
        });
        svg.append(hit);
      }
    }
  });
  data.ss.forEach((series, j) => {
    if (j !== selected) return;
    for (
      let i = [1, 3, 4, 6, 7, 10, 11, 12, 13, 15].includes(data.g.number)
        ? 11
        : 12;
      i < (data.g.number === 1 ? 21 : 22);
      i++
    ) {
      const target = graphIntervalTarget(series, i, data.g);
      if (series.values[i] == null && !target?.interval) continue;
      if (!target) continue;
      const marker = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      let top = data.g.stacked
        ? data.ss
            .slice(0, j + 1)
            .reduce((sum, s) => sum + (s.values[i] ?? 0), 0)
        : series.values[i];
      if (data.g.number === 1)
        top =
          (target.interval
            ? populationIntervalRate(series.sheet, target.birth)
            : series.actualValues[i]) /
          (series.population ? 1000 * data.popAxis : data.rateAxis);
      marker.setAttribute("cx", 55 + (i / 21) * 685);
      marker.setAttribute("cy", data.y(top));
      marker.setAttribute("r", "6");
      marker.setAttribute("data-drag-series", j);
      marker.setAttribute("data-drag-index", i);
      marker.setAttribute(
        "fill",
        target.interval ? "white" : graphPalette[j % graphPalette.length],
      );
      marker.setAttribute(
        "stroke",
        target.interval ? graphPalette[j % graphPalette.length] : "white",
      );
      marker.setAttribute("stroke-width", "1.5");
      marker.style.cursor = "ns-resize";
      marker.style.touchAction = "none";
      const title = { textContent: "" };
      title.textContent =
        "拖动修改 " +
        (1970 + i * 5) +
        (data.g.number === 1 || series.forecastIntervalResult
          ? "—" + (1975 + i * 5) + "年区间假设"
          : "年假设") +
        " · 点击保存才写入数据库";
      marker.setAttribute("aria-label", title.textContent);
      svg.append(marker);
      let dragging = false,
        draft = null,
        grabOffset = 0,
        pending = false,
        hadPrevious = false,
        previousValue;
      function paint() {
        pending = false;
        if (!dragging || draft == null) return;
        forecastOverrides[target.key] = draft;
        updateLivePrediction(svg, data);
        if (target.interval)
          marker.setAttribute("cy", data.y(draft / data.rateAxis));
        forecastDraftChanged();
        const [sheet, addr] = target.key.split("!");
        if (sheet === forecastRegion) {
          const input = forecastPanel.querySelector(
            '[data-forecast-cell="' + addr + '"]',
          );
          if (input)
            input.value = forecastCompactValue(
              forecastInputDisplayValue(sheet, addr, draft),
            );
        }
        title.textContent = 1970 + i * 5 + "年：" + fmt(draft) + " · 未保存";
        marker.setAttribute("aria-label", title.textContent);
      }
      marker.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = svg.getBoundingClientRect();
        if (!rect.height) return;
        grabOffset =
          ((event.clientY - rect.top) / rect.height) * 310 -
          Number(marker.getAttribute("cy"));
        dragging = true;
        draft = null;
        hadPrevious = Object.hasOwn(forecastOverrides, target.key);
        previousValue = forecastOverrides[target.key];
        marker.undoSnapshot = { ...forecastOverrides };
        graphAxisLocks.set(graphInteractionKey(data.g), {
          lo: data.lo,
          hi: data.hi,
          popAxis: data.popAxis,
          rateAxis: data.rateAxis,
        });
        marker.setPointerCapture?.(event.pointerId);
      });
      marker.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = svg.getBoundingClientRect();
        if (!rect.height) return;
        const py = Math.max(
          40,
          Math.min(
            260,
            ((event.clientY - rect.top) / rect.height) * 310 - grabOffset,
          ),
        );
        let value = data.lo + ((260 - py) / 220) * (data.hi - data.lo);
        if (data.g.number === 1)
          value *= series.population ? 1000 * data.popAxis : data.rateAxis;
        else {
          if (data.g.stacked)
            value -= data.ss
              .slice(0, j)
              .reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
          value = (value - (target.offset || 0)) * target.scale;
        }
        const [min, max] = FORECAST_INPUT_BOUNDS[target.key] || [null, null];
        if (min != null) value = Math.max(min, value);
        if (max != null) value = Math.min(max, value);
        const energyMax = forecastEnergyLimit(target.key);
        if (energyMax != null) value = Math.min(value, Math.max(0, energyMax));
        draft = Number(value.toPrecision(12));
        if (!pending) {
          pending = true;
          requestAnimationFrame(paint);
        }
      });
      marker.addEventListener("pointerup", (event) => {
        if (!dragging) return;
        event.stopPropagation();
        paint();
        dragging = false;
        // Even a click without movement must release the temporary axis lock.
        graphAxisLocks.delete(selectionKey);
        if (draft != null) {
          forecastRecordUndo(marker.undoSnapshot);
          // Keep the axis stable during dragging, then include all derived values.
          drawForecast();
          drawWorkbookGraphs();
        }
      });
      function cancelDrag() {
        if (!dragging) return;
        dragging = false;
        draft = null;
        if (hadPrevious) forecastOverrides[target.key] = previousValue;
        else delete forecastOverrides[target.key];
        graphAxisLocks.delete(selectionKey);
        forecastDraftChanged();
        // Restore both the plotted value and the editor after an interrupted drag.
        drawForecast();
        drawWorkbookGraphs();
      }
      marker.addEventListener("pointercancel", cancelDrag);
      marker.addEventListener("lostpointercapture", cancelDrag);
    }
  });
}

// Clear selection without rebuilding the page, so clicked controls retain focus.
