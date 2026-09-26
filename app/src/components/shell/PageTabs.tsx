"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, Scan } from "lucide-react";
import { PAGES, useReport } from "@/context/ReportContext";

/** Bottom page-navigation bar with tabs and the zoom slider. */
export function PageTabs() {
  const { page, setPage, zoom, setZoom, notify } = useReport();
  const visible = PAGES.filter((p) => !p.hidden);
  const idx = visible.findIndex((p) => p.id === page);

  return (
    <div className="flex h-9 shrink-0 items-stretch border-t border-pbi-line bg-white text-[13px] no-print">
      <div className="flex items-center gap-0.5 px-1">
        <button disabled={idx <= 0} onClick={() => setPage(visible[idx - 1].id)} className="grid h-7 w-7 place-items-center rounded-sm hover:bg-pbi-hover disabled:opacity-30" aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <button disabled={idx < 0 || idx >= visible.length - 1} onClick={() => setPage(visible[idx + 1].id)} className="grid h-7 w-7 place-items-center rounded-sm hover:bg-pbi-hover disabled:opacity-30" aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="pbi-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {visible.map((p) => {
          const active = p.id === page;
          return (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`relative shrink-0 whitespace-nowrap border-r border-pbi-line px-4 ${active ? "bg-white font-semibold text-pbi-ink" : "bg-[#F3F2F1] text-pbi-ink2 hover:bg-[#EDEBE9]"}`}
            >
              {p.title}
              {active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-pbi-gold" />}
            </button>
          );
        })}
        {page === "drillthrough" && (
          <span className="relative flex shrink-0 items-center whitespace-nowrap border-r border-pbi-line bg-white px-4 font-semibold italic">
            Customer Drill-through
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-pbi-gold" />
          </span>
        )}
        <button onClick={() => notify("Adding pages requires Edit mode")} className="grid w-9 shrink-0 place-items-center text-pbi-ink2 hover:bg-pbi-hover" aria-label="New page">
          <Plus size={15} />
        </button>
      </div>
      <div className="hidden items-center gap-2 border-l border-pbi-line px-3 text-[12px] text-pbi-ink2 sm:flex">
        <span className="hidden whitespace-nowrap lg:inline">Page {Math.max(idx, 0) + 1} of {visible.length}</span>
        <button onClick={() => setZoom(Math.max(50, zoom - 10))} aria-label="Zoom out"><Minus size={13} /></button>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="pbi-range w-24"
          style={{ ["--pct" as string]: `${((zoom - 50) / 150) * 100}%` }}
          aria-label="Zoom"
        />
        <button onClick={() => setZoom(Math.min(200, zoom + 10))} aria-label="Zoom in"><Plus size={13} /></button>
        <span className="w-9 text-right tabular-nums">{zoom}%</span>
        <button onClick={() => setZoom(100)} title="Fit to page" className="grid h-6 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
          <Scan size={13} />
        </button>
      </div>
    </div>
  );
}
