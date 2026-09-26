"use client";

import { ArrowLeft, Filter, Lightbulb, UserRound } from "lucide-react";
import { useMemo } from "react";
import { useReport } from "@/context/ReportContext";
import { fmtInt, fmtMoney, fmtMoneyFull, fmtPct } from "@/lib/format";
import { accountRiskDrivers, readAssumptions } from "@/lib/measures";
import { RISK_COLORS } from "@/lib/theme";
import type { Customer } from "@/lib/types";
import { expectedSave, RiskPill, TierDot } from "../visuals/plannerVisuals";
import { KpiCard } from "../visuals/primitives";

/** Semicircular gauge (Power BI "Gauge" visual) for churn probability. */
function Gauge({ value, color }: { value: number; color: string }) {
  const r = 70;
  const circumference = Math.PI * r;
  return (
    <svg viewBox="0 0 180 104" className="h-[120px] w-full max-w-[220px]">
      <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="#EDEBE9" strokeWidth={18} />
      <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke={color} strokeWidth={18} strokeDasharray={`${circumference * value} ${circumference}`} />
      <text x="90" y="82" textAnchor="middle" fontSize="24" fontWeight="600" fill="#252423">{fmtPct(value, 0)}</text>
      <text x="20" y="102" textAnchor="middle" fontSize="9" fill="#605E5C">0%</text>
      <text x="160" y="102" textAnchor="middle" fontSize="9" fill="#605E5C">100%</text>
    </svg>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[4px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.08)] ${className}`}>
      <h2 className="mb-2 text-[14px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const avg = (rows: Customer[], f: (c: Customer) => number) => (rows.length ? rows.reduce((a, c) => a + f(c), 0) / rows.length : 0);

export function CustomerDrillthrough() {
  const { drillCustomer: c, drillBack, data } = useReport();

  const benchmarks = useMemo(() => {
    const all = data!.customers;
    const retained = all.filter((x) => x.churned === 0);
    const churned = all.filter((x) => x.churned === 1);
    const metrics: { label: string; get: (x: Customer) => number; fmt: (v: number) => string }[] = [
      { label: "Age", get: (x) => x.age, fmt: (v) => v.toFixed(1) },
      { label: "Account balance", get: (x) => x.balance, fmt: (v) => fmtMoney(v) },
      { label: "Active member", get: (x) => x.isActive, fmt: (v) => fmtPct(v, 0) },
      { label: "Credit score", get: (x) => x.creditScore, fmt: (v) => v.toFixed(0) },
      { label: "Satisfaction score", get: (x) => x.satisfaction, fmt: (v) => v.toFixed(1) },
    ];
    return metrics.map((m) => ({ ...m, retained: avg(retained, m.get), churned: avg(churned, m.get) }));
  }, [data]);

  if (!c) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-[4px] bg-white p-6 text-center text-[13px] text-pbi-ink2">
        Select an account in the <b>High-LTV At-Risk Accounts</b> table to drill through.
      </div>
    );
  }

  const drivers = accountRiskDrivers(c);
  const expectedSaved = expectedSave(c, readAssumptions(data!.model.assumptions));
  const risk = RISK_COLORS[c.riskTier];

  return (
    <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 rounded-[2px] bg-pbi-page p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 rounded-[4px] bg-pbi-dark px-4 py-3 text-white">
        <button onClick={drillBack} title="Back" className="grid h-8 w-8 place-items-center rounded-full border border-white/40 hover:bg-white/10">
          <ArrowLeft size={16} />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-white/15">
          <UserRound size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold leading-tight">Customer Drill-through · {c.id}</h1>
          <p className="flex items-center gap-1.5 text-[12px] text-white/70">
            <Filter size={11} /> Drill-through filter: Customers[Customer_ID] is {c.id}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <RiskPill tier={c.riskTier} prob={c.churnProb} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Customer LTV" value={fmtMoney(c.ltv)} accent="#118DFF" reference={`${c.valueTier} value tier`} />
        <KpiCard label="Annual Revenue" value={fmtMoney(c.annualRevenue)} accent="#12239E" reference="NIM + fees + card + payroll flows" />
        <KpiCard label="At-Risk Revenue (12M)" value={fmtMoney(c.atRiskRevenue)} accent="#D9B300" reference="Annual revenue × churn probability" />
        <KpiCard label="Expected Value Saved" value={fmtMoney(expectedSaved)} accent="#107C10" reference={`If "${c.action}" succeeds`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Panel title="Customer profile" className="lg:col-span-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            {[
              ["Geography", c.geography],
              ["Gender", c.gender],
              ["Age", `${c.age} (${c.ageTier})`],
              ["Tenure", `${c.tenure} yrs (${c.tenureMonths} mo)`],
              ["Card type", c.cardType],
              ["Products held", String(c.products)],
              ["Credit card", c.hasCrCard ? "Yes" : "No"],
              ["Member status", c.isActive ? "Active" : "Inactive"],
              ["Credit score", String(c.creditScore)],
              ["Balance", fmtMoneyFull(c.balance)],
              ["Est. salary", fmtMoneyFull(c.salary)],
              ["Satisfaction", `${c.satisfaction} / 5`],
              ["Loyalty points", fmtInt(c.points)],
              ["Complaint logged", c.complain ? "Yes" : "No"],
              ["Value tier", <TierDot key="t" tier={c.valueTier} />],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[11px] text-pbi-ink2">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Churn probability" className="flex flex-col items-center lg:col-span-3">
          <Gauge value={c.churnProb} color={risk.fg} />
          <div className="mt-1 text-center text-[11px] text-pbi-ink2">
            Out-of-fold {data!.model.propensity_model.algorithm.split(" (")[0].toLowerCase()} score · portfolio base rate {fmtPct(data!.model.propensity_model.base_rate)}
          </div>
          <div className="mt-3 w-full">
            <div className="mb-1 text-[12px] font-semibold">Active risk drivers</div>
            {drivers.length === 0 ? (
              <div className="text-[12px] text-pbi-muted">No flagged drivers</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {drivers.map((d) => (
                  <li key={d} className="flex items-center gap-2 rounded-[2px] bg-[#FDE7E9] px-2 py-1 text-[12px] text-[#A4262C]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#A4262C]" /> {d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel title="Behavioural signals vs. benchmarks" className="lg:col-span-5">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-pbi-ink2">
                <th className="py-1 font-semibold">Signal</th>
                <th className="py-1 text-right font-semibold">This customer</th>
                <th className="py-1 text-right font-semibold">Retained avg</th>
                <th className="py-1 text-right font-semibold">Churned avg</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((b) => {
                const v = b.get(c);
                const closerToChurn = Math.abs(v - b.churned) < Math.abs(v - b.retained);
                return (
                  <tr key={b.label} className="border-t border-pbi-line">
                    <td className="py-1.5">{b.label}</td>
                    <td className={`py-1.5 text-right font-semibold tabular-nums ${closerToChurn ? "text-[#A4262C]" : "text-[#107C10]"}`}>
                      {b.fmt(v)} <span className="text-[10px] font-normal">{closerToChurn ? "▲ churn-like" : "● healthy"}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-pbi-ink2">{b.fmt(b.retained)}</td>
                    <td className="py-1.5 text-right tabular-nums text-pbi-ink2">{b.fmt(b.churned)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 rounded-[4px] border-l-4 border-pbi-gold bg-[#FFFBEA] p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold">
              <Lightbulb size={14} /> Recommended retention action
            </div>
            <div className="text-[14px] font-semibold text-pbi-ink">{c.action}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-pbi-ink2">
              <div>Expected save rate<div className="text-[13px] font-semibold text-pbi-ink">{fmtPct(c.saveRate, 0)}</div></div>
              <div>Action cost<div className="text-[13px] font-semibold text-pbi-ink">{fmtMoneyFull(c.actionCost)}</div></div>
              <div>Net expected value<div className="text-[13px] font-semibold text-pbi-ink">{fmtMoney(expectedSaved - c.actionCost)}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-pbi-ink2">
              Customer is among {fmtInt(data!.customers.filter((x) => x.action === c.action && x.churned === 0).length)} active accounts assigned this action.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
