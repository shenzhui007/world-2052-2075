// Shared chart state. No DOM initialization.
const graphLabels = [
  "人口",
  "潜在劳动力",
  "劳动生产率",
  "GDP、投资与消费",
  "人均消费",
  "能源使用",
  "能源结构占比",
  "分项能源用量",
  "能源使用的CO₂排放",
  "气候变化",
  "作物生产",
  "非能源生态足迹",
  "总体状况",
  "生产",
  "生活水平",
];
const graphPalette = [
  "#237462",
  "#e58e49",
  "#547eb6",
  "#a27caf",
  "#b09d36",
  "#6b989a",
  "#bd6073",
  "#7e744e",
  "#467997",
  "#886daf",
];
const graphEditableSelection = new Map();
const graphAxisLocks = new Map();
const graphHoverData = new Map();
const graphPinnedYears = new Map();
let graphHoverSequence = 0;
let activeForecastGraph = 1;

// Editable drivers traced through the plotted formula rows, including SUM ranges.
// Graph10 is global; the other drivers belong to the selected region.
const graphAssumptionDrivers = {
  5: [1, 2, 3, 4],
  8: [2, 3, 6, 7],
  9: [2, 3, 6, 7],
  13: [1, 2, 3, 4, 6, 7, 10],
  14: [1, 2, 3, 4, 6, 7, 11, 12],
  15: [1, 2, 3, 4, 6, 10, 11],
};

// Stable selection and axis key for a graph.
function graphInteractionKey(g) {
  return g.series[0]?.sheet + ":" + g.number;
}
