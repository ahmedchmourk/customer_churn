"use client";

import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Eraser, Eye, Filter, Lock, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PAGES, useReport } from "@/context/ReportContext";
import { FIELDS, REPORT_FILTER_FIELDS, describeSelection, isActiveFilter, type FieldKey } from "@/lib/filters";

/** A single "basic filtering" card from the Power BI filter pane. */
function FilterCard({ field, values, onChange, counts }: { field: FieldKey; values: string[] | undefined; onChange: (v: string[]) => void; counts: Map<string, number> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const def = FIELDS[field];
  const active = isActiveFilter(values);
  const selected = new Set(values ?? []);
  const shown = def.values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(def.values.filter((x) => next.has(x)));
  };

  return (
    <div className={`rounded-[3px] border bg-white ${active ? "border-pbi-blue/60" : "border-pbi-line"}`}>
      <div className="flex items-start gap-1 px-2.5 py-2">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate text-[13px] font-semibold text-pbi-ink">{def.label}</span>
          <span className={`truncate text-[12px] ${active ? "text-pbi-ink" : "text-pbi-ink2"}`}>{describeSelection(values)}</span>
        </button>
        {active && (
          <button title="Clear filter" onClick={() => onChange([])} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
            <Eraser size={13} />
          </button>
        )}
        <button title="Lock filter" className="hidden h-6 w-6 place-items-center rounded-sm text-pbi-muted hover:bg-pbi-hover sm:grid">
          <Lock size={12} />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="grid h-6 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-pbi-line px-2.5 pb-2.5 pt-2">
          <div className="mb-1 text-[11px] text-pbi-ink2">Filter type</div>
          <div className="mb-2 flex h-7 items-center justify-between rounded-[2px] border border-pbi-line px-2 text-[12px]">
            Basic filtering <ChevronDown size={12} />
          </div>
          <div className="mb-1.5 flex h-7 items-center gap-1.5 rounded-[2px] border border-pbi-line px-2">
            <Search size={12} className="text-pbi-ink2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full bg-transparent text-[12px] outline-none" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 py-1 text-[12px]">
            <input type="checkbox" className="accent-[#252423]" checked={!active} onChange={() => onChange([])} />
            <span>Select all</span>
          </label>
          {shown.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 py-1 text-[12px]">
              <input type="checkbox" className="accent-[#252423]" checked={selected.has(v)} onChange={() => toggle(v)} />
              <span className="flex-1">{v}</span>
              <span className="text-pbi-muted">{(counts.get(v) ?? 0).toLocaleString()}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="mb-1.5 text-[12px] font-semibold text-pbi-ink">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

/** Collapsible right-hand filter pane: visual / page / all-pages scopes + search. */
export function FilterPane() {
  const { data, page, reportFilters, pageFilters, setFilter, selectedVisual, filterPaneOpen, setFilterPaneOpen, crossFilter, toggleCrossFilter } = useReport();
  const [search, setSearch] = useState("");
  const pageDef = PAGES.find((p) => p.id === page)!;

  const counts = useMemo(() => {
    const m = new Map<FieldKey, Map<string, number>>();
    if (!data) return m;
    for (const key of Object.keys(FIELDS) as FieldKey[]) {
      const cm = new Map<string, number>();
      for (const c of data.customers) {
        const v = FIELDS[key].get(c);
        cm.set(v, (cm.get(v) ?? 0) + 1);
      }
      m.set(key, cm);
    }
    return m;
  }, [data]);

  const matches = (label: string) => label.toLowerCase().includes(search.toLowerCase());

  if (!filterPaneOpen) {
    return (
      <button
        onClick={() => setFilterPaneOpen(true)}
        className="hidden w-8 shrink-0 flex-col items-center gap-3 border-l border-pbi-line bg-white pt-3 hover:bg-pbi-hover md:flex no-print"
        title="Expand filter pane"
      >
        <ChevronsLeft size={15} />
        <Filter size={14} />
        <span className="text-[13px] font-semibold [writing-mode:vertical-rl]">Filters</span>
      </button>
    );
  }

  return (
    <aside className="pbi-scroll hidden w-[250px] shrink-0 flex-col overflow-y-auto border-l border-pbi-line bg-[#FAF9F8] md:flex no-print">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="text-[15px] font-semibold text-pbi-ink">Filters</h2>
        <div className="flex items-center gap-1">
          <Eye size={14} className="text-pbi-ink2" />
          <button onClick={() => setFilterPaneOpen(false)} title="Collapse" className="grid h-6 w-6 place-items-center rounded-sm hover:bg-pbi-hover">
            <ChevronsRight size={15} />
          </button>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="flex h-8 items-center gap-2 rounded-[2px] border border-pbi-line bg-white px-2">
          <Search size={13} className="text-pbi-ink2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="w-full bg-transparent text-[13px] outline-none" />
          {search && (
            <button onClick={() => setSearch("")}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3">
        {selectedVisual && (
          <Section title="Filters on this visual">
            <div className="rounded-[3px] border border-dashed border-pbi-line bg-white px-2.5 py-2 text-[12px] text-pbi-ink2">
              <div className="mb-1 font-semibold text-pbi-ink">{selectedVisual.title}</div>
              {selectedVisual.fields.filter(matches).map((f) => {
                const def = Object.values(FIELDS).find((d) => d.column === f);
                const values = def ? reportFilters[def.key] ?? pageFilters[page][def.key] : undefined;
                return (
                  <div key={f} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="truncate">{f}</span>
                    <span className="shrink-0 text-pbi-muted">{describeSelection(values)}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {crossFilter && (
          <Section title="Cross-filter (visual interaction)">
            <div className="flex items-center justify-between rounded-[3px] border border-pbi-blue/60 bg-white px-2.5 py-2 text-[12px]">
              <span>
                <b>{FIELDS[crossFilter.field].label}</b> is {crossFilter.value}
              </span>
              <button title="Clear" onClick={() => toggleCrossFilter(crossFilter)}>
                <Eraser size={13} />
              </button>
            </div>
          </Section>
        )}

        {pageDef.pageFields.length > 0 && (
          <Section title="Filters on this page">
            {pageDef.pageFields
              .filter((f) => matches(FIELDS[f].label))
              .map((f) => (
                <FilterCard key={`${page}-${f}`} field={f} values={pageFilters[page][f]} onChange={(v) => setFilter("page", f, v)} counts={counts.get(f) ?? new Map()} />
              ))}
          </Section>
        )}

        <Section title="Filters on all pages">
          {REPORT_FILTER_FIELDS.filter((f) => matches(FIELDS[f].label)).map((f) => (
            <FilterCard key={f} field={f} values={reportFilters[f]} onChange={(v) => setFilter("report", f, v)} counts={counts.get(f) ?? new Map()} />
          ))}
        </Section>

        <div className="mb-4 flex items-center justify-center rounded-[3px] border border-dashed border-pbi-line py-3 text-[12px] text-pbi-muted">
          Add data fields here
        </div>
      </div>
    </aside>
  );
}
