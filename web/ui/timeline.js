const ASOF_YEAR = 2026,
  HORIZON = 2075,
  originalYears = years.slice();
const timelineYears = Array.from({ length: 22 }, (_, i) => 1970 + i * 5);
for (const rows of Object.values(DATA))
  for (const r of rows) {
    const vals = r.values.slice();
    r.values = timelineYears.map((y) => {
      const i = originalYears.indexOf(y);
      return i >= 0 ? vals[i] : null;
    });
  }
years.splice(0, years.length, ...timelineYears);
