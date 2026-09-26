"use client";

import { useReport } from "@/context/ReportContext";
import { fmtInt } from "@/lib/format";
import { AgeBalanceScatter, HypothesisTable, KeyInfluencers, ParetoChart, SurvivalCurves } from "../visuals/diagnosticCharts";
import { DropdownSlicer, PageHeader, TileSlicer } from "../visuals/primitives";

export function DiagnosticAnalytics() {
  const { pageRows, data } = useReport();
  const pm = data!.model.propensity_model;

  return (
    <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 rounded-[2px] bg-pbi-page p-3 shadow-sm">
      <PageHeader
        title="Diagnostic & Root-Cause Analytics"
        subtitle={`Why customers leave · ${fmtInt(pageRows.length)} customers in context`}
        right={
          <div className="text-right text-[11px] text-white/70">
            <div>{pm.algorithm.split(" (")[0]} · ROC-AUC <b className="text-[13px] text-white">{pm.roc_auc.toFixed(3)}</b></div>
            <div>PR-AUC <b className="text-[13px] text-white">{pm.pr_auc.toFixed(3)}</b> · base rate {Math.round(pm.base_rate * 1000) / 10}%</div>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DropdownSlicer field="geography" />
        <DropdownSlicer field="ageTier" />
        <DropdownSlicer field="valueTier" scope="page" />
        <TileSlicer field="memberStatus" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <KeyInfluencers className="h-[420px] lg:col-span-7" />
        <SurvivalCurves className="h-[420px] lg:col-span-5" />
        <AgeBalanceScatter className="h-[360px] lg:col-span-6" />
        <ParetoChart className="h-[360px] lg:col-span-6" />
        <HypothesisTable className="h-[430px] lg:col-span-12" />
      </div>
    </div>
  );
}
