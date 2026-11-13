// Page composition, graph selection and persisted view state.
const graphGallery = document.createElement("section");
graphGallery.id = "workbook-graphs";
document.querySelector("main").append(graphGallery);
function placeForecastBeside(number) {
  activeForecastGraph = +number;
  const slot = graphGallery.querySelector(
    '[data-forecast-slot="' + number + '"]',
  );
  if (!slot) return;
  if (forecastArchiveState()?.kind === "author") {
    slot.replaceChildren();
    return;
  }
  graphGallery.querySelectorAll("article").forEach((card) => {
    card.classList.remove("forecast-open");
    card.style.gridColumn = "";
  });
  const targetRegion = +number === 10 ? "SumWorld" : region;
  const idx = forecastDisplayGroups(targetRegion).findIndex((g) =>
    g.title.startsWith("Graph " + number + "."),
  );
  if (forecastRegion !== targetRegion || (idx >= 0 && forecastGroup !== idx)) {
    forecastRegion = targetRegion;
    if (idx >= 0) forecastGroup = idx;
    drawForecast();
  }
  if (idx < 0 || !forecastDisplayGroups(targetRegion)[idx]?.inputs.length) {
    if (forecastArchiveState()) {
      slot.replaceChildren();
      return;
    }
    slot.innerHTML =
      '<section class="note" data-shared-forecast-controls><div class="forecast-toolbar"><h3>联动预测</h3><div class="forecast-actions"><p id="forecast-storage-status" role="status"></p><button class="action" id="forecast-save">保存预测</button><button class="action secondary" id="forecast-undo">撤销上一步</button></div></div><p>由相关预测假设联动计算。</p></section>';
    slot.querySelector("#forecast-save").onclick = forecastSave;
    slot.querySelector("#forecast-undo").onclick = forecastUndo;
    const drivers = graphAssumptionDrivers[Number(number)] || [Number(number)];
    if (region === "SumWorld" && number !== 10) {
      const text = slot.querySelector(".note>p");
      text.textContent =
        number === 1
          ? "由各地区的粗出生率、粗死亡率联动计算。"
          : "由各地区的" +
            drivers
              .filter((n) => n !== 10)
              .map((n) => graphLabels[n - 1])
              .join("、") +
            "假设联动计算。选择地区查看对应假设。";
      const links = document.createElement("div");
      links.className = "linked-regions";
      links.setAttribute("aria-label", "参与全球联动计算的地区假设");
      for (const target of Object.keys(names).filter(
        (key) => key !== "SumWorld",
      )) {
        const jump = document.createElement("button");
        jump.className = "action secondary";
        jump.type = "button";
        jump.textContent = names[target];
        jump.setAttribute(
          "aria-label",
          "查看" + names[target] + " · 图" + number + "的联动假设",
        );
        jump.onclick = () => {
          if (!forecastCanNavigate()) return;
          region = target;
          drawWorkbookGraphs();
        };
        links.append(jump);
      }
      text.after(links);
    }
    const inputGraphs =
      region === "SumWorld" ? drivers.filter((n) => n === 10) : drivers;
    if (inputGraphs.length) {
      const links = document.createElement("div");
      links.className = "linked-assumptions";
      links.setAttribute("aria-label", "修改此图的相关预测假设");
      for (const inputGraph of inputGraphs) {
        const jump = document.createElement("button");
        jump.type = "button";
        jump.className = "action secondary";
        jump.textContent =
          "Graph " + inputGraph + " · " + graphLabels[inputGraph - 1];
        jump.onclick = () => {
          if (!forecastCanNavigate()) return;
          activeForecastGraph = inputGraph;
          render();
        };
        links.append(jump);
      }
      slot.querySelector(".note").append(links);
    }
    forecastStorageStatus();
    return;
  }
  const oldHeading = forecastPanel.querySelector("h2");
  if (oldHeading) {
    const heading = document.createElement("h3");
    heading.textContent = oldHeading.textContent;
    oldHeading.replaceWith(heading);
  }
  slot.append(forecastPanel);
  forecastPanel.hidden = false;
  slot.hidden = false;
  const card = slot.closest("article");
  card.classList.add("forecast-open");
  card.style.gridColumn = "1 / -1";
  forecastPanel.style.marginTop = "0";
  forecastStorageStatus();
}
function drawWorkbookGraphs() {
  // Climate indicators are global; keep the previous regional view for other graphs.
  const globalOnly = activeForecastGraph === 10;
  const displayedRegion = globalOnly ? "SumWorld" : region;
  graphHoverData.clear();
  if (forecastPanel.parentNode) forecastPanel.remove();
  const engine = scenarioEngine();
  graphGallery.innerHTML =
    '<div class="graph-controls"><label>区域 <select id="graphs-region"' +
    (globalOnly ? ' disabled title="图10仅显示全球数据"' : "") +
    ">" +
    Object.entries(names)
      .filter(([k]) => !globalOnly || k === "SumWorld")
      .map(
        ([k, v]) =>
          '<option value="' +
          k +
          '" ' +
          (k === displayedRegion ? "selected" : "") +
          ">" +
          esc(v) +
          "</option>",
      )
      .join("") +
    '</select></label><label>图表 <select id="graphs-select">' +
    graphLabels
      .map(
        (t, i) =>
          '<option value="' +
          (i + 1) +
          '" ' +
          (activeForecastGraph === i + 1 ? "selected" : "") +
          ">Graph " +
          (i + 1) +
          " · " +
          t +
          "</option>",
      )
      .join("") +
    '</select></label></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:20px">' +
    WORKBOOK_GRAPHS[displayedRegion]
      .filter((g) => g.number === activeForecastGraph)
      .map((g) => {
        const actual = g.globalOnly ? WORKBOOK_GRAPHS.SumWorld[9] : g;
        return (
          '<article id="workbook-graph-' +
          g.number +
          '" class="panel" style="min-width:0;scroll-margin-top:20px"><div style="min-width:0"><h2 class="graph-title">Graph ' +
          g.number +
          " · " +
          graphLabels[g.number - 1] +
          "</h2>" +
          (g.globalOnly
            ? "<p>原区域表未放置气候图；这里展示预测模型全球Graph 10，属于全球指标。</p>"
            : "") +
          (g.number === 11
            ? forecastArchiveState()?.kind === "author"
              ? '<p class="hint">原书使用耕地面积口径，不能直接与新版收获面积比较。</p>'
              : '<p class="hint">收获面积按每次收获累计，含复种，不是实际占地面积；单产按收获面积计算。作物总产量含饲料与非食用作物。</p>'
            : "") +
          (forecastArchiveState()?.kind !== "author" &&
          [6, 12].includes(g.number)
            ? '<p class="hint">未来节点按区间起点标记：2025点代表2025—2030的区间末值。</p>'
            : "") +
          workbookPlot(actual, engine) +
          (actual.subgraphs || [])
            .map(
              (sub) =>
                '<h3 class="subgraph-title">' +
                esc(localize(sub.title).replace(/%\s*[／/]\s*年/g, "%")) +
                "</h3>" +
                workbookPlot(sub, engine),
            )
            .join("") +
          '</div><div data-forecast-slot="' +
          g.number +
          '"></div></article>'
        );
      })
      .join("") +
    "</div>";
  document.getElementById("graphs-select").onchange = (e) => {
    if (!forecastCanNavigate()) {
      e.target.value = String(activeForecastGraph);
      return;
    }
    activeForecastGraph = +e.target.value;
    render();
  };
  document.getElementById("graphs-region").onchange = (e) => {
    if (activeForecastGraph === 10) return;
    if (!forecastCanNavigate()) {
      e.target.value = region;
      return;
    }
    region = e.target.value;
    drawWorkbookGraphs();
  };
  bindGraphHover();
  placeForecastBeside(activeForecastGraph);
}
function render() {
  drawWorkbookGraphs();
}

document.addEventListener("click", (event) => {
  const target = event.target?.closest?.(
    "[data-line-hit],[data-drag-series],[data-line-select]",
  );
  if (
    target &&
    (target.hasAttribute("data-line-hit") ||
      target.hasAttribute("data-drag-series") ||
      !target.disabled)
  )
    return;
  if (!graphEditableSelection.size) return;
  graphEditableSelection.clear();
  graphGallery
    .querySelectorAll("[data-drag-series]")
    .forEach((marker) => marker.remove());
  graphGallery.querySelectorAll("svg path").forEach((path) => {
    if (graphPalette.includes(path.getAttribute("stroke"))) {
      path.setAttribute("stroke-width", "2");
      path.setAttribute("opacity", "1");
    }
  });
  graphGallery.querySelectorAll("[data-line-select]").forEach((legend) => {
    legend.style.fontWeight = "400";
    legend.style.background = "transparent";
    legend.setAttribute("aria-pressed", "false");
  });
  graphGallery.querySelectorAll("[data-graph-hover]").forEach((box) => {
    const data = graphHoverData.get(box.dataset.graphHover),
      old = box.querySelector("svg");
    if (!data || !old) return;
    old.querySelectorAll("[data-line-hit]").forEach((hit) => hit.remove());
    bindPredictionDrag(box, old, data);
  });
});

// View state is independent of forecast drafts and never calls the save API.
function save2052View() {
  try {
    sessionStorage.setItem(
      viewStorageKey,
      JSON.stringify({
        region,
        graph: activeForecastGraph,
        scrollY: window.scrollY,
      }),
    );
  } catch {}
}
let view2052 = null;
const viewStorageKey = forecastArchiveState()
  ? "2052-view-version-" + forecastArchiveState().id
  : "2052-view";
try {
  view2052 = JSON.parse(sessionStorage.getItem(viewStorageKey) || "null");
} catch {}
if (forecastArchiveState()) {
  const params = new URLSearchParams(location.search),
    requestedGraph = Number(params.get("graph"));
  if (
    Object.hasOwn(names, params.get("region")) &&
    requestedGraph >= 1 &&
    requestedGraph <= 15
  )
    view2052 = {
      region: params.get("region"),
      graph: requestedGraph,
      scrollY: 0,
    };
}
if (
  view2052 &&
  Object.hasOwn(names, view2052.region) &&
  Number.isInteger(view2052.graph) &&
  view2052.graph >= 1 &&
  view2052.graph <= 15
) {
  region = view2052.region;
  compare = new Set([region]);
  activeForecastGraph = view2052.graph;
  const restoreScroll = () =>
    requestAnimationFrame(() =>
      window.scrollTo({
        top: Math.max(0, Number(view2052.scrollY) || 0),
        behavior: "instant",
      }),
    );
  if (document.readyState === "complete") restoreScroll();
  else window.addEventListener("load", restoreScroll, { once: true });
}
render();
window.addEventListener("pagehide", save2052View);
window.addEventListener("beforeunload", save2052View);
let viewScrollTimer;
window.addEventListener(
  "scroll",
  () => {
    clearTimeout(viewScrollTimer);
    viewScrollTimer = setTimeout(save2052View, 150);
  },
  { passive: true },
);
const viewDrawWorkbookGraphs = drawWorkbookGraphs;
drawWorkbookGraphs = function () {
  viewDrawWorkbookGraphs();
  save2052View();
};
