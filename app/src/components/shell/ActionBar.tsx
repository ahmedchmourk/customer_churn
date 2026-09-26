"use client";

import {
  Bookmark,
  Eye,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  Mail,
  MessageSquare,
  MessageSquareText,
  Pencil,
  Presentation,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Share2,
  Star,
} from "lucide-react";
import { useReport } from "@/context/ReportContext";
import { downloadCsv } from "@/lib/format";
import { Menu } from "./Menu";

function ActionButton({ icon: Icon, label, onClick, hideLabelBelow = "lg" }: { icon: typeof Share2; label: string; onClick: () => void; hideLabelBelow?: "lg" | "xl" }) {
  return (
    <button onClick={onClick} title={label} className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] text-pbi-ink hover:bg-pbi-hover">
      <Icon size={15} strokeWidth={1.6} />
      <span className={hideLabelBelow === "xl" ? "hidden xl:inline" : "hidden lg:inline"}>{label}</span>
    </button>
  );
}

/** Report action bar (File / Export / Share / ... / refresh status). */
export function ActionBar() {
  const { data, pageRows, refresh, refreshState, lastRefreshed, notify, resetFilters, setZoom } = useReport();

  const generated = data ? new Date(data.model.meta.generated_at) : null;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Link copied to clipboard");
    } catch {
      notify("Link: " + window.location.href);
    }
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-pbi-line bg-white px-2 no-print">
      <Menu
        label="File"
        items={[
          { label: "Save a copy", icon: Save, onClick: () => notify("A copy was saved to 'My workspace'") },
          { label: "Print this page", icon: Printer, onClick: () => window.print() },
          { divider: true, label: "" },
          { label: "Download this file (.pbix)", icon: FileText, disabled: true },
        ]}
      />
      <Menu
        label="Export"
        items={[
          {
            label: "Analyze in Excel (CSV of current filters)",
            icon: FileSpreadsheet,
            onClick: () => downloadCsv("customer_churn_filtered.csv", pageRows as unknown as Record<string, unknown>[]),
          },
          { label: "PDF", icon: FileText, onClick: () => window.print() },
          { label: "PowerPoint", icon: Presentation, disabled: true },
        ]}
      />
      <div className="mx-1 h-5 w-px bg-pbi-line" />
      <ActionButton icon={Share2} label="Share" onClick={copyLink} />
      <ActionButton icon={MessageSquare} label="Chat in Teams" onClick={() => notify("Opening Microsoft Teams…")} hideLabelBelow="xl" />
      <ActionButton icon={Lightbulb} label="Get insights" onClick={() => notify("Insights: customers holding 3+ products churn at 86% vs 20% portfolio-wide")} hideLabelBelow="xl" />
      <ActionButton icon={Mail} label="Subscribe to report" onClick={() => notify("Subscribed - weekly email every Monday 08:00")} />
      <ActionButton icon={Pencil} label="Edit" onClick={() => notify("Edit mode requires a Pro licence (simulator)")} />
      <ActionButton icon={Star} label="Favorite" onClick={() => notify("Added to Favorites")} hideLabelBelow="xl" />

      <div className="ml-auto flex items-center gap-0.5">
        <div className="hidden items-center gap-2 px-2 text-[12px] text-pbi-ink2 md:flex">
          {refreshState === "refreshing" ? (
            <span className="flex items-center gap-1.5 text-pbi-blue">
              <RefreshCw size={13} className="animate-spin" /> Refreshing page…
            </span>
          ) : refreshState === "error" ? (
            <span className="text-[#A4262C]">Refresh failed</span>
          ) : (
            <span className="flex items-center gap-1.5" title={lastRefreshed ? `Page refreshed ${lastRefreshed.toLocaleTimeString()}` : undefined}>
              <span className="h-2 w-2 rounded-full bg-[#107C10]" />
              Page refresh: {lastRefreshed ? lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
            </span>
          )}
          {generated && (
            <span className="hidden border-l border-pbi-line pl-2 lg:inline">
              Data updated {generated.toLocaleDateString()} {generated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <ActionButton icon={RotateCcw} label="Reset to default" onClick={() => { resetFilters(); notify("Filters reset to default"); }} hideLabelBelow="xl" />
        <Menu
          label={<span className="hidden lg:inline">View</span>}
          icon={Eye}
          align="right"
          items={[
            { label: "Fit to page", onClick: () => setZoom(100) },
            { label: "Actual size (125%)", onClick: () => setZoom(125) },
          ]}
        />
        <button title="Bookmarks" onClick={() => notify("No personal bookmarks yet")} className="grid h-8 w-8 place-items-center rounded-sm hover:bg-pbi-hover">
          <Bookmark size={15} strokeWidth={1.6} />
        </button>
        <button title="Comments" onClick={() => notify("No comments on this page")} className="grid h-8 w-8 place-items-center rounded-sm hover:bg-pbi-hover">
          <MessageSquareText size={15} strokeWidth={1.6} />
        </button>
        <button
          title="Refresh visuals"
          onClick={() => void refresh()}
          className="grid h-8 w-8 place-items-center rounded-sm hover:bg-pbi-hover"
        >
          <RefreshCw size={15} strokeWidth={1.6} className={refreshState === "refreshing" ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
}
