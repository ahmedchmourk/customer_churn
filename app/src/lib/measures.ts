/**
 * "DAX" measures.
 *
 * Every function here is the client-side equivalent of a Power BI measure: it is
 * evaluated against whatever rows survive the current filter context, so all
 * visuals respond live to slicers, the filter pane and cross-filtering.
 * Heavy statistics (hypothesis tests, lifelines KM with CIs, the propensity model)
 * are pre-computed by the Python engine and read from model.json.
 */
import { FIELDS, type FieldKey } from "./filters";
import type { Customer, ValueTier } from "./types";

const sum = (rows: Customer[], f: (c: Customer) => number) => rows.reduce((a, c) => a + f(c), 0);
const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

// ---------------------------------------------------------------------------
// KPI measures
// ---------------------------------------------------------------------------
export interface KpiSet {
  customers: number;
  churned: number;
  attritionRate: number;
  lostBalance: number;
  atRiskRevenue: number;
  avgLtv: number;
  lostRevenue: number;
  totalBalance: number;
}

export function kpis(rows: Customer[]): KpiSet {
  const churned = rows.filter((c) => c.churned === 1);
  const active = rows.filter((c) => c.churned === 0);
  return {
    customers: rows.length,
    churned: churned.length,
    attritionRate: safeDiv(churned.length, rows.length),
    lostBalance: sum(churned, (c) => c.balance),
    atRiskRevenue: sum(active, (c) => c.atRiskRevenue),
    avgLtv: safeDiv(sum(active, (c) => c.ltv), active.length),
    lostRevenue: sum(churned, (c) => c.annualRevenue),
    totalBalance: sum(rows, (c) => c.balance),
  };
}

// ---------------------------------------------------------------------------
// Grouped attrition
// ---------------------------------------------------------------------------
export interface GroupRate {
  key: string;
  customers: number;
  churned: number;
  rate: number;
}

export function attritionBy(rows: Customer[], field: FieldKey): GroupRate[] {
  const def = FIELDS[field];
  const acc = new Map<string, { n: number; e: number }>(def.values.map((v) => [v, { n: 0, e: 0 }]));
  for (const c of rows) {
    const g = acc.get(def.get(c));
    if (!g) continue;
    g.n += 1;
    g.e += c.churned;
  }
  return def.values.map((v) => {
    const g = acc.get(v)!;
    return { key: v, customers: g.n, churned: g.e, rate: safeDiv(g.e, g.n) };
  });
}

/** Clustered matrix: attrition % for every Geography x Age Tier cell. */
export function attritionMatrix(rows: Customer[], rowField: FieldKey, seriesField: FieldKey) {
  const rowDef = FIELDS[rowField];
  const seriesDef = FIELDS[seriesField];
  return rowDef.values.map((rv) => {
    const subset = rows.filter((c) => rowDef.get(c) === rv);
    const point: Record<string, string | number> = { key: rv, customers: subset.length };
    for (const g of attritionBy(subset, seriesField)) {
      point[g.key] = g.customers ? g.rate : 0;
      point[`${g.key}__n`] = g.customers;
    }
    return point;
  }).filter((p) => (p.customers as number) > 0 || seriesDef.values.length === 0);
}

// ---------------------------------------------------------------------------
// Kaplan-Meier (product-limit) estimator - used for the filter-aware retention grid
// ---------------------------------------------------------------------------
export function kaplanMeierAt(rows: Customer[], checkpoints: number[], minAtRisk = 15): (number | null)[] {
  if (rows.length === 0) return checkpoints.map(() => null);
  const maxT = rows.reduce((m, c) => Math.max(m, c.tenureMonths), 0);
  const events = new Float64Array(maxT + 1);
  const exits = new Float64Array(maxT + 1);
  for (const c of rows) {
    exits[c.tenureMonths] += 1;
    if (c.churned) events[c.tenureMonths] += 1;
  }
  const out: (number | null)[] = [];
  let atRisk = rows.length;
  let s = 1;
  let t = 0;
  for (const cp of checkpoints) {
    let atRiskAtCp = 0;
    for (; t <= cp && t <= maxT; t++) {
      if (t === cp) atRiskAtCp = atRisk;
      if (atRisk > 0 && events[t] > 0) s *= 1 - events[t] / atRisk;
      atRisk -= exits[t];
    }
    // Only report a survival value while enough customers are still observed.
    out.push(cp <= maxT && atRiskAtCp >= minAtRisk ? s : null);
  }
  return out;
}

export interface RetentionRow {
  segment: string;
  customers: number;
  cells: (number | null)[];
}

/** KM retention after 1..N tenure years for each value of a segment field. */
export function segmentRetention(rows: Customer[], field: FieldKey, years = 10): RetentionRow[] {
  const def = FIELDS[field];
  const checkpoints = Array.from({ length: years }, (_, i) => (i + 1) * 12);
  return def.values
    .map((segment) => {
      const subset = rows.filter((c) => def.get(c) === segment);
      return { segment, customers: subset.length, cells: kaplanMeierAt(subset, checkpoints) };
    })
    .filter((r) => r.customers >= 30 && r.cells.some((v) => v !== null));
}

// ---------------------------------------------------------------------------
// Key influencers (lift analysis with two-proportion z-test)
// ---------------------------------------------------------------------------
export interface InfluencerCondition {
  id: string;
  field: string;
  /** Power BI phrasing: "When {field} {phrase}" */
  phrase: string;
  test: (c: Customer) => boolean;
  /** Drill-down breakdown shown when the influencer is selected. */
  breakdown: { label: string; buckets: { key: string; test: (c: Customer) => boolean }[] };
}

const bucketsFromField = (field: FieldKey) => ({
  label: FIELDS[field].label,
  buckets: FIELDS[field].values.map((v) => ({ key: v, test: (c: Customer) => FIELDS[field].get(c) === v })),
});

const numericBuckets = (label: string, get: (c: Customer) => number, edges: number[], fmt: (v: number) => string) => ({
  label,
  buckets: edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    return { key: `${fmt(lo)} – ${fmt(hi)}`, test: (c: Customer) => get(c) >= lo && get(c) < hi };
  }),
});

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SATISFACTION_BUCKETS = bucketsFromField("satisfaction");
const POINTS_BUCKETS = numericBuckets("Loyalty Points", (c) => c.points, [0, 300, 500, 700, 900, 1001], (v) => String(Math.min(v, 1000)));
const SALARY_BUCKETS = numericBuckets("Estimated Salary", (c) => c.salary, [0, 50_000, 100_000, 150_000, 1e9], (v) => (v >= 1e9 ? "∞" : `$${v / 1000}K`));
const TENURE_BUCKETS = numericBuckets("Tenure (Years)", (c) => c.tenure, [0, 2, 4, 6, 8, 11], (v) => String(v));
const CREDIT_BUCKETS = numericBuckets("Credit Score", (c) => c.creditScore, [350, 500, 580, 670, 740, 851], (v) => String(Math.min(v, 850)));
const BALANCE_BUCKETS = numericBuckets("Balance", (c) => c.balance, [0, 1, 50_000, 100_000, 150_000, 1e9], (v) => (v >= 1e9 ? "∞" : v === 1 ? "$0+" : `$${v / 1000}K`));

export const INFLUENCER_CONDITIONS: InfluencerCondition[] = [
  ...(["France", "Germany", "Spain"] as const).map((g) => ({
    id: `geo-${g}`, field: "Geography", phrase: `is ${g}`, test: (c: Customer) => c.geography === g, breakdown: bucketsFromField("geography"),
  })),
  ...(["Female", "Male"] as const).map((g) => ({
    id: `gender-${g}`, field: "Gender", phrase: `is ${g}`, test: (c: Customer) => c.gender === g, breakdown: bucketsFromField("gender"),
  })),
  ...(["18-29", "30-39", "40-49", "50-59", "60+"] as const).map((t) => ({
    id: `age-${t}`, field: "Age Tier", phrase: `is ${t}`, test: (c: Customer) => c.ageTier === t, breakdown: bucketsFromField("ageTier"),
  })),
  { id: "inactive", field: "IsActiveMember", phrase: "is Inactive", test: (c) => c.isActive === 0, breakdown: bucketsFromField("memberStatus") },
  { id: "prod-1", field: "NumOfProducts", phrase: "is 1", test: (c) => c.products === 1, breakdown: bucketsFromField("products") },
  { id: "prod-3", field: "NumOfProducts", phrase: "is 3 or more", test: (c) => c.products >= 3, breakdown: bucketsFromField("products") },
  { id: "midbal", field: "Balance", phrase: "is $100K–$150K", test: (c) => c.balance >= 100_000 && c.balance < 150_000, breakdown: BALANCE_BUCKETS },
  { id: "lowsat", field: "Satisfaction Score", phrase: "is 2 or less", test: (c) => c.satisfaction <= 2, breakdown: SATISFACTION_BUCKETS },
  ...(["Silver", "Gold", "Platinum", "Diamond"] as const).map((t) => ({
    id: `card-${t}`, field: "Card Type", phrase: `is ${t}`, test: (c: Customer) => c.cardType === t, breakdown: bucketsFromField("cardType"),
  })),
  { id: "lowpoints", field: "Loyalty Points", phrase: "is less than 400", test: (c) => c.points < 400, breakdown: POINTS_BUCKETS },
  { id: "lowsalary", field: "Estimated Salary", phrase: "is less than $50K", test: (c) => c.salary < 50_000, breakdown: SALARY_BUCKETS },
  { id: "tenure", field: "Tenure", phrase: "is 2 years or less", test: (c) => c.tenure <= 2, breakdown: TENURE_BUCKETS },
  { id: "credit", field: "Credit Score", phrase: "is less than 580", test: (c) => c.creditScore < 580, breakdown: CREDIT_BUCKETS },
  { id: "zerobal", field: "Balance", phrase: "is 0", test: (c) => c.balance === 0, breakdown: BALANCE_BUCKETS },
  { id: "highbal", field: "Balance", phrase: "is more than $100K", test: (c) => c.balance > 100_000, breakdown: BALANCE_BUCKETS },
];

/** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export interface Influencer {
  condition: InfluencerCondition;
  lift: number;
  rateIn: number;
  rateOut: number;
  nIn: number;
  share: number;
  pValue: number;
}

export function keyInfluencers(rows: Customer[], minCount = 30): Influencer[] {
  const n = rows.length;
  const totalEvents = sum(rows, (c) => c.churned);
  const out: Influencer[] = [];
  for (const condition of INFLUENCER_CONDITIONS) {
    let nIn = 0;
    let eIn = 0;
    for (const c of rows) if (condition.test(c)) { nIn++; eIn += c.churned; }
    const nOut = n - nIn;
    if (nIn < minCount || nOut < minCount) continue;
    const rateIn = eIn / nIn;
    const rateOut = (totalEvents - eIn) / nOut;
    const pooled = totalEvents / n;
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / nIn + 1 / nOut));
    const z = se > 0 ? (rateIn - rateOut) / se : 0;
    const pValue = 2 * (1 - normCdf(Math.abs(z)));
    if (rateOut <= 0 || rateIn <= rateOut || pValue >= 0.05) continue;
    out.push({ condition, lift: rateIn / rateOut, rateIn, rateOut, nIn, share: nIn / n, pValue });
  }
  // Power BI shows one influencer per value; de-duplicate by field keeping the strongest.
  const byField = new Map<string, Influencer>();
  for (const inf of out.sort((a, b) => b.lift - a.lift)) {
    const key = `${inf.condition.field}|${inf.condition.phrase}`;
    if (!byField.has(key)) byField.set(key, inf);
  }
  return Array.from(byField.values()).slice(0, 10);
}

export interface Segment {
  id: string;
  conditions: InfluencerCondition[];
  rate: number;
  n: number;
  share: number;
}

/** "Top segments" tab: best two-condition combinations by attrition rate. */
export function topSegments(rows: Customer[], influencers: Influencer[], minCount = 60): Segment[] {
  const conds = influencers.map((i) => i.condition);
  const segs: Segment[] = [];
  for (let i = 0; i < conds.length; i++) {
    for (let j = i + 1; j < conds.length; j++) {
      if (conds[i].field === conds[j].field) continue;
      let n = 0;
      let e = 0;
      for (const c of rows) if (conds[i].test(c) && conds[j].test(c)) { n++; e += c.churned; }
      if (n < minCount) continue;
      segs.push({ id: `${conds[i].id}+${conds[j].id}`, conditions: [conds[i], conds[j]], rate: e / n, n, share: n / rows.length });
    }
  }
  return segs.sort((a, b) => b.rate - a.rate).slice(0, 6);
}

export function breakdownRates(rows: Customer[], condition: InfluencerCondition) {
  return condition.breakdown.buckets.map((b) => {
    let n = 0;
    let e = 0;
    for (const c of rows) if (b.test(c)) { n++; e += c.churned; }
    return { key: b.key, rate: safeDiv(e, n), n };
  });
}

// ---------------------------------------------------------------------------
// Scatter sample & Pareto
// ---------------------------------------------------------------------------
/** Deterministic stride sample - keeps the scatter stable across re-renders. */
export function strideSample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  return Array.from({ length: max }, (_, i) => rows[Math.floor(i * step)]);
}

export interface ParetoBucket {
  bucket: string;
  share: number;
  cumulative: number;
  revenue: number;
  accounts: number;
}

/** Revenue-loss concentration across churned accounts, in 5% account buckets. */
export function paretoLoss(rows: Customer[], buckets = 20): { data: ParetoBucket[]; top20Share: number; total: number } {
  const lost = rows.filter((c) => c.churned === 1).map((c) => c.annualRevenue).sort((a, b) => b - a);
  const total = lost.reduce((a, b) => a + b, 0);
  if (lost.length === 0 || total === 0) return { data: [], top20Share: 0, total: 0 };
  const data: ParetoBucket[] = [];
  let cumulative = 0;
  for (let i = 0; i < buckets; i++) {
    const slice = lost.slice(Math.floor((i * lost.length) / buckets), Math.floor(((i + 1) * lost.length) / buckets));
    const revenue = slice.reduce((a, b) => a + b, 0);
    cumulative += revenue;
    data.push({
      bucket: `${(i + 1) * (100 / buckets)}%`,
      share: revenue / total,
      cumulative: cumulative / total,
      revenue,
      accounts: slice.length,
    });
  }
  const top20 = lost.slice(0, Math.ceil(lost.length * 0.2)).reduce((a, b) => a + b, 0);
  return { data, top20Share: top20 / total, total };
}

// ---------------------------------------------------------------------------
// What-if retention simulation
// ---------------------------------------------------------------------------
export const VALUE_TIERS: ValueTier[] = ["Platinum", "Gold", "Silver", "Bronze"];

/** Financial assumptions published by the engine (model.json -> assumptions). */
export interface LtvAssumptions {
  contribution_margin: number;
  discount_rate: number;
  max_retention: number;
}

export function readAssumptions(a: Record<string, unknown>): LtvAssumptions {
  return {
    contribution_margin: Number(a.contribution_margin ?? 0.62),
    discount_rate: Number(a.discount_rate ?? 0.1),
    max_retention: Number(a.max_retention ?? 0.97),
  };
}

/** Same formula as the Python engine: LTV = m * r / (1 + d - r), r = 1 - p. */
export function ltvAt(c: Customer, churnProb: number, a: LtvAssumptions): number {
  const r = Math.min(a.max_retention, Math.max(0.05, 1 - churnProb));
  return (c.annualRevenue * a.contribution_margin * r) / (1 + a.discount_rate - r);
}

/** LTV uplift if the account's churn probability is cut by `reduction` (relative). */
export function ltvUplift(c: Customer, reduction: number, a: LtvAssumptions): number {
  return ltvAt(c, c.churnProb * (1 - reduction), a) - ltvAt(c, c.churnProb, a);
}

export interface WhatIfParams {
  reduction: Record<ValueTier, number>; // 0..1 relative reduction in churn probability
  threshold: number; // minimum churn probability to be targeted
}

export interface WhatIfTierResult {
  tier: ValueTier;
  targeted: number;
  baselineAtRisk: number;
  scenarioAtRisk: number;
  savedRevenue: number;
  ltvPreserved: number;
  cost: number;
}

export interface WhatIfResult {
  tiers: WhatIfTierResult[];
  byAction: { action: string; savedRevenue: number; accounts: number }[];
  totals: { targeted: number; savedRevenue: number; ltvPreserved: number; cost: number; roi: number; baselineAtRisk: number };
}

export function simulateWhatIf(rows: Customer[], params: WhatIfParams, assumptions: LtvAssumptions): WhatIfResult {
  const active = rows.filter((c) => c.churned === 0);
  const actionMap = new Map<string, { savedRevenue: number; accounts: number }>();
  const tiers = VALUE_TIERS.map((tier): WhatIfTierResult => {
    const inTier = active.filter((c) => c.valueTier === tier);
    const r = params.reduction[tier];
    const baselineAtRisk = sum(inTier, (c) => c.atRiskRevenue);
    let saved = 0;
    let ltvPreserved = 0;
    let cost = 0;
    let targeted = 0;
    if (r > 0) {
      for (const c of inTier) {
        if (c.churnProb < params.threshold) continue;
        targeted++;
        const s = c.atRiskRevenue * r;
        saved += s;
        ltvPreserved += ltvUplift(c, r, assumptions);
        cost += c.actionCost;
        const a = actionMap.get(c.action) ?? { savedRevenue: 0, accounts: 0 };
        a.savedRevenue += s;
        a.accounts += 1;
        actionMap.set(c.action, a);
      }
    }
    return { tier, targeted, baselineAtRisk, scenarioAtRisk: baselineAtRisk - saved, savedRevenue: saved, ltvPreserved, cost };
  });
  const t = tiers.reduce(
    (a, x) => ({
      targeted: a.targeted + x.targeted,
      savedRevenue: a.savedRevenue + x.savedRevenue,
      ltvPreserved: a.ltvPreserved + x.ltvPreserved,
      cost: a.cost + x.cost,
      baselineAtRisk: a.baselineAtRisk + x.baselineAtRisk,
    }),
    { targeted: 0, savedRevenue: 0, ltvPreserved: 0, cost: 0, baselineAtRisk: 0 },
  );
  return {
    tiers,
    byAction: Array.from(actionMap, ([action, v]) => ({ action, ...v })).sort((a, b) => b.savedRevenue - a.savedRevenue),
    totals: { ...t, roi: safeDiv(t.ltvPreserved - t.cost, t.cost) },
  };
}

/** Which influencer conditions apply to a single account - used on the drill-through page. */
const ACCOUNT_DRIVER_IDS = new Set([
  "inactive", "prod-1", "prod-3", "midbal", "lowsat", "tenure", "credit", "geo-Germany", "gender-Female", "age-40-49", "age-50-59", "age-60+",
]);

export function accountRiskDrivers(c: Customer): string[] {
  return INFLUENCER_CONDITIONS.filter((k) => ACCOUNT_DRIVER_IDS.has(k.id) && k.test(c)).map((k) => `${k.field} ${k.phrase}`);
}
