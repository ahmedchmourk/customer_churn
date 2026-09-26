"use client";

import { Check, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReport } from "@/context/ReportContext";
import { FIELDS, isActiveFilter, type FieldKey } from "@/lib/filters";

// ---------------------------------------------------------------------------
// Report page header banner
// ---------------------------------------------------------------------------
export function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] bg-pbi-dark px-4 py-3 text-white">
      <div className="flex items-center gap-3">
        <span className="h-9 w-1.5 rounded-full bg-pbi-gold" />
        <div>
          <h1 className="text-[18px] font-semibold leading-tight">{title}</h1>
          <p className="text-[12px] text-white/70">{subtitle}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI card (Power BI "Card (new)" style)
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: string;
  reference?: string;
  /** Delta direction and whether that direction is favourable. */
  delta?: { text: string; up: boolean; good: boolean };
  accent?: string;
  onClick?: () => void;
}

export function KpiCard({ label, value, reference, delta, accent = "#118DFF" }: KpiCardProps) {
  return (
    <div className="relative flex min-w-0 flex-col justify-between overflow-hidden rounded-[4px] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <div className="truncate text-[12px] font-semibold uppercase tracking-wide text-pbi-ink2">{label}</div>
      <div className="mt-1 truncate text-[30px] font-semibold leading-none tabular-nums text-pbi-ink">{value}</div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 text-[11px] text-pbi-ink2">
        {delta && (
          <span className="flex items-center gap-1 font-semibold" style={{ color: delta.good ? "#107C10" : "#A4262C" }}>
            {delta.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta.text}
          </span>
        )}
        {reference && <span className="truncate">{reference}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slicers bound to report-level ("all pages") filters
// ---------------------------------------------------------------------------
export function DropdownSlicer({ field, scope = "report" }: { field: FieldKey; scope?: "report" | "page" }) {
  const { reportFilters, pageFilters, page, setFilter } = useReport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const def = FIELDS[field];
  const values = scope === "report" ? reportFilters[field] : pageFilters[page][field];
  const active = isActiveFilter(values);
  const selected = new Set(values ?? []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setFilter(scope, field, def.values.filter((x) => next.has(x)));
  };

  const summary = !active ? "All" : values.length === 1 ? values[0] : "Multiple selections";

  return (
    <div ref={ref} className="relative min-w-0 rounded-[4px] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 truncate text-[12px] font-semibold text-pbi-ink">{def.label}</div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-7 w-full items-center justify-between rounded-[2px] border px-2 text-[12px] ${open ? "border-pbi-ink" : "border-pbi-line hover:border-pbi-ink2"}`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-[60px] z-40 rounded-[2px] border border-pbi-line bg-white py-1 shadow-lg">
          <button onClick={() => setFilter(scope, field, [])} className="flex w-full items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-pbi-hover">
            <CheckBox checked={!active} /> Select all
          </button>
          {def.values.map((v) => (
            <button key={v} onClick={() => toggle(v)} className="flex w-full items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-pbi-hover">
              <CheckBox checked={selected.has(v)} /> {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={`grid h-3.5 w-3.5 place-items-center rounded-[2px] border ${checked ? "border-pbi-dark bg-pbi-dark text-white" : "border-pbi-ink2 bg-white"}`}>
      {checked && <Check size={10} strokeWidth={3} />}
    </span>
  );
}

/** Tile ("button") slicer - single-select toggle like Power BI's tile layout. */
export function TileSlicer({ field, scope = "report" }: { field: FieldKey; scope?: "report" | "page" }) {
  const { reportFilters, pageFilters, page, setFilter } = useReport();
  const def = FIELDS[field];
  const values = scope === "report" ? reportFilters[field] : pageFilters[page][field];
  const current = isActiveFilter(values) && values.length === 1 ? values[0] : null;

  return (
    <div className="min-w-0 rounded-[4px] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 truncate text-[12px] font-semibold text-pbi-ink">{def.label}</div>
      <div className="flex h-7 overflow-hidden rounded-[2px] border border-pbi-line text-[12px]">
        {["All", ...def.values].map((v) => {
          const on = v === "All" ? current === null : current === v;
          return (
            <button
              key={v}
              onClick={() => setFilter(scope, field, v === "All" ? [] : [v])}
              className={`flex-1 truncate border-r border-pbi-line px-2 last:border-r-0 ${on ? "bg-pbi-dark text-white" : "hover:bg-pbi-hover"}`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Power BI style chart tooltip
// ---------------------------------------------------------------------------
export function PbiTooltip({ title, rows }: { title?: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="pointer-events-none min-w-[160px] rounded-[2px] border border-pbi-line bg-white px-3 py-2 text-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
      {title && <div className="mb-1 font-semibold text-pbi-ink">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-[1px]">
          <span className="flex items-center gap-1.5 text-pbi-ink2">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-semibold tabular-nums text-pbi-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Simple legend (identity never relies on colour alone - labels always shown). */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-pbi-ink2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
