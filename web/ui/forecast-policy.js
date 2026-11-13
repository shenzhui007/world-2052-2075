// Input whitelist and historical/prediction engine policy; no DOM or persistence.
function forecastArchiveState() {
  return typeof window === "undefined" ? null : window.FORECAST_ARCHIVE || null;
}
function archiveEngine(kind) {
  const values = forecastArchiveState()?.results?.[kind];
  if (!values) return null;
  return {
    cell(sheet, addr) {
      const key = sheet + "!" + addr.replaceAll("$", "").toUpperCase();
      if (!Object.hasOwn(values, key) || values[key] === null)
        throw Error("留存版本无可用数值");
      return values[key];
    },
  };
}
function forecast2025GrowthAllowed(sheet) {
  return forecastAllowedInputs.has(sheet + "!M99");
}
const forecastAllowedInputs = new Set(FORECAST_INPUT_POLICY);
function forecastInputAllowed(key) {
  return forecastAllowedInputs.has(key);
}
function sourceAnchors() {
  return Object.fromEntries(
    Object.entries(HISTORY_VALUES).map(([k, v]) => [k, v.value]),
  );
}
function populationIntervalRate(sheet, birth) {
  const key = sheet + "!" + (birth ? "POP_BIRTH_2025" : "POP_DEATH_2025");
  if (Object.hasOwn(forecastOverrides, key)) return forecastOverrides[key];
  return forecastEngine(FORECAST_MODEL, sourceAnchors(), false).cell(
    sheet,
    birth ? "M12" : "M13",
  );
}
// 2025 controls are interval assumptions, separate from observed 2025 rates.
function graphPopulationIntervalRate(series) {
  if (forecastArchiveState()?.kind === "author") return null;
  if (!/^Crude (birth|death) rate/i.test(series.label)) return null;
  const birth = /birth/i.test(series.label);
  if (series.sheet !== "SumWorld")
    return populationIntervalRate(series.sheet, birth);
  const engine = historicalEngine();
  let total = 0,
    weighted = 0;
  for (const region of ["China", "USA", "OECD", "BRISE", "ROW"]) {
    const population = engine.cell(region, "M9"),
      rate = populationIntervalRate(region, birth);
    if (!Number.isFinite(population) || !Number.isFinite(rate)) return null;
    total += population;
    weighted += population * rate;
  }
  return total > 0 ? weighted / total : null;
}
function scenarioEngine() {
  const frozen = archiveEngine("scenario");
  if (frozen) return frozen;
  if (forecastArchiveState()?.kind === "author")
    return forecastEngine(FORECAST_MODEL, {}, false);
  const inputs = Object.fromEntries(
    Object.entries(forecastOverrides).filter(
      ([key]) =>
        (!/[!][B-M]\d+$/.test(key) ||
          (/!M\d+$/.test(key) && forecastInputAllowed(key))) &&
        !key.includes("!POP_"),
    ),
  );
  const anchors = sourceAnchors();
  // Climate levels from 2025 are explicit forecast assumptions, not history anchors.
  delete anchors["SumWorld!M396"];
  delete anchors["SumWorld!M403"];
  // Keep the published 2025 CO2 level as the default; a manual draft takes priority.
  if (
    !Object.hasOwn(inputs, "SumWorld!M399") &&
    Number.isFinite(anchors["SumWorld!M399"])
  )
    inputs["SumWorld!M399"] = anchors["SumWorld!M399"];
  delete anchors["SumWorld!M399"];
  delete anchors["SumWorld!M402"];
  const base = forecastEngine(FORECAST_MODEL, anchors, false);
  for (const [sheet, groups] of Object.entries(FORECAST_MODEL.modules)) {
    if (
      !groups.some(
        (group) => group.title.startsWith("Graph 1.") && group.inputs.length,
      )
    )
      continue;
    const population = base.cell(sheet, "M9"),
      birth = populationIntervalRate(sheet, true),
      death = populationIntervalRate(sheet, false);
    inputs[sheet + "!N9"] = population * (1 + ((birth - death) / 100) * 5);
  }
  return forecastEngine(FORECAST_MODEL, { ...inputs, ...anchors }, true);
}
function historicalEngine() {
  const frozen = archiveEngine("historical");
  if (frozen) return frozen;
  if (forecastArchiveState()?.kind === "author")
    return forecastEngine(FORECAST_MODEL, {}, false);
  const inputs = { ...sourceAnchors() };
  for (const k of HISTORY_MISSING)
    if (!Object.hasOwn(inputs, k)) inputs[k] = NaN;
  return forecastEngine(FORECAST_MODEL, inputs, false);
}

function forecastInputDisplayValue(sheet, addr, value) {
  return sheet === "SumWorld" && /^[M-W]403$/.test(addr)
    ? (value + 200) / 1000
    : value;
}
function forecastInputStoredValue(sheet, addr, value) {
  return sheet === "SumWorld" && /^[M-W]403$/.test(addr)
    ? value * 1000 - 200
    : value;
}

function forecastInputError(key, value) {
  if (!Number.isFinite(value)) return "请输入有限数值。";
  const [min, max] = FORECAST_INPUT_BOUNDS[key] || [null, null];
  if ((min != null && value < min) || (max != null && value > max))
    return max == null
      ? "数值不能小于 " + min + "。"
      : "数值必须在 " + min + "—" + max + " 之间。";
  const available = forecastEnergyLimit(key);
  if (available != null && value > available + 1e-9)
    return (
      "能源占比合计不能超过100%；此项最多可填 " +
      forecastCompactValue(Math.floor(available * 1000) / 1000) +
      "% 。"
    );
  return "";
}
function forecastCompactValue(value) {
  if (!Number.isFinite(value)) return "";
  if (value !== 0 && Math.abs(value) < 0.001)
    return String(Number(value.toPrecision(3)));
  return String(Number(value.toFixed(3)));
}

function forecastEnergyLimit(key) {
  const match = key.match(/^(\w+)!([M-W])(253|254|255|256)$/);
  if (!match) return null;
  const engine = scenarioEngine();
  const other = [253, 254, 255, 256]
    .filter((row) => row !== +match[3])
    .reduce((sum, row) => sum + engine.cell(match[1], match[2] + row), 0);
  return 100 - other;
}
