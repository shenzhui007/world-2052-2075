const forecastPanel = document.createElement("section");
forecastPanel.className = "note";
forecastPanel.style.marginTop = "24px";
// Panel remains detached until placed beside the selected graph.
let forecastOverrides = {},
  forecastExtended = true,
  forecastGroup = 0,
  forecastRegion = "China";
const forecastDatabase = window.DATABASE_STATE || null;
let forecastDatabaseRevision = forecastDatabase?.revision ?? 0,
  forecastDatabaseConflict = false,
  forecastSaving = false,
  forecastRetentionPending = false;
if (forecastDatabase) forecastOverrides = { ...forecastDatabase.inputs };
else
  try {
    forecastOverrides =
      JSON.parse(localStorage.getItem("2052-original-forecast-v2") || "{}")
        .inputs || {};
  } catch {}
forecastOverrides = Object.fromEntries(
  Object.entries(forecastOverrides).filter(
    ([key, value]) =>
      forecastInputAllowed(key) &&
      typeof value === "number" &&
      Number.isFinite(value),
  ),
);
const forecastCanonical = (v) =>
  JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
let forecastSavedInputs = forecastCanonical(forecastOverrides),
  forecastStorageMessage = forecastDatabase
    ? "已保存"
    : "点击保存后写入当前浏览器。";
const forecastUndoStack = [];
let forecastTableResizeObserver;
function forecastRecordUndo(snapshot = { ...forecastOverrides }) {
  if (forecastCanonical(snapshot) === forecastCanonical(forecastOverrides))
    return;
  forecastUndoStack.push(snapshot);
  if (forecastUndoStack.length > 40) forecastUndoStack.shift();
}
function forecastUndo() {
  const snapshot = forecastUndoStack.pop();
  if (!snapshot) return;
  forecastOverrides = { ...snapshot };
  forecastDraftChanged();
  drawForecast();
  drawWorkbookGraphs();
}
function forecastStorageStatus() {
  const root = forecastPanel.isConnected
    ? forecastPanel
    : document.querySelector("[data-shared-forecast-controls]") ||
      forecastPanel;
  const shared = root.hasAttribute?.("data-shared-forecast-controls");
  if (shared)
    root.querySelector(".forecast-actions").hidden =
      !forecastHasUnsavedChanges() && !forecastUndoStack.length;
  const el = root.querySelector("#forecast-storage-status");
  if (el) {
    el.textContent = forecastArchiveState() ? "只读" : forecastStorageMessage;
    el.dataset.dirty = String(
      !forecastArchiveState() && forecastHasUnsavedChanges(),
    );
  }
  const undo = root.querySelector("#forecast-undo");
  if (undo) undo.disabled = forecastSaving || !forecastUndoStack.length;
  const button = root.querySelector("#forecast-save");
  if (button) button.disabled = forecastSaving || forecastRetentionPending;
  window.dispatchEvent(new Event("2052-draft-status"));
}
function forecastHasUnsavedChanges() {
  return (
    forecastCanonical(forecastOverrides) !== forecastSavedInputs ||
    !!forecastPanel.querySelector("[data-forecast-cell][data-pending-edit]")
  );
}
window.addEventListener("beforeunload", (event) => {
  if (!forecastHasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});
function forecastDraftChanged() {
  forecastStorageMessage =
    forecastCanonical(forecastOverrides) === forecastSavedInputs
      ? "已保存"
      : "有未保存修改";
  forecastStorageStatus();
}
function forecastCanNavigate() {
  const invalid = forecastPanel.querySelector("input:invalid");
  if (!invalid) return true;
  invalid.reportValidity();
  invalid.focus();
  return false;
}
// Keep the save button attached until its click runs; committing an input redraws the graph.
document.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest?.("#forecast-save") &&
    forecastPanel.contains(document.activeElement)
  )
    event.preventDefault();
});
async function forecastSave() {
  if (forecastArchiveState()) return;
  if (forecastSaving || forecastRetentionPending) return;
  const focusedInput = document.activeElement;
  if (
    forecastPanel.contains(focusedInput) &&
    focusedInput.matches("[data-forecast-cell]")
  )
    focusedInput.blur();
  const invalidInput = forecastPanel.querySelector("input:invalid");
  if (invalidInput) {
    invalidInput.reportValidity();
    return;
  }
  const snapshot = { ...forecastOverrides };
  forecastSaving = true;
  forecastStorageMessage = "正在保存预测…";
  forecastStorageStatus();
  try {
    if (forecastDatabase) {
      if (forecastDatabaseConflict)
        throw Error("其他页面已修改预测，请重新加载后再编辑。");
      const response = await forecastRequestJSON("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: snapshot,
          revision: forecastDatabaseRevision,
        }),
      });
      const saved = response.data;
      if (!response.ok) {
        if (response.status === 409) forecastDatabaseConflict = true;
        throw Error(saved.error || "保存失败");
      }
      forecastDatabaseRevision = saved.revision;
    } else
      localStorage.setItem(
        "2052-original-forecast-v2",
        JSON.stringify({ inputs: snapshot }),
      );
    forecastSavedInputs = forecastCanonical(snapshot);
    forecastStorageMessage =
      forecastCanonical(forecastOverrides) === forecastSavedInputs
        ? "已保存"
        : "已保存点击时的预测；随后修改的内容尚未保存。";
  } catch (error) {
    forecastStorageMessage =
      "保存失败：" + error.message + " 当前修改仍保留在页面中。";
  } finally {
    forecastSaving = false;
    forecastStorageStatus();
  }
}
function forecastCol(n) {
  return String.fromCharCode(64 + n);
}
function forecastDisplayGroups(sheet) {
  const original = FORECAST_MODEL.modules[sheet] || [],
    energy = original.find((g) => g.title.startsWith("Graph 6."));
  const groups = original.map((g) =>
    g === energy ? { ...g, inputs: g.inputs.filter((r) => r.row === 252) } : g,
  );
  if (energy && !groups.some((g) => g.title.startsWith("Graph 7.")))
    groups.push({
      ...energy,
      title: "Graph 7. Energy structure",
      inputs: energy.inputs.filter((r) => [253, 254, 255, 256].includes(r.row)),
      outputs: [],
    });
  if (sheet === "SumWorld") {
    const climate = {
      title: "Graph 10. 气候变化",
      inputs: [
        {
          row: 396,
          label: "相对工业化前的温升",
          unit: "℃",
          cols: [13, 14, 15, 16, 17, 18],
        },
        {
          row: 399,
          label: "大气CO₂浓度",
          unit: "ppm",
          cols: [13, 14, 15, 16, 17, 18],
        },
        {
          row: 402,
          label: "大气CO₂当量浓度",
          unit: "ppm（二氧化碳当量）",
          cols: [13, 14, 15, 16, 17, 18],
        },
        {
          row: 403,
          label: "海平面较1850年上升",
          unit: "米",
          cols: [13, 14, 15, 16, 17, 18],
        },
      ],
      outputs: [],
    };
    const index = groups.findIndex((g) => g.title.startsWith("Graph 10."));
    if (index >= 0) groups[index] = climate;
    else groups.push(climate);
  }
  return groups;
}
function drawForecast() {
  if (forecastArchiveState()?.kind === "author") {
    forecastPanel.innerHTML = "";
    return;
  }
  forecastTableResizeObserver?.disconnect();
  const groups = forecastDisplayGroups(forecastRegion),
    g = groups[Math.min(forecastGroup, groups.length - 1)];
  forecastGroup = groups.indexOf(g);
  const engine = scenarioEngine();
  const populationIntervals =
      g.title.startsWith("Graph 1.") && g.inputs.length > 0,
    growth2025 = g.title.startsWith("Graph 3.") && g.inputs.length > 0,
    investment2025 = g.title.startsWith("Graph 4.") && g.inputs.length > 0,
    level2025 = /^Graph (10|11|12)\./.test(g.title) && g.inputs.length > 0,
    energyMix = g.title.startsWith("Graph 7."),
    energy2025 = /^Graph [67]\./.test(g.title) && g.inputs.length > 0,
    cols = energy2025
      ? Array.from({ length: 14 }, (_, i) => 10 + i)
      : Array.from(
          { length: investment2025 || level2025 ? 11 : 10 },
          (_, i) =>
            (populationIntervals || investment2025 || level2025 ? 13 : 14) + i,
        ),
    inputAddr = (row, c) =>
      populationIntervals && c === 13
        ? row === 12
          ? "POP_BIRTH_2025"
          : "POP_DEATH_2025"
        : forecastCol(
            (energy2025 && row === 252) ||
              (level2025 &&
                g.inputs.some(
                  (r) => r.row === row && /Rate of change/.test(r.label),
                ))
              ? c + 1
              : c,
          ) + row,
    value = (row, c) => {
      if (populationIntervals && c === 13)
        return populationIntervalRate(forecastRegion, row === 12);
      try {
        return forecastInputDisplayValue(
          forecastRegion,
          inputAddr(row, c),
          engine.cell(forecastRegion, inputAddr(row, c)),
        );
      } catch {
        return null;
      }
    },
    columnYear = (c) => (growth2025 ? 1965 : 1970) + (c - 2) * 5,
    columnLabel = (c) =>
      populationIntervals || growth2025
        ? columnYear(c) + "—" + (columnYear(c) + 5)
        : String(columnYear(c));
  forecastPanel.innerHTML =
    '<h2>预测调整</h2><button id="forecast-reset" class="action">恢复本图默认假设</button><h3>' +
    (energy2025 ? "历史参考与预测 · 同一时间轴" : "手动输入 · 黄色单元格") +
    '</h3><div class="tablewrap"><table><thead><tr><th>假设 / 单位</th>' +
    cols
      .map(
        (c) =>
          "<th" +
          (energy2025 && c < 13 ? ' style="background:#f1f5f1"' : "") +
          ">" +
          columnLabel(c) +
          "</th>",
      )
      .join("") +
    "</tr></thead><tbody>" +
    g.inputs
      .map(
        (r) =>
          '<tr><th scope="row" style="text-align:left">' +
          esc(localize(r.label)) +
          "<br><small>" +
          esc(
            investment2025
              ? "%（占GDP）"
              : /^Cultivated land/i.test(r.label)
                ? "百万公顷（收获面积，含复种）"
                : /^Gross yield/i.test(r.label)
                  ? "吨／公顷"
                  : localize(r.unit),
          ) +
          "</small>" +
          (/Growth in Energy intensity|Rate of change of NEFPP/.test(r.label)
            ? "<br><small>" +
              (energy2025 || level2025
                ? "各列为从该年份开始的五年区间"
                : "各列为截至该年份的前五年区间") +
              "</small>"
            : "") +
          "</th>" +
          cols
            .map((c) => {
              if (energy2025 && c < 13) {
                const year = 1970 + (c - 2) * 5,
                  entry =
                    ACTUAL[forecastRegion]?.[r.label] ||
                    ACTUAL[forecastRegion]?.["Energy reference " + r.row],
                  v = entry?.points[year];
                return (
                  '<td style="background:#f1f5f1;color:#4a6257" title="' +
                  esc(
                    "历史参考 · " +
                      (entry?.yearNotes?.[year] || "完整区域资料不足") +
                      " · " +
                      (entry?.sources?.[0]?.title || ""),
                  ) +
                  '">' +
                  (v != null ? Number(v).toFixed(2) : "—") +
                  "</td>"
                );
              }
              if (
                ((energy2025 && r.row === 252) ||
                  (level2025 && /Rate of change/.test(r.label))) &&
                c === 23
              )
                return "<td>—</td>";
              if (
                c <= 18 &&
                !r.cols.includes(c) &&
                !(
                  (populationIntervals ||
                    growth2025 ||
                    investment2025 ||
                    energy2025 ||
                    level2025) &&
                  c === 13
                )
              )
                return "<td>—</td>";
              const addr = inputAddr(r.row, c),
                v = value(r.row, c),
                inputYear =
                  r.row === 252 || /Rate of change/.test(r.label)
                    ? columnYear(c) + "—" + (columnYear(c) + 5)
                    : columnLabel(c);
              return (
                '<td><input type="number" step="any" data-forecast-cell="' +
                addr +
                '" aria-label="' +
                esc(localize(r.label)) +
                " " +
                inputYear +
                "，" +
                esc(
                  investment2025
                    ? "%（占GDP）"
                    : /^Cultivated land/i.test(r.label)
                      ? "百万公顷（收获面积，含复种）"
                      : /^Gross yield/i.test(r.label)
                        ? "吨／公顷"
                        : localize(r.unit),
                ) +
                '" title="' +
                esc("预测假设；修改后联动计算，明确保存才持久化") +
                '" value="' +
                forecastCompactValue(v) +
                '"></td>'
              );
            })
            .join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table></div>" +
    (g.inputs.length
      ? ""
      : "<p>此模块通过其他模块的假设联动，没有独立的黄色输入项。</p>") +
    '<p id="forecast-state" role="status"></p>';
  const inputTable = forecastPanel.querySelector(".tablewrap"),
    inputHeading = inputTable?.previousElementSibling,
    panelTitle = forecastPanel.querySelector("h2");
  if (inputTable && inputHeading && panelTitle) {
    panelTitle.after(inputTable);
    inputHeading.remove();
    const hint = document.createElement("p");
    hint.textContent = energyMix
      ? "灰色为历史参考，黄色为预测占比。"
      : energy2025
        ? "灰色为历史参考，黄色为预测。增长率按五年区间填写。"
        : "修改黄色数字或拖动选中曲线的点；点击保存才会保留。";
    inputTable.before(hint);
    inputTable.style.marginTop = "8px";
  }
  if (inputTable) {
    const hint = document.createElement("span");
    hint.className = "scroll-hint";
    hint.textContent = "向右滚动查看更多年份 →";
    inputTable.after(hint);
    const update = () => {
      hint.hidden =
        inputTable.scrollWidth <= inputTable.clientWidth + 2 ||
        inputTable.scrollLeft + inputTable.clientWidth >=
          inputTable.scrollWidth - 2;
    };
    inputTable.addEventListener("scroll", update, { passive: true });
    requestAnimationFrame(update);
    if (typeof ResizeObserver !== "undefined") {
      forecastTableResizeObserver = new ResizeObserver(update);
      forecastTableResizeObserver.observe(inputTable);
    }
  }
  const saveControls = document.createElement("div");
  saveControls.innerHTML =
    '<button class="action" id="forecast-save">保存预测</button><p id="forecast-storage-status" role="status"></p>';
  const toolbar = document.createElement("div");
  toolbar.className = "forecast-toolbar";
  const heading = forecastPanel.querySelector("h2"),
    reset = forecastPanel.querySelector("#forecast-reset");
  heading.before(toolbar);
  saveControls.className = "forecast-actions";
  const undo = document.createElement("button");
  undo.id = "forecast-undo";
  undo.className = "action secondary";
  undo.textContent = "撤销上一步";
  undo.title = "撤销最近一次输入、拖动或恢复默认操作";
  undo.disabled = !forecastUndoStack.length;
  undo.onclick = forecastUndo;
  saveControls.append(undo, reset);
  toolbar.append(heading, saveControls);
  forecastPanel.querySelectorAll("[data-forecast-cell]").forEach((input) => {
    input.addEventListener("focus", () => {
      const cell = input.closest("td"),
        column = cell.cellIndex,
        table = cell.closest("table");
      table
        .querySelectorAll(".active-column")
        .forEach((el) => el.classList.remove("active-column"));
      table
        .querySelectorAll("tr")
        .forEach((row) => row.cells[column]?.classList.add("active-column"));
    });
    input.addEventListener("blur", () =>
      input
        .closest("table")
        .querySelectorAll(".active-column")
        .forEach((el) => el.classList.remove("active-column")),
    );
  });
  forecastPanel.querySelector("#forecast-save").onclick = forecastSave;
  forecastStorageStatus();
  function results() {
    const calc = scenarioEngine();
    const issues = [];
    for (const row of g.outputs)
      for (const c of cols) {
        if (c <= 18 && !row.cols.includes(c)) continue;
        const address = forecastCol(c) + row.row;
        // An absent source cell is a coverage gap, not an invalid prediction.
        const defined =
          FORECAST_MODEL.cells[forecastRegion]?.[address] ??
          FORECAST_MODEL.extension[forecastRegion]?.[address];
        if (
          defined == null ||
          (typeof defined === "string" && !defined.startsWith("="))
        )
          continue;
        try {
          if (!Number.isFinite(calc.cell(forecastRegion, address)))
            throw Error("invalid");
        } catch {
          issues.push(
            localize(row.label) + "（" + (1970 + (c - 2) * 5) + "年）",
          );
        }
      }
    forecastPanel.querySelector("#forecast-state").textContent = issues.length
      ? "计算异常：" +
        issues.slice(0, 5).join("、") +
        (issues.length > 5 ? "等" + issues.length + "项" : "") +
        "。请核对相关预测输入。"
      : "";
  }
  results();
  forecastPanel.querySelectorAll("[data-forecast-cell]").forEach((input) => {
    const addr = input.dataset.forecastCell;
    let exact = addr.startsWith("POP_")
      ? populationIntervalRate(forecastRegion, addr.includes("BIRTH"))
      : forecastInputDisplayValue(
          forecastRegion,
          addr,
          engine.cell(forecastRegion, addr),
        );
    let focusValue = "";
    const fit = () => {
      input.style.width =
        Math.max(10, Math.min(28, input.value.length + 3)) + "ch";
    };
    fit();
    input.onfocus = () => {
      if (input.validity.valid)
        input.value = Number.isFinite(exact) ? String(exact) : "";
      fit();
      focusValue = input.value;
    };
    input.oninput = () => {
      fit();
      if (input.value !== focusValue) input.dataset.pendingEdit = "true";
      else delete input.dataset.pendingEdit;
      forecastStorageMessage = forecastHasUnsavedChanges()
        ? "有未保存修改"
        : "已保存";
      forecastStorageStatus();
    };
    input.onchange = () => {
      if (input.value === focusValue) {
        input.setCustomValidity("");
        return;
      }
      const key = forecastRegion + "!" + addr;
      const stored = forecastInputStoredValue(
        forecastRegion,
        addr,
        input.valueAsNumber,
      );
      const error =
        input.value.trim() === ""
          ? "请输入数值。"
          : forecastInputError(key, stored);
      input.dataset.validationSource = error;
      input.setCustomValidity(window.PUBLIC_LANGUAGE?.text(error) || error);
      input.setAttribute("aria-invalid", String(!!error));
      if (error) {
        input.reportValidity();
        return;
      }
      delete input.dataset.pendingEdit;
      exact = input.valueAsNumber;
      const before = { ...forecastOverrides };
      forecastOverrides[key] = stored;
      forecastRecordUndo(before);
      forecastDraftChanged();
      results();
      if (typeof drawWorkbookGraphs === "function") drawWorkbookGraphs();
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        input.setCustomValidity("");
        input.dataset.validationSource = "";
        input.setAttribute("aria-invalid", "false");
        input.value = Number.isFinite(exact) ? String(exact) : "";
        delete input.dataset.pendingEdit;
        forecastDraftChanged();
        input.blur();
      }
    };
    input.onblur = () => {
      if (input.dataset.pendingEdit) input.onchange();
      if (input.validity.valid) input.value = forecastCompactValue(exact);
      fit();
    };
  });
  forecastPanel.querySelector("#forecast-reset").onclick = () => {
    const before = { ...forecastOverrides };
    forecastOverrides = Object.fromEntries(
      Object.entries(forecastOverrides).filter(
        ([k]) =>
          !g.inputs.some((r) =>
            cols.some(
              (c) =>
                (!energy2025 || c >= 13) &&
                k === forecastRegion + "!" + inputAddr(r.row, c),
            ),
          ),
      ),
    );
    forecastRecordUndo(before);
    forecastDraftChanged();
    drawForecast();
    if (typeof drawWorkbookGraphs === "function") drawWorkbookGraphs();
  };
  if (forecastArchiveState()) {
    forecastPanel.querySelector("h2").textContent = "留存的预测假设";
    forecastPanel
      .querySelectorAll("button")
      .forEach((button) => (button.hidden = true));
    forecastPanel
      .querySelectorAll("input")
      .forEach((input) => (input.readOnly = true));
    forecastPanel.querySelector("#forecast-storage-status").textContent =
      "只读";
  }
}
drawForecast();
