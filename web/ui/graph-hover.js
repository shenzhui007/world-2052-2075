// Year hover interaction; details stay below the plot.
function bindGraphHover() {
  graphGallery.querySelectorAll("[data-graph-hover]").forEach((box) => {
    const svg = box.querySelector("svg"),
      data = graphHoverData.get(box.dataset.graphHover);
    if (!svg || !data) return;
    const tip = document.createElement("div");
    tip.className = "graph-hover-tip";
    tip.hidden = true;
    tip.hidden = false;
    tip.innerHTML =
      '<span style="color:#657369">移入查看数值；点击锁定。键盘 ← → 切换年份，Enter锁定，Esc解除。</span>';
    box.after(tip);
    const announce = document.createElement("span");
    announce.className = "sr-only";
    announce.setAttribute("aria-live", "polite");
    announce.setAttribute("aria-atomic", "true");
    tip.after(announce);
    const nav = document.createElement("div");
    nav.className = "chart-nav";
    nav.innerHTML =
      '<span>左右滑动时间轴</span><button type="button" class="action secondary">历史</button><button type="button" class="action secondary">预测</button>';
    box.before(nav);
    const reveal = (index) => {
      box.scrollLeft = Math.max(
        0,
        ((55 + (index / 21) * 685) / 780) * svg.getBoundingClientRect().width -
          box.clientWidth / 2,
      );
    };
    const jumps = nav.querySelectorAll("button");
    jumps[0].onclick = () => reveal(4);
    jumps[1].onclick = () =>
      reveal(forecastArchiveState()?.kind === "author" ? 9 : 11);
    requestAnimationFrame(() => {
      if (
        box.isConnected &&
        box.scrollWidth > box.clientWidth &&
        !graphPinnedYears.has(
          graphInteractionKey(data.g) + ":" + data.ss[0]?.label,
        )
      )
        reveal(forecastArchiveState()?.kind === "author" ? 9 : 11);
    });
    const capture = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    capture.setAttribute("x", "55");
    capture.setAttribute("y", "35");
    capture.setAttribute("width", "685");
    capture.setAttribute("height", "225");
    capture.setAttribute("fill", "transparent");
    capture.setAttribute("pointer-events", "all");
    capture.style.cursor = "crosshair";
    svg.append(capture);
    const line = document.createElement("div");
    line.style.cssText =
      "position:absolute;top:11.2903%;height:72.5806%;width:2px;background:#237462;z-index:4;pointer-events:none;display:none";
    box.append(line);
    const pinKey = graphInteractionKey(data.g) + ":" + data.ss[0]?.label;
    let last = -1,
      locked = false;
    function setLocked(value) {
      locked = value;
      tip.classList.toggle("year-locked", locked);
      if (locked) graphPinnedYears.set(pinKey, last);
      else graphPinnedYears.delete(pinKey);
      tip.querySelector(".year-unlock")?.remove();
      if (locked) {
        const unlock = document.createElement("button");
        unlock.type = "button";
        unlock.className = "year-unlock";
        unlock.textContent = "解除锁定";
        unlock.onclick = () => {
          setLocked(false);
          line.style.display = "none";
        };
        tip.querySelector("strong")?.append(unlock);
      }
    }
    function showIndex(index) {
      let rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (box.scrollWidth > box.clientWidth) {
        box.scrollLeft = Math.max(
          0,
          ((55 + (index / 21) * 685) / 780) * rect.width - box.clientWidth / 2,
        );
        rect = svg.getBoundingClientRect();
      }
      locked = false;
      move({
        clientX: rect.left + ((55 + (index / 21) * 685) / 780) * rect.width,
        clientY: rect.top + (100 / 310) * rect.height,
      });
      setLocked(true);
    }
    box.tabIndex = 0;
    box.setAttribute("aria-label", "图表：点击锁定年份，按Esc解锁");
    function move(event) {
      if (locked) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((event.clientX - rect.left) / rect.width) * 780,
        y = ((event.clientY - rect.top) / rect.height) * 310;
      if (x < 55 || x > 740 || y < 35 || y > 260) {
        line.style.display = "none";
        return;
      }
      const index = Math.max(
          0,
          Math.min(21, Math.round(((x - 55) / 685) * 21)),
        ),
        position = 55 + (index / 21) * 685;
      line.style.left =
        rect.left -
        box.getBoundingClientRect().left +
        box.scrollLeft +
        (position / 780) * rect.width +
        "px";
      line.style.top = (35 / 310) * rect.height + "px";
      line.style.height = (225 / 310) * rect.height + "px";
      line.style.display = "block";
      if (index !== last) {
        last = index;
        const year = 1970 + index * 5;
        tip.innerHTML =
          "<strong>" +
          year +
          "年 · " +
          (forecastArchiveState()?.kind === "author"
            ? year <= 2010
              ? "原书历史参考"
              : "作者当时的预测"
            : year === 2025 && data.g.number === 1
              ? "历史数据与区间预测"
              : year > 2025 ||
                  data.ss
                    .filter((s) => s.values[index] != null)
                    .every(
                      (s) =>
                        graphUses2025Prediction(s, index) ||
                        (year === 2025 &&
                          /^Growth in productivity/i.test(s.label)),
                    )
                ? "情景预测"
                : "历史数据") +
          "</strong>" +
          data.ss
            .map((series, j) => {
              const available = series.values[index] != null;
              const intervalText =
                data.g.number === 1 && index === 11
                  ? graphPopulationIntervalDetails(series)
                  : null;
              const intervalLines = intervalText?.split("\n"),
                intervalHTML = intervalLines
                  ? '<div style="margin-top:8px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
                    graphPalette[j % graphPalette.length] +
                    '"></i> ' +
                    esc(intervalLines[0]) +
                    "：<b>" +
                    esc(intervalLines[2].replace("数值：", "")) +
                    '</b><br><small style="color:#657369">' +
                    esc(intervalLines[3].replace("数据类型：", "")) +
                    "</small></div>"
                  : "";
              if (!available) return intervalHTML;
              if (
                intervalLines &&
                graphPopulationIntervalMatchesHistory(series)
              ) {
                const source = data
                  .details(series, index)
                  .split("\n")
                  .find((t) => t.startsWith("来源："));
                return (
                  '<div style="margin-top:8px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
                  graphPalette[j % graphPalette.length] +
                  '"></i> ' +
                  esc(intervalLines[0].replace("（2025—2030年区间）", "")) +
                  "：<b>" +
                  esc(intervalLines[2].replace("数值：", "")) +
                  '</b><br><small style="color:#657369">' +
                  provenanceHTML(source || "") +
                  "<br>2025—2030年区间预测采用此值 · " +
                  esc(intervalLines[3].replace("数据类型：", "")) +
                  "</small></div>"
                );
              }
              const lines = data.details(series, index).split("\n"),
                number = lines.find((t) => t.startsWith("数值：")),
                native = lines.find((t) => t.startsWith("来源原值：")),
                source = lines.find((t) => t.startsWith("来源：")),
                method = lines.find((t) => t.startsWith("数据类型：")),
                prediction =
                  lines[1]?.includes("情景预测") ||
                  lines[1]?.includes("作者当时的预测"),
                cropCalculation =
                  !prediction &&
                  (graphHistoricalEntry(series)?.agriculture ||
                    graphHistoricalEntry(series)?.footprint)
                    ? graphHistoricalEntry(series).yearCalculations?.[year]
                    : null;
              return (
                '<div style="margin-top:8px"><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
                graphPalette[j % graphPalette.length] +
                '"></i> ' +
                esc(lines[0]) +
                "：<b>" +
                esc((number || "").replace("数值：", "")) +
                "</b>" +
                (series.forecastIntervalResult && index >= 11
                  ? "<br><small>" +
                    year +
                    "—" +
                    (year + 5) +
                    "年 · 区间末值</small>"
                  : "") +
                (native ? "<br><span>" + esc(native) + "</span>" : "") +
                '<br><small style="color:#657369">' +
                (prediction
                  ? esc(method?.replace("数据类型：", "") || "预测计算值")
                  : provenanceHTML(source || "来源：历史计算值") +
                    (method ? " · " + esc(method) : "")) +
                "</small>" +
                (cropCalculation
                  ? '<br><small style="color:#657369">' +
                    esc(cropCalculation) +
                    "</small>"
                  : "") +
                (forecastArchiveState()?.kind === "author" ||
                prediction ||
                (graphIsForecastInput(series, index) &&
                  calculationProvenance(series, index).includes(
                    "预测值（用户设定",
                  )) ||
                graphHasQueriedValue(series, index)
                  ? ""
                  : "<details><summary>计算核对</summary>" +
                    provenanceHTML(conciseCalculation(series, index)) +
                    "</details>") +
                "</div>" +
                intervalHTML
              );
            })
            .join("");
        if (forecastArchiveState() && year > forecastArchiveState().endYear)
          tip.innerHTML =
            "<strong>" +
            year +
            "年</strong><span>此版本的预测止于" +
            forecastArchiveState().endYear +
            "年。</span>";
      }
      tip.hidden = false;
    }
    box.addEventListener("pointermove", move);
    box.addEventListener("mousemove", move);
    box.addEventListener("pointerleave", () => {
      if (!locked) line.style.display = "none";
    });
    box.addEventListener("pointerdown", move);
    box.addEventListener("click", (event) => {
      if (event.target.closest("[data-drag-series],[data-line-hit]")) return;
      if (locked) {
        setLocked(false);
        move(event);
        return;
      }
      const rect = svg.getBoundingClientRect(),
        x = ((event.clientX - rect.left) / rect.width) * 780,
        y = ((event.clientY - rect.top) / rect.height) * 310;
      if (x < 55 || x > 740 || y < 35 || y > 260) return;
      move(event);
      if (last >= 0) {
        setLocked(true);
        box.focus({ preventScroll: true });
      }
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setLocked(false);
        line.style.display = "none";
        return;
      }
      if (
        !["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      if (event.key === "Enter" || event.key === " ") {
        if (last < 0) showIndex(11);
        else setLocked(!locked);
        return;
      }
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? 21
            : Math.max(
                0,
                Math.min(
                  21,
                  (last < 0 ? 11 : last) +
                    (event.key === "ArrowRight" ? 1 : -1),
                ),
              );
      showIndex(index);
      announce.textContent = tip.textContent;
    });
    if (graphPinnedYears.has(pinKey))
      requestAnimationFrame(() => {
        if (box.isConnected) showIndex(graphPinnedYears.get(pinKey));
      });
    bindPredictionDrag(box, svg, data);
  });
}
