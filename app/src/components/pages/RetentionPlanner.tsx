"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { DEFAULT_WHAT_IF, useReport, useVisualRows } from "@/context/ReportContext";
import { fmtInt, fmtMoney, fmtPct } from "@/lib/format";
import { readAssumptions, simulateWhatIf, VALUE_TIERS } from "@/lib/measures";
import { AtRiskAccountsTable, SavedByAction, ScenarioByTier, WhatIfSlider } from "../visuals/plannerVisuals";
import { DropdownSlicer, KpiCard, PageHeader } from "../visuals/primitives";

export function RetentionPlanner() {
  const { whatIf, setWhatIf, data } = useReport();
  const rows = useVisualRows("what-if");
  const assumptions = useMemo(() => readAssumptions(data!.model.assumptions), [data]);
  const result = useMemo(() => simulateWhatIf(rows, whatIf, assumptions), [rows, whatIf, assumptions]);
  const t = result.totals;

  return (
    <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 rounded-[2px] bg-pbi-page p-3 shadow-sm">
      <PageHeader
        title="Prescriptive Retention & What-If Planner"
        subtitle="Simulate the revenue impact of targeted churn reduction by value tier"
        right={
          <div className="text-right text-[11px] text-white/70">
            <div>Baseline at-risk revenue <b className="text-[13px] text-white">{fmtMoney(t.baselineAtRisk)}</b></div>
            <div>Scenario reduces it by <b className="text-[13px] text-white">{fmtPct(t.baselineAtRisk ? t.savedRevenue / t.baselineAtRisk : 0)}</b></div>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* What-if parameter panel */}
        <div className="rounded-[4px] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.08)] lg:col-span-3 lg:row-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><SlidersHorizontal size={14} /> What-if parameters</h2>
            <button onClick={() => setWhatIf(DEFAULT_WHAT_IF)} title="Reset parameters" className="grid h-6 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
              <RotateCcw size={12} />
            </button>
          </div>
          <p className="mb-1 text-[11px] text-pbi-ink2">Relative churn-probability reduction achieved on targeted accounts, per value tier.</p>
          {VALUE_TIERS.map((tier) => (
            <WhatIfSlider
              key={tier}
              label={`Churn reduction · ${tier}`}
              value={Math.round(whatIf.reduction[tier] * 100)}
              min={0}
              max={60}
              step={1}
              format={(v) => `${v}%`}
              onChange={(v) => setWhatIf({ ...whatIf, reduction: { ...whatIf.reduction, [tier]: v / 100 } })}
            />
          ))}
          <div className="my-2 border-t border-pbi-line" />
          <WhatIfSlider
            label="Target accounts with churn prob. ≥"
            value={Math.round(whatIf.threshold * 100)}
            min={5}
            max={90}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => setWhatIf({ ...whatIf, threshold: v / 100 })}
          />
          <div className="mt-2">
            <DropdownSlicer field="geography" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-9 lg:grid-cols-4">
          <KpiCard label="Accounts Targeted" value={fmtInt(t.targeted)} accent="#12239E" reference={`Churn prob. ≥ ${fmtPct(whatIf.threshold, 0)}`} />
          <KpiCard label="Revenue Saved (12M)" value={fmtMoney(t.savedRevenue)} accent="#107C10" reference={`of ${fmtMoney(t.baselineAtRisk)} at risk`} />
          <KpiCard label="LTV Preserved" value={fmtMoney(t.ltvPreserved)} accent="#118DFF" reference={`ΔLTV from lower churn · cost ${fmtMoney(t.cost)}`} />
          <KpiCard
            label="Programme ROI"
            value={t.cost > 0 ? `${t.roi >= 0 ? "" : "−"}${Math.abs(t.roi).toFixed(1)}x` : "—"}
            accent="#D9B300"
            delta={t.cost > 0 ? { text: t.roi >= 0 ? "Value-accretive" : "Value-destructive", up: t.roi >= 0, good: t.roi >= 0 } : undefined}
            reference="(LTV preserved − cost) / cost"
          />
        </div>
        <ScenarioByTier result={result} className="h-[300px] lg:col-span-5" />
        <SavedByAction result={result} className="h-[300px] lg:col-span-4" />
      </div>

      <AtRiskAccountsTable className="h-[460px]" />
    </div>
  );
}
