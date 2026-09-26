"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CircleAlert, OctagonAlert, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReport, useVisualRows } from "@/context/ReportContext";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { ltvUplift, readAssumptions, type LtvAssumptions, type WhatIfResult } from "@/lib/measures";
import { AXIS_TICK, CATEGORICAL, PBI, RISK_COLORS, SERIES_COLORS } from "@/lib/theme";
import type { Customer, RiskTier, ValueTier } from "@/lib/types";
import { Legend, PbiTooltip } from "./primitives";
import { VisualContainer } from "./VisualContainer";

// ---------------------------------------------------------------------------
// What-if parameter slicer (single value slider + numeric box)
// ---------------------------------------------------------------------------
export function WhatIfSlider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="py-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-pbi-ink">{label}</span>
        <span className="min-w-[52px] rounded-[2px] border border-pbi-line px-1.5 py-0.5 text-right text-[12px] tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="pbi-range"
        style={{ ["--pct" as string]: `${pct}%` }}
        aria-label={label}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scenario charts
// ---------------------------------------------------------------------------
export function ScenarioByTier({ result, className }: { result: WhatIfResult; className?: string }) {
  const data = result.tiers.map((t) => ({ tier: t.tier, Baseline: t.baselineAtRisk, Scenario: t.scenarioAtRisk, saved: t.savedRevenue, targeted: t.targeted }));
  return (
    <VisualContainer
      id="scenario-tier"
      className={className}
      title="At-Risk Revenue · Baseline vs. Scenario"
      subtitle="By customer value tier, after the simulated retention programme"
      fields={["Scores[Value_Tier]", "[At-Risk Revenue]", "[Scenario At-Risk Revenue]"]}
      tableRows={() => data.map((d) => ({ Tier: d.tier, Baseline: Math.round(d.Baseline), Scenario: Math.round(d.Scenario), Saved: Math.round(d.saved), "Accounts targeted": d.targeted }))}
    >
      <div className="flex h-full flex-col">
        <div className="px-1 pb-1">
          <Legend items={[{ label: "Baseline", color: CATEGORICAL[1] }, { label: "Scenario", color: CATEGORICAL[0] }]} />
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} margin={{ top: 18, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={PBI.grid} />
              <XAxis dataKey="tier" tick={AXIS_TICK} axisLine={{ stroke: PBI.grid }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => fmtMoney(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <PbiTooltip
                      title={`${d.tier} tier`}
                      rows={[
                        { label: "Baseline at-risk", value: fmtMoney(d.Baseline), color: CATEGORICAL[1] },
                        { label: "Scenario at-risk", value: fmtMoney(d.Scenario), color: CATEGORICAL[0] },
                        { label: "Revenue saved", value: fmtMoney(d.saved) },
                        { label: "Accounts targeted", value: fmtInt(d.targeted) },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="Baseline" fill={CATEGORICAL[1]} radius={[3, 3, 0, 0]} maxBarSize={34} />
              <Bar dataKey="Scenario" fill={CATEGORICAL[0]} radius={[3, 3, 0, 0]} maxBarSize={34}>
                <LabelList dataKey="saved" position="top" style={{ fontSize: 10, fill: PBI.text }} formatter={(v: unknown) => (Number(v) > 0 ? `−${fmtMoney(Number(v))}` : "")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VisualContainer>
  );
}

export function SavedByAction({ result, className }: { result: WhatIfResult; className?: string }) {
  const data = result.byAction;
  return (
    <VisualContainer
      id="saved-by-action"
      className={className}
      title="Revenue Saved by Retention Action"
      subtitle="Next-best-action assigned by the analytics engine"
      fields={["Scores[Recommended_Action]", "[Scenario Revenue Saved]"]}
      tableRows={() => data.map((d) => ({ Action: d.action, Accounts: d.accounts, "Revenue saved": Math.round(d.savedRevenue) }))}
    >
      {data.length === 0 ? (
        <div className="grid h-full place-items-center text-[12px] text-pbi-muted">Raise a churn-reduction slider to simulate savings</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 0 }} barCategoryGap="18%">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="action" width={210} tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return <PbiTooltip title={d.action} rows={[{ label: "Revenue saved", value: fmtMoney(d.savedRevenue) }, { label: "Accounts", value: fmtInt(d.accounts) }]} />;
              }}
            />
            <Bar dataKey="savedRevenue" fill={CATEGORICAL[0]} radius={[0, 3, 3, 0]} maxBarSize={18}>
              <LabelList dataKey="savedRevenue" position="right" style={{ fontSize: 10, fill: PBI.text }} formatter={(v: unknown) => fmtMoney(Number(v))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Risk pill (status colour + icon + label - never colour alone)
// ---------------------------------------------------------------------------
const RISK_ICON: Record<RiskTier, typeof ShieldCheck> = {
  Low: ShieldCheck,
  Medium: CircleAlert,
  High: TriangleAlert,
  Critical: OctagonAlert,
  Churned: CircleAlert,
};

export function RiskPill({ tier, prob }: { tier: RiskTier; prob?: number }) {
  const Icon = RISK_ICON[tier];
  const c = RISK_COLORS[tier];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: c.fg, background: c.bg }}>
      <Icon size={11} strokeWidth={2.2} />
      {tier}
      {prob !== undefined && <span className="font-normal tabular-nums">· {fmtPct(prob, 0)}</span>}
    </span>
  );
}

export function TierDot({ tier }: { tier: ValueTier }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[tier] }} />
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Drill-through table of high-LTV at-risk accounts
// ---------------------------------------------------------------------------
type SortKey = "priority" | "ltv" | "churnProb" | "atRiskRevenue" | "balance" | "balanceChange";

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: null, label: "Customer" },
  { key: null, label: "Segment" },
  { key: null, label: "Value tier" },
  { key: "ltv", label: "LTV", align: "right" },
  { key: "churnProb", label: "Churn risk" },
  { key: "atRiskRevenue", label: "At-risk rev.", align: "right" },
  { key: "balance", label: "Balance", align: "right" },
  { key: "balanceChange", label: "90d Δ bal.", align: "right" },
  { key: null, label: "Recommended retention action" },
  { key: "priority", label: "Expected value saved", align: "right" },
];

/** Expected LTV uplift if the recommended action lands at its expected save rate. */
export const expectedSave = (c: Customer, a: LtvAssumptions) => ltvUplift(c, c.saveRate, a);

export function AtRiskAccountsTable({ className }: { className?: string }) {
  const id = "at-risk-table";
  const rows = useVisualRows(id);
  const { whatIf, drillThrough, data } = useReport();
  const assumptions = useMemo(() => readAssumptions(data!.model.assumptions), [data]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "priority", dir: -1 });
  const [q, setQ] = useState("");

  const accounts = useMemo(() => {
    const get = (c: Customer): number => (sort.key === "priority" ? expectedSave(c, assumptions) : c[sort.key]);
    const query = q.trim().toLowerCase();
    return rows
      .filter((c) => c.churned === 0 && c.churnProb >= whatIf.threshold && (c.valueTier === "Platinum" || c.valueTier === "Gold" || c.valueTier === "Silver"))
      .filter((c) => !query || c.id.toLowerCase().includes(query) || c.action.toLowerCase().includes(query) || c.geography.toLowerCase().includes(query))
      .sort((a, b) => (get(a) - get(b)) * sort.dir);
  }, [rows, whatIf.threshold, sort, q, assumptions]);

  const shown = accounts.slice(0, 200);
  const maxLtv = Math.max(1, ...shown.map((c) => c.ltv));
  const totalSave = accounts.reduce((a, c) => a + expectedSave(c, assumptions), 0);

  return (
    <VisualContainer
      id={id}
      className={className}
      title="High-LTV At-Risk Accounts · Drill-through"
      subtitle={
        <>
          Silver+ value tiers with churn probability ≥ {fmtPct(whatIf.threshold, 0)} · <b>{fmtInt(accounts.length)}</b> accounts · expected value saved <b>{fmtMoney(totalSave)}</b> · click a row to drill through
        </>
      }
      fields={["Customers[Customer_ID]", "Scores[Value_Tier]", "Scores[LTV]", "Scores[Churn_Probability]", "Scores[Recommended_Action]"]}
      tableRows={() =>
        accounts.map((c) => ({
          Customer: c.id, Geography: c.geography, Age: c.age, "Value Tier": c.valueTier, LTV: c.ltv, "Churn Probability": c.churnProb, "Risk Tier": c.riskTier,
          "At-Risk Revenue": c.atRiskRevenue, Balance: c.balance, "90d Balance Change": c.balanceChange, Action: c.action, "Expected Value Saved": Math.round(expectedSave(c, assumptions)),
        }))
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-1.5 flex items-center gap-2 px-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex h-7 w-64 items-center gap-1.5 rounded-[2px] border border-pbi-line px-2">
            <Search size={12} className="text-pbi-ink2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, action, country" className="w-full bg-transparent text-[12px] outline-none" />
          </div>
          {accounts.length > shown.length && <span className="text-[11px] text-pbi-muted">Showing top {shown.length} of {fmtInt(accounts.length)}</span>}
        </div>
        <div className="pbi-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (col.key) setSort((s) => ({ key: col.key!, dir: s.key === col.key ? ((-s.dir) as 1 | -1) : -1 }));
                    }}
                    className={`whitespace-nowrap border-b-2 border-pbi-ink px-2 py-1.5 font-semibold ${col.align === "right" ? "text-right" : "text-left"} ${col.key ? "cursor-pointer hover:bg-pbi-hover" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.key && (sort.key === col.key ? sort.dir === -1 ? <ArrowDown size={11} /> : <ArrowUp size={11} /> : <ArrowUpDown size={11} className="text-pbi-muted" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); drillThrough(c); }}
                  className="group/row cursor-pointer border-b border-pbi-line hover:bg-[#DEECF9]"
                  title="Drill through to customer detail"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-[#0F6CBD]">{c.id}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-pbi-ink2">{c.geography} · {c.age} · {c.products} prod.</td>
                  <td className="px-2 py-1.5"><TierDot tier={c.valueTier} /></td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="relative ml-auto h-5 w-[110px]">
                      <span className="absolute inset-y-0.5 right-0 rounded-[2px] bg-[#118DFF]/25" style={{ width: `${(c.ltv / maxLtv) * 100}%` }} />
                      <span className="relative pr-1 leading-5 tabular-nums">{fmtMoney(c.ltv)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><RiskPill tier={c.riskTier} prob={c.churnProb} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(c.atRiskRevenue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(c.balance)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${c.balanceChange < -0.2 ? "font-semibold text-[#A4262C]" : ""}`}>{fmtPct(c.balanceChange, 0)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{c.action}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {fmtMoney(expectedSave(c, assumptions))}
                      <ChevronRight size={12} className="text-pbi-muted opacity-0 group-hover/row:opacity-100" />
                    </span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-pbi-muted">No accounts match the current filters and risk threshold.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </VisualContainer>
  );
}
