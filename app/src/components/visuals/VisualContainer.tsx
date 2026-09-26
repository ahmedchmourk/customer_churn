"use client";

import { Download, Ellipsis, Filter, Maximize2, Minimize2, Pin, Table2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReport } from "@/context/ReportContext";
import { downloadCsv } from "@/lib/format";

export type Row = Record<string, string | number | null>;

interface VisualContainerProps {
  id: string;
  title: string;
  subtitle?: ReactNode;
  /** Model columns used by the visual - shown under "Filters on this visual". */
  fields: string[];
  /** Data behind the visual - powers "Show as a table" and "Export data". */
  tableRows?: () => Row[];
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * Power BI visual frame: title, hover header (filter peek, focus mode, "..." menu),
 * click-to-select, focus mode, show-as-table and CSV export.
 */
export function VisualContainer({ id, title, subtitle, fields, tableRows, className = "", bodyClassName = "", children }: VisualContainerProps) {
  const { selectedVisual, setSelectedVisual, focusedVisual, setFocusedVisual, notify } = useReport();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [peek, setPeek] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = selectedVisual?.id === id;
  const focused = focusedVisual === id;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  if (focusedVisual && !focused) {
    // Keep grid geometry stable underneath the focus overlay.
    return <div className={`${className} invisible`} aria-hidden />;
  }

  const rows = showTable && tableRows ? tableRows() : [];

  const toggleFocus = () => {
    if (!focused) document.querySelector("main")?.scrollTo({ top: 0 });
    setSelectedVisual({ id, title, fields });
    setFocusedVisual(focused ? null : id);
  };

  return (
    <section
      onClick={() => setSelectedVisual({ id, title, fields })}
      className={`group flex min-w-0 flex-col rounded-[4px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] ${
        focused ? "absolute inset-x-3 top-3 z-30 h-[calc(100dvh-190px)] min-h-[420px]" : `relative ${className}`
      } ${selected ? "outline outline-1 outline-[#8A8886]" : ""}`}
    >
      {/* Visual header (appears on hover / when selected, like the Power BI service) */}
      <div
        className={`absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-[3px] border border-pbi-line bg-white px-1 py-0.5 shadow-sm transition-opacity no-print ${
          selected || menuOpen || focused ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button title="Pin visual" onClick={() => notify(`Pinned "${title}" to dashboard`)} className="grid h-5 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
          <Pin size={12} />
        </button>
        <div className="relative" onMouseEnter={() => setPeek(true)} onMouseLeave={() => setPeek(false)}>
          <button title="Filters and slicers affecting this visual" className="grid h-5 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
            <Filter size={12} />
          </button>
          {peek && (
            <div className="absolute right-0 top-6 z-40 w-60 rounded-sm border border-pbi-line bg-white p-2.5 text-[11px] shadow-lg">
              <div className="mb-1 font-semibold">Fields in this visual</div>
              {fields.map((f) => (
                <div key={f} className="truncate text-pbi-ink2">{f}</div>
              ))}
            </div>
          )}
        </div>
        <button
          title={focused ? "Back to report" : "Focus mode"}
          onClick={toggleFocus}
          className="grid h-5 w-6 place-items-center rounded-sm hover:bg-pbi-hover"
        >
          {focused ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <div className="relative" ref={menuRef}>
          <button title="More options" onClick={() => setMenuOpen((o) => !o)} className="grid h-5 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
            <Ellipsis size={13} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-40 w-48 rounded-sm border border-pbi-line bg-white py-1 text-[12px] shadow-lg">
              <button
                disabled={!tableRows}
                onClick={() => { setShowTable((s) => !s); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-pbi-hover disabled:text-pbi-muted"
              >
                <Table2 size={13} /> {showTable ? "Show as visual" : "Show as a table"}
              </button>
              <button
                disabled={!tableRows}
                onClick={() => {
                  if (tableRows) downloadCsv(`${id}.csv`, tableRows());
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-pbi-hover disabled:text-pbi-muted"
              >
                <Download size={13} /> Export data
              </button>
              <button
                onClick={() => { toggleFocus(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-pbi-hover"
              >
                <Maximize2 size={13} /> {focused ? "Back to report" : "Focus mode"}
              </button>
            </div>
          )}
        </div>
      </div>

      <header className="px-3 pt-2.5">
        <h2 className="truncate text-[14px] font-semibold leading-tight text-pbi-ink">{title}</h2>
        {subtitle && <div className="mt-0.5 text-[11px] leading-snug text-pbi-ink2">{subtitle}</div>}
      </header>

      <div className={`relative min-h-0 flex-1 px-2 pb-2 pt-1 ${bodyClassName}`}>
        {showTable ? <DataTable rows={rows} /> : children}
      </div>
    </section>
  );
}

function DataTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <div className="p-4 text-[12px] text-pbi-muted">No data</div>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="pbi-scroll absolute inset-0 overflow-auto px-2 pb-2">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-white">
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-pbi-ink/70 px-2 py-1 text-left font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-[#FAF9F8]">
              {cols.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1 tabular-nums">
                  {typeof r[c] === "number" ? (r[c] as number).toLocaleString(undefined, { maximumFractionDigits: 4 }) : r[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
