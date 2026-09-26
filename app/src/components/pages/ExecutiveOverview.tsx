"use client";

import { useMemo } from "react";
import { useReport, useVisualRows } from "@/context/ReportContext";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { kpis } from "@/lib/measures";
import { AttritionByTenure, ChurnByGeoAge, RetentionHeatmap, ProductHolding } from "../visuals/overviewCharts";
import { DropdownSlicer, KpiCard, PageHeader, TileSlicer } from "../visuals/primitives";

/** Delta vs. the unfiltered portfolio, phrased the Power BI way. */
function vsPortfolio(value: number, base: number, higherIsBad: boolean, asPoints = false) {
  if (!base) return undefined;
  const diff = asPoints ? (value - base) * 100 : (value / base - 1) * 100;
  if (Math.abs(diff) < 0.05) return undefined;
  const up = diff > 0;
  return { text: `${up ? "+" : ""}${diff.toFixed(1)}${asPoints ? " pts" : "%"} vs portfolio`, up, good: higherIsBad ? !up : up };
}

export function ExecutiveOverview() {
  const { data } = useReport();
  const rows = useVisualRows("kpi-cards");
  const k = useMemo(() => kpis(rows), [rows]);
  const base = useMemo(() => kpis(data!.customers), [data]);
  const filtered = rows.length !== data!.customers.length;

  return (
    <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 rounded-[2px] bg-pbi-page p-3 shadow-sm">
      <PageHeader
        title="Executive Attrition Overview"
        subtitle={`${data!.model.meta.dataset} · ${fmtInt(k.customers)} customers in context`}
        right={
          <div className="text-right text-[11px] text-white/70">
            <div>
              Churned customers <b className="text-[13px] text-white">{fmtInt(k.churned)}</b>
            </div>
            <div>
              Lost annual revenue <b className="text-[13px] text-white">{fmtMoney(k.lostRevenue)}</b>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total Attrition Rate"
          value={fmtPct(k.attritionRate)}
          accent="#D64550"
          delta={filtered ? vsPortfolio(k.attritionRate, base.attritionRate, true, true) : undefined}
          reference={filtered ? undefined : `${fmtInt(k.churned)} of ${fmtInt(k.customers)} customers`}
        />
        <KpiCard
          label="Lost Portfolio Balance"
          value={fmtMoney(k.lostBalance)}
          accent="#E66C37"
          reference={`${fmtPct(k.totalBalance ? k.lostBalance / k.totalBalance : 0)} of deposit balances in context`}
        />
        <KpiCard
          label="At-Risk Revenue (12M)"
          value={fmtMoney(k.atRiskRevenue)}
          accent="#D9B300"
          reference="Σ annual revenue × churn probability, active book"
        />
        <KpiCard
          label="Average LTV (Active)"
          value={fmtMoney(k.avgLtv)}
          accent="#118DFF"
          delta={filtered ? vsPortfolio(k.avgLtv, base.avgLtv, false) : undefined}
          reference={filtered ? undefined : "Margin-based, retention-adjusted"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DropdownSlicer field="geography" />
        <DropdownSlicer field="ageTier" />
        <DropdownSlicer field="gender" />
        <TileSlicer field="memberStatus" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <ChurnByGeoAge className="h-[330px] lg:col-span-7" />
        <ProductHolding className="h-[330px] lg:col-span-5" />
        <RetentionHeatmap className="h-[430px] lg:col-span-8" />
        <AttritionByTenure className="h-[430px] lg:col-span-4" />
      </div>
    </div>
  );
}
