/**
 * Power BI default report theme ("Default" / 2023+ colour order) plus the
 * status palette used for risk tiers. Categorical colours follow the entity,
 * never its rank, so a filter that removes a series never repaints the others.
 */
export const PBI = {
  gold: "#F2C811",
  dark: "#252423",
  text: "#252423",
  textSecondary: "#605E5C",
  textMuted: "#8A8886",
  grid: "#E1DFDD",
  canvas: "#EAEAEA",
  page: "#F3F2F1",
  visual: "#FFFFFF",
  selection: "#118DFF",
} as const;

export const CATEGORICAL = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550"];

export const SERIES_COLORS: Record<string, string> = {
  // Geography
  France: CATEGORICAL[0],
  Germany: CATEGORICAL[1],
  Spain: CATEGORICAL[2],
  // Age tiers (fixed order)
  "18-29": CATEGORICAL[0],
  "30-39": CATEGORICAL[1],
  "40-49": CATEGORICAL[2],
  "50-59": CATEGORICAL[3],
  "60+": CATEGORICAL[4],
  // Outcome
  Retained: CATEGORICAL[0],
  Churned: CATEGORICAL[2],
  // Value tiers
  Platinum: CATEGORICAL[1],
  Gold: CATEGORICAL[6],
  Silver: CATEGORICAL[0],
  Bronze: CATEGORICAL[2],
};

/** Reserved status colours - always shipped with an icon + label. */
export const RISK_COLORS: Record<string, { fg: string; bg: string }> = {
  Low: { fg: "#107C10", bg: "#DFF6DD" },
  Medium: { fg: "#8A6100", bg: "#FFF4CE" },
  High: { fg: "#C43E1C", bg: "#FDE7E9" },
  Critical: { fg: "#A4262C", bg: "#FDE7E9" },
  Churned: { fg: "#605E5C", bg: "#EDEBE9" },
};

/** Single-hue sequential ramp (Power BI blue) for heatmaps. */
export function sequentialBlue(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  // Interpolate #EAF4FF (light) -> #0B5CAD (dark) in RGB.
  const a = [0xea, 0xf4, 0xff];
  const b = [0x0b, 0x4f, 0x9c];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * clamp));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const AXIS_TICK = { fontSize: 11, fill: PBI.textSecondary, fontFamily: "Segoe UI, sans-serif" };
