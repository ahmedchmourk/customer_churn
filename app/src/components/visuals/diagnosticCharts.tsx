"use client";

import { Check, ChevronDown, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useReport, useVisualRows } from "@/context/ReportContext";
import { fmtInt, fmtMoney, fmtP, fmtPct } from "@/lib/format";
import { breakdownRates, keyInfluencers, paretoLoss, strideSample, topSegments, type Influencer } from "@/lib/measures";
import { AXIS_TICK, CATEGORICAL, PBI, SERIES_COLORS } from "@/lib/theme";
import type { Customer } from "@/lib/types";
import { Legend, PbiTooltip } from "./primitives";
import { VisualContainer } from "./VisualContainer";

const pctTick = (v: number) => `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------------------
// Key influencers (simulated Power BI AI visual)
// ---------------------------------------------------------------------------
export function KeyInfluencers({ className }: { className?: string }) {
  const id = "key-influencers";
  const rows = useVisualRows(id);
  const [tab, setTab] = useState<"influencers" | "segments">("influencers");
  const influencers = useMemo(() => keyInfluencers(rows), [rows]);
  const segments = useMemo(() => topSegments(rows, influencers), [rows, influencers]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const selected: Influencer | undefined = influencers.find((i) => i.condition.id === selectedId) ?? influencers[0];
  const segment = segments.find((s) => s.id === segmentId) ?? segments[0];
  const overall = rows.length ? rows.reduce((a, c) => a + c.churned, 0) / rows.length : 0;
  const maxLift = Math.max(2, ...influencers.map((i) => i.lift));

  const breakdown = useMemo(() => (selected ? breakdownRates(rows, selected.condition) : []), [rows, selected]);

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Key Influencers"
      subtitle="What influences Exited to be Yes · lift vs. all other customers, two-proportion z-test (p < 0.05) · Complain excluded (target leakage)"
      fields={["Customers[Exited]", "Customers[Age_Tier]", "Customers[NumOfProducts]", "Customers[IsActiveMember]", "Customers[Geography]", "Customers[Gender]", "Customers[Balance]"]}
      tableRows={() =>
        influencers.map((i) => ({
          Influencer: `${i.condition.field} ${i.condition.phrase}`,
          Lift: Number(i.lift.toFixed(3)),
          "Churn rate (in)": Number(i.rateIn.toFixed(4)),
          "Churn rate (rest)": Number(i.rateOut.toFixed(4)),
          Customers: i.nIn,
          "p-value": Number(i.pValue.toExponential(3)),
        }))
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-[12px]">
          <span className="text-pbi-ink2">What influences</span>
          <span className="flex items-center gap-1 rounded-[2px] border border-pbi-line px-2 py-0.5 font-semibold">Exited <ChevronDown size={11} /></span>
          <span className="text-pbi-ink2">to be</span>
          <span className="flex items-center gap-1 rounded-[2px] border border-pbi-line px-2 py-0.5 font-semibold">Yes <ChevronDown size={11} /></span>
          <div className="ml-auto flex overflow-hidden rounded-[2px] border border-pbi-line">
            {(["influencers", "segments"] as const).map((t) => (
              <button
                key={t}
                onClick={(e) => { e.stopPropagation(); setTab(t); }}
                className={`px-3 py-1 ${tab === t ? "bg-pbi-dark font-semibold text-white" : "hover:bg-pbi-hover"}`}
              >
                {t === "influencers" ? "Key influencers" : "Top segments"}
              </button>
            ))}
          </div>
        </div>

        {tab === "influencers" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="pbi-scroll flex min-h-0 flex-col overflow-y-auto border-pbi-line md:border-r md:pr-2">
              <div className="flex justify-between px-1 pb-1 text-[11px] text-pbi-ink2">
                <span>When…</span>
                <span>…the likelihood of churn increases by</span>
              </div>
              {influencers.length === 0 && <div className="p-4 text-[12px] text-pbi-muted">No statistically significant influencers in the current filter context.</div>}
              {influencers.map((inf) => {
                const on = inf.condition.id === selected?.condition.id;
                return (
                  <button
                    key={inf.condition.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(inf.condition.id); }}
                    className={`flex items-center gap-2 border-b border-pbi-line px-2 py-1.5 text-left text-[12px] ${on ? "bg-[#DEECF9]" : "hover:bg-pbi-hover"}`}
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className="text-pbi-ink2">When </span>
                      <b>{inf.condition.field}</b> {inf.condition.phrase}
                    </span>
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-pbi-hover sm:block">
                      <span className="block h-full rounded-full bg-[#118DFF]" style={{ width: `${(inf.lift / maxLift) * 100}%` }} />
                    </span>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#118DFF] bg-white text-[11px] font-bold tabular-nums">
                      {inf.lift.toFixed(2)}x
                    </span>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="flex min-h-0 flex-col">
                <div className="px-1 text-[12px] leading-snug">
                  <b>Churn</b> is <b>{selected.lift.toFixed(2)}x</b> more likely when <b>{selected.condition.field}</b> {selected.condition.phrase}
                </div>
                <div className="px-1 pb-1 text-[11px] text-pbi-ink2">
                  {fmtPct(selected.rateIn)} churn in segment vs {fmtPct(selected.rateOut)} elsewhere · {fmtInt(selected.nIn)} customers ({fmtPct(selected.share)}) · p {fmtP(selected.pValue)}
                </div>
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdown} layout="vertical" margin={{ top: 6, right: 44, left: 4, bottom: 4 }} barCategoryGap="20%">
                      <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, overall) * 1.1]} />
                      <YAxis type="category" dataKey="key" tick={AXIS_TICK} axisLine={false} tickLine={false} width={96} />
                      <ReferenceLine x={overall} stroke={PBI.textSecondary} strokeDasharray="4 3" label={{ value: `Avg ${fmtPct(overall)}`, position: "top", fontSize: 10, fill: PBI.textSecondary }} />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof breakdown)[number];
                          return <PbiTooltip title={`${selected.condition.breakdown.label}: ${d.key}`} rows={[{ label: "Churn rate", value: fmtPct(d.rate) }, { label: "Customers", value: fmtInt(d.n) }]} />;
                        }}
                      />
                      <Bar dataKey="rate" radius={[0, 3, 3, 0]} maxBarSize={20}>
                        {breakdown.map((b) => (
                          <Cell key={b.key} fill={b.rate > overall ? "#12239E" : "#9FC9F5"} />
                        ))}
                        <LabelList dataKey="rate" position="right" style={{ fontSize: 10, fill: PBI.text }} formatter={(v: unknown) => fmtPct(Number(v))} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="grid content-start grid-cols-3 gap-2 overflow-y-auto p-1">
              {segments.map((s, i) => {
                const on = s.id === segment?.id;
                const size = 46 + Math.min(30, s.share * 300);
                return (
                  <button
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); setSegmentId(s.id); }}
                    className={`flex flex-col items-center gap-1 rounded-[3px] p-2 ${on ? "bg-[#DEECF9]" : "hover:bg-pbi-hover"}`}
                  >
                    <span
                      className="grid place-items-center rounded-full text-[12px] font-bold text-white"
                      style={{ width: size, height: size, background: CATEGORICAL[1] }}
                    >
                      {fmtPct(s.rate, 0)}
                    </span>
                    <span className="text-[11px] text-pbi-ink2">Segment {i + 1}</span>
                  </button>
                );
              })}
              {segments.length === 0 && <div className="col-span-3 p-4 text-[12px] text-pbi-muted">Not enough data for segments.</div>}
            </div>
            {segment && (
              <div className="flex flex-col gap-2 px-1 text-[12px]">
                <div>
                  When <b>Exited</b> is Yes, <b>{fmtPct(segment.rate)}</b> of customers in this segment churned — <b>{(segment.rate / (overall || 1)).toFixed(1)}x</b> the average of {fmtPct(overall)}.
                </div>
                <div className="rounded-[3px] border border-pbi-line p-2">
                  <div className="mb-1 text-[11px] font-semibold text-pbi-ink2">Segment definition</div>
                  {segment.conditions.map((c) => (
                    <div key={c.id} className="py-0.5">
                      <b>{c.field}</b> {c.phrase}
                    </div>
                  ))}
                </div>
                <div className="text-pbi-ink2">
                  {fmtInt(segment.n)} customers · {fmtPct(segment.share)} of the data in context
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Kaplan-Meier survival curves (lifelines output from model.json)
// ---------------------------------------------------------------------------
export function SurvivalCurves({ className }: { className?: string }) {
  const { data } = useReport();
  const survival = data!.model.survival;
  const segmentNames = Object.keys(survival);
  const [segment, setSegment] = useState("Active Status");
  const seg = survival[segment];
  const showCi = seg.curves.length <= 3;

  const chartData = useMemo(() => {
    const byT = new Map<number, Record<string, number | number[]>>();
    for (const curve of seg.curves) {
      for (const p of curve.points) {
        const row = byT.get(p.t) ?? { t: p.t };
        row[curve.label] = p.s;
        row[`${curve.label}__ci`] = [p.lo, p.hi];
        byT.set(p.t, row);
      }
    }
    return Array.from(byT.values());
  }, [seg]);

  const colorFor = (label: string, i: number) => SERIES_COLORS[label] ?? (label === "Active" ? CATEGORICAL[0] : label === "Inactive" ? CATEGORICAL[2] : CATEGORICAL[i % CATEGORICAL.length]);

  return (
    <VisualContainer
      id="km-survival"
      className={className}
      title="Retention Velocity · Kaplan-Meier Survival"
      subtitle={
        <>
          lifelines KaplanMeierFitter, 95% CI{seg.logrank_p !== null ? <> · log-rank p <b>{fmtP(seg.logrank_p)}</b></> : null} · engine output (not filter-aware)
        </>
      }
      fields={["Customers[Tenure_Months]", "Customers[Exited]", `Segment: ${segment}`]}
      tableRows={() =>
        seg.curves.map((c) => ({
          Segment: c.label,
          Customers: c.n,
          Churned: c.events,
          "Retention 12M": c.retention_12m,
          "Retention 36M": c.retention_36m,
          "Retention 60M": c.retention_60m,
          "Median survival (months)": c.median_survival_months,
        }))
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-1 flex flex-wrap gap-1 px-1" onClick={(e) => e.stopPropagation()}>
          {segmentNames.map((s) => (
            <button key={s} onClick={() => setSegment(s)} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${s === segment ? "border-pbi-dark bg-pbi-dark text-white" : "border-pbi-line hover:bg-pbi-hover"}`}>
              {s}
            </button>
          ))}
        </div>
        {seg.curves.length > 1 && (
          <div className="px-1 pb-1">
            <Legend items={seg.curves.map((c, i) => ({ label: `${c.label} (12M ${fmtPct(c.retention_12m, 0)} · 60M ${fmtPct(c.retention_60m, 0)})`, color: colorFor(c.label, i) }))} />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={PBI.grid} />
              <XAxis dataKey="t" type="number" domain={[0, 120]} ticks={[0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: PBI.grid }} label={{ value: "Tenure (months)", position: "insideBottomRight", offset: -2, fontSize: 10, fill: PBI.textSecondary }} />
              <YAxis domain={[0, 1]} tickFormatter={pctTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <PbiTooltip
                      title={`Month ${label}`}
                      rows={payload
                        .filter((p) => !String(p.dataKey).endsWith("__ci"))
                        .map((p, i) => ({ label: String(p.dataKey), value: fmtPct(Number(p.value)), color: colorFor(String(p.dataKey), i) }))}
                    />
                  ) : null
                }
              />
              {showCi &&
                seg.curves.map((c, i) => (
                  <Area key={`${c.label}-ci`} dataKey={`${c.label}__ci`} type="stepAfter" stroke="none" fill={colorFor(c.label, i)} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
                ))}
              {seg.curves.map((c, i) => (
                <Line key={c.label} dataKey={c.label} type="stepAfter" stroke={colorFor(c.label, i)} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Age vs. balance - the two strongest continuous churn drivers in the data
// ---------------------------------------------------------------------------
/** Deterministic jitter so integer ages don't overplot. */
function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.8;
}

const ZONE = { ageMin: 45, ageMax: 65, balanceMin: 50_000 };

export function AgeBalanceScatter({ className }: { className?: string }) {
  const id = "age-balance-scatter";
  const rows = useVisualRows(id);
  const { retained, churned, zoneRate, zoneN } = useMemo(() => {
    const sample = strideSample(rows, 1600).map((c) => ({ x: c.age + jitter(c.id), y: c.balance, c }));
    const inZone = rows.filter((c) => c.age >= ZONE.ageMin && c.age < ZONE.ageMax && c.balance >= ZONE.balanceMin);
    return {
      retained: sample.filter((p) => p.c.churned === 0),
      churned: sample.filter((p) => p.c.churned === 1),
      zoneRate: inZone.length ? inZone.filter((c) => c.churned).length / inZone.length : 0,
      zoneN: inZone.length,
    };
  }, [rows]);

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Churn Concentration · Age vs. Account Balance"
      subtitle={<>Shaded zone (age {ZONE.ageMin}–{ZONE.ageMax - 1}, balance ≥ $50K) churns at <b>{fmtPct(zoneRate, 0)}</b> across {fmtInt(zoneN)} customers · zero-balance accounts sit on the axis</>}
      fields={["Customers[Age]", "Customers[Balance]", "Customers[Exited]"]}
      tableRows={() => [...retained, ...churned].map((p) => ({ Customer: p.c.id, Age: p.c.age, Balance: p.c.balance, Churned: p.c.churned }))}
    >
      <div className="flex h-full flex-col">
        <div className="px-1 pb-1">
          <Legend items={[{ label: "Retained", color: SERIES_COLORS.Retained }, { label: "Churned", color: SERIES_COLORS.Churned }]} />
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={PBI.grid} />
              <ReferenceArea x1={ZONE.ageMin} x2={ZONE.ageMax} y1={ZONE.balanceMin} y2={260_000} fill="#D64550" fillOpacity={0.07} stroke="#D64550" strokeOpacity={0.4} strokeDasharray="4 3" />
              <XAxis type="number" dataKey="x" name="Age" domain={[18, 92]} ticks={[20, 30, 40, 50, 60, 70, 80, 90]} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: PBI.grid }} label={{ value: "Age", position: "insideBottomRight", offset: -2, fontSize: 10, fill: PBI.textSecondary }} />
              <YAxis type="number" dataKey="y" name="Balance" domain={[0, 260_000]} tickFormatter={(v: number) => fmtMoney(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} />
              <ZAxis range={[18, 18]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const c = (payload[0].payload as { c: Customer }).c;
                  return (
                    <PbiTooltip
                      title={`Customer ${c.id}`}
                      rows={[
                        { label: "Status", value: c.churned ? "Churned" : "Retained" },
                        { label: "Age", value: String(c.age) },
                        { label: "Balance", value: fmtMoney(c.balance) },
                        { label: "Products", value: String(c.products) },
                        { label: "Churn probability", value: fmtPct(c.churnProb, 0) },
                      ]}
                    />
                  );
                }}
              />
              <Scatter name="Retained" data={retained} fill={SERIES_COLORS.Retained} fillOpacity={0.4} isAnimationActive={false} />
              <Scatter name="Churned" data={churned} fill={SERIES_COLORS.Churned} fillOpacity={0.7} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// 80/20 Pareto of lost revenue (single percentage axis - no dual axes)
// ---------------------------------------------------------------------------
export function ParetoChart({ className }: { className?: string }) {
  const id = "pareto-loss";
  const rows = useVisualRows(id);
  const { data, top20Share, total } = useMemo(() => paretoLoss(rows), [rows]);

  return (
    <VisualContainer
      id={id}
      className={className}
      title="80/20 Pareto · Lost Revenue Concentration"
      subtitle={<>Churned accounts ranked by annual revenue · top 20% of accounts drive <b>{fmtPct(top20Share, 0)}</b> of {fmtMoney(total)} lost</>}
      fields={["Customers[Customer_ID]", "Revenue[Annual_Revenue]", "[Cumulative % of Lost Revenue]"]}
      tableRows={() => data.map((d) => ({ "Account percentile": d.bucket, Accounts: d.accounts, "Lost revenue": Math.round(d.revenue), "Share of loss": Number(d.share.toFixed(4)), Cumulative: Number(d.cumulative.toFixed(4)) }))}
    >
      <div className="flex h-full flex-col">
        <div className="px-1 pb-1">
          <Legend items={[{ label: "Share of lost revenue (per 5% of accounts)", color: CATEGORICAL[0] }, { label: "Cumulative share", color: CATEGORICAL[2] }]} />
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barCategoryGap="12%">
              <CartesianGrid vertical={false} stroke={PBI.grid} />
              <XAxis dataKey="bucket" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: PBI.grid }} interval={1} />
              <YAxis domain={[0, 1]} tickFormatter={pctTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <ReferenceLine y={0.8} stroke={PBI.textSecondary} strokeDasharray="4 3" label={{ value: "80%", position: "insideTopLeft", fontSize: 10, fill: PBI.textSecondary }} />
              <ReferenceLine x="20%" stroke={PBI.textSecondary} strokeDasharray="4 3" />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <PbiTooltip
                      title={`Top ${d.bucket} of churned accounts`}
                      rows={[
                        { label: "Accounts in bucket", value: fmtInt(d.accounts) },
                        { label: "Lost revenue", value: fmtMoney(d.revenue) },
                        { label: "Share of loss", value: fmtPct(d.share) },
                        { label: "Cumulative", value: fmtPct(d.cumulative) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="share" fill={CATEGORICAL[0]} radius={[3, 3, 0, 0]} />
              <Line dataKey="cumulative" stroke={CATEGORICAL[2]} strokeWidth={2} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Hypothesis testing results (scipy.stats output)
// ---------------------------------------------------------------------------
export function HypothesisTable({ className }: { className?: string }) {
  const { data } = useReport();
  const tests = data!.model.hypothesis_tests;
  const pm = data!.model.propensity_model;
  const maxEffect = Math.max(...tests.map((t) => Math.abs(t.effect_size)));

  return (
    <VisualContainer
      id="hypothesis-tests"
      className={className}
      title="Statistical Hypothesis Testing · Churn Drivers"
      subtitle={`scipy.stats χ² independence & Welch t-tests · Bonferroni-adjusted α = 0.05 · models (5-fold OOF ROC-AUC): ${pm.comparison.map((m) => `${m.model} ${m.roc_auc.toFixed(3)}`).join(" · ")}`}
      fields={["Stats[Driver]", "Stats[Test]", "Stats[Effect_Size]", "Stats[P_Value_Adj]"]}
      tableRows={() =>
        tests.map((t) => ({ Driver: t.label, Test: t.test, Statistic: t.statistic, "Effect size": t.effect_size, Metric: t.effect_metric, "Adj. p-value": t.p_value_adj, Significant: t.significant ? "Yes" : "No" }))
      }
    >
      <div className="pbi-scroll absolute inset-0 overflow-auto px-3 pb-2">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-left">
              {["Driver", "Test", "Statistic", "Effect size", "Churned vs retained", "Adj. p-value", "Result"].map((h) => (
                <th key={h} className="border-b-2 border-pbi-ink px-2 py-1.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.feature} className={`border-b border-pbi-line hover:bg-pbi-hover ${t.leakage ? "bg-[#FFFBEA]" : ""}`}>
                <td className="px-2 py-1.5 font-semibold">{t.label}</td>
                <td className="px-2 py-1.5 text-pbi-ink2">{t.test}{t.dof !== null ? ` (df=${t.dof})` : ""}</td>
                <td className="px-2 py-1.5 tabular-nums">{t.statistic.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="relative h-3.5 w-24 rounded-[2px] bg-pbi-hover">
                      <span className="absolute inset-y-0 left-0 rounded-[2px] bg-[#118DFF]" style={{ width: `${(Math.abs(t.effect_size) / maxEffect) * 100}%` }} />
                    </span>
                    <span className="tabular-nums">{t.effect_size.toFixed(3)}</span>
                    <span className="text-[10px] text-pbi-muted">{t.effect_metric}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 tabular-nums text-pbi-ink2">
                  {t.mean_churned !== undefined && t.mean_retained !== undefined
                    ? `${t.mean_churned.toLocaleString(undefined, { maximumFractionDigits: 2 })} vs ${t.mean_retained.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : t.churn_rate_by_level
                      ? Object.entries(t.churn_rate_by_level).map(([k, v]) => `${k}: ${fmtPct(v, 0)}`).join(" · ")
                      : "—"}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{fmtP(t.p_value_adj)}</td>
                <td className="px-2 py-1.5">
                  {t.leakage ? (
                    <span title="Predicts churn almost perfectly on its own - recorded at/after exit. Excluded from the model." className="inline-flex items-center gap-1 rounded-full bg-[#FFF4CE] px-2 py-0.5 text-[11px] font-semibold text-[#8A6100]"><TriangleAlert size={11} /> Target leakage</span>
                  ) : t.significant ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#DFF6DD] px-2 py-0.5 text-[11px] font-semibold text-[#107C10]"><Check size={11} /> Significant</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-pbi-hover px-2 py-0.5 text-[11px] font-semibold text-pbi-ink2"><X size={11} /> Not significant</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VisualContainer>
  );
}
