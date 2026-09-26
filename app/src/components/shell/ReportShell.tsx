"use client";

import { TriangleAlert } from "lucide-react";
import { useReport } from "@/context/ReportContext";
import { CustomerDrillthrough } from "../pages/CustomerDrillthrough";
import { DiagnosticAnalytics } from "../pages/DiagnosticAnalytics";
import { ExecutiveOverview } from "../pages/ExecutiveOverview";
import { RetentionPlanner } from "../pages/RetentionPlanner";
import { ActionBar } from "./ActionBar";
import { FilterPane } from "./FilterPane";
import { LeftNav } from "./LeftNav";
import { PageTabs } from "./PageTabs";
import { TopBar } from "./TopBar";

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-pbi-ink2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="pbi-dot h-2.5 w-2.5 rounded-full bg-pbi-gold" />
        ))}
      </div>
      <span className="text-[13px]">Loading report…</span>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-24 max-w-lg rounded-sm border border-pbi-line bg-white p-6 text-[13px]">
      <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        <TriangleAlert size={18} className="text-[#C43E1C]" /> Couldn&apos;t load data for this report
      </div>
      <p className="mb-3 text-pbi-ink2">{message}</p>
      <p className="text-pbi-ink2">
        Generate the semantic model first:
        <code className="mt-2 block rounded-sm bg-pbi-hover p-2 text-[12px] text-pbi-ink">
          python scripts/fetch_kaggle_data.py && python scripts/analytical_engine.py
        </code>
      </p>
    </div>
  );
}

function ActivePage() {
  const { page } = useReport();
  switch (page) {
    case "overview":
      return <ExecutiveOverview />;
    case "diagnostic":
      return <DiagnosticAnalytics />;
    case "planner":
      return <RetentionPlanner />;
    case "drillthrough":
      return <CustomerDrillthrough />;
  }
}

/** Full Power BI service chrome wrapping the report canvas. */
export function ReportShell() {
  const { data, loadError, zoom, toast, setSelectedVisual, refreshState } = useReport();
  const scale = zoom / 100;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <ActionBar />
          {refreshState === "refreshing" && data && (
            <div className="relative h-0.5 overflow-hidden bg-pbi-line">
              <div className="pbi-progress absolute inset-y-0 w-1/4 bg-pbi-gold" />
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <main
              className="pbi-scroll min-w-0 flex-1 overflow-auto bg-pbi-canvas p-2 sm:p-4"
              onClick={(e) => {
                // Clicking empty canvas deselects the current visual (Power BI behaviour).
                if (e.target === e.currentTarget) setSelectedVisual(null);
              }}
            >
              {loadError && !data ? (
                <LoadError message={loadError} />
              ) : !data ? (
                <Loading />
              ) : (
                <div
                  style={
                    scale === 1
                      ? undefined
                      : { width: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "top left" }
                  }
                >
                  <ActivePage />
                </div>
              )}
            </main>
            <FilterPane />
          </div>
          <PageTabs />
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-14 left-1/2 z-[100] -translate-x-1/2 rounded-sm bg-pbi-dark px-4 py-2.5 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
