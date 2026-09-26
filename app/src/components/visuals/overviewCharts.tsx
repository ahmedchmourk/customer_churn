"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReport, useVisualRows } from "@/context/ReportContext";
import { FIELDS, type FieldKey } from "@/lib/filters";
import { fmtInt, fmtPct } from "@/lib/format";
import { attritionBy, attritionMatrix, cohortRetention } from "@/lib/measures";
import { AXIS_TICK, PBI, SERIES_COLORS, sequentialBlue } from "@/lib/theme";
import { Legend, PbiTooltip } from "./primitives";
import { VisualContainer } from "./VisualContainer";

const pctTick = (v: number) => `${Math.round(v * 100)}%`;

/** Highlight state for a cross-filter emitted by `visualId` on `field`. */
function useHighlight(visualId: string, field: FieldKey) {
  const { crossFilter, toggleCrossFilter } = useReport();
  const selected = crossFilter && crossFilter.sourceVisual === visualId && crossFilter.field === field ? crossFilter.value : null;
  const toggle = (value: string) => toggleCrossFilter({ field, value, sourceVisual: visualId });
  return { selected, toggle };
}

// ---------------------------------------------------------------------------
// Churn by Geography & Age Tier (clustered column)
// ---------------------------------------------------------------------------
export function ChurnByGeoAge({ className }: { className?: string }) {
  const id = "churn-geo-age";
  const rows = useVisualRows(id);
  const { selected, toggle } = useHighlight(id, "geography");
  const data = useMemo(() => attritionMatrix(rows, "geography", "ageTier"), [rows]);
  const tiers = FIELDS.ageTier.values;

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Attrition Rate by Geography & Age Tier"
      subtitle="Click a column to cross-filter the page by country"
      fields={["Customers[Geography]", "Customers[Age_Tier]", "[Attrition Rate %]"]}
      tableRows={() =>
        data.flatMap((d) => tiers.map((t) => ({ Geography: d.key as string, "Age Tier": t, "Attrition Rate": Number((d[t] as number).toFixed(4)), Customers: d[`${t}__n`] as number })))
      }
    >
      <div className="flex h-full flex-col">
        <div className="px-1 pb-1">
          <Legend items={tiers.map((t) => ({ label: t, color: SERIES_COLORS[t] }))} />
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="18%" margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={PBI.grid} strokeDasharray="0" />
              <XAxis dataKey="key" tick={AXIS_TICK} axisLine={{ stroke: PBI.grid }} tickLine={false} />
              <YAxis tickFormatter={pctTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <PbiTooltip
                      title={String(label)}
                      rows={payload.map((p) => ({
                        label: String(p.dataKey),
                        value: `${fmtPct(Number(p.value))}  (n=${fmtInt(Number((p.payload as Record<string, number>)[`${p.dataKey}__n`]))})`,
                        color: SERIES_COLORS[String(p.dataKey)],
                      }))}
                    />
                  ) : null
                }
              />
              {tiers.map((t) => (
                <Bar key={t} dataKey={t} fill={SERIES_COLORS[t]} radius={[3, 3, 0, 0]} maxBarSize={26} cursor="pointer" onClick={(d) => toggle(String((d.payload as { key: string }).key))}>
                  {data.map((d) => (
                    <Cell key={d.key as string} fillOpacity={selected && selected !== d.key ? 0.25 : 1} />
                  ))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Product holding distribution (small multiples: volume | attrition)
// ---------------------------------------------------------------------------
export function ProductHolding({ className }: { className?: string }) {
  const id = "product-holding";
  const rows = useVisualRows(id);
  const { selected, toggle } = useHighlight(id, "products");
  const data = useMemo(
    () => attritionBy(rows, "products").map((g) => ({ ...g, label: `${g.key} product${g.key === "1" ? "" : "s"}`, share: rows.length ? g.customers / rows.length : 0 })),
    [rows],
  );

  const panel = (metric: "customers" | "rate", title: string, color: string) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="px-1 text-[11px] font-semibold text-pbi-ink2">{title}</div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={metric === "customers" ? 84 : 0} hide={metric !== "customers"} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <PbiTooltip
                    title={d.label}
                    rows={[
                      { label: "Customers", value: fmtInt(d.customers) },
                      { label: "Share of book", value: fmtPct(d.share) },
                      { label: "Churned", value: fmtInt(d.churned) },
                      { label: "Attrition rate", value: fmtPct(d.rate) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey={metric} fill={color} radius={[0, 3, 3, 0]} maxBarSize={22} cursor="pointer" onClick={(d) => toggle(String((d.payload as { key: string }).key))}>
              {data.map((d) => (
                <Cell key={d.key} fillOpacity={selected && selected !== d.key ? 0.25 : 1} />
              ))}
              <LabelList
                dataKey={metric}
                position="right"
                style={{ fontSize: 11, fill: PBI.text }}
                formatter={(v: unknown) => (metric === "rate" ? fmtPct(Number(v)) : fmtInt(Number(v)))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Product Holding Distribution"
      subtitle="Customers vs. attrition by number of products held · click to cross-filter"
      fields={["Customers[NumOfProducts]", "[Customer Count]", "[Attrition Rate %]"]}
      tableRows={() => data.map((d) => ({ Products: d.key, Customers: d.customers, Churned: d.churned, "Attrition Rate": Number(d.rate.toFixed(4)) }))}
    >
      <div className="flex h-full gap-2">
        {panel("customers", "Customer count", "#118DFF")}
        {panel("rate", "Attrition rate", "#12239E")}
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Cohort retention heatmap (Kaplan-Meier per join-year cohort)
// ---------------------------------------------------------------------------
export function CohortHeatmap({ className }: { className?: string }) {
  const id = "cohort-heatmap";
  const rows = useVisualRows(id);
  const years = 8;
  const data = useMemo(() => cohortRetention(rows, years), [rows]);
  const [hover, setHover] = useState<{ cohort: number; year: number; v: number; n: number } | null>(null);

  // Colour scale spans the observed range so contrast is preserved under filters.
  const vals = data.flatMap((r) => r.cells.filter((v): v is number => v !== null));
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const norm = (v: number) => (max === min ? 1 : (v - min) / (max - min));

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Cohort Retention Heatmap"
      subtitle="Kaplan-Meier retention by join-year cohort · % of cohort still banking after N years"
      fields={["Customers[Join_Date].[Year]", "Customers[Tenure_Months]", "[KM Retention %]"]}
      tableRows={() =>
        data.map((r) => ({ Cohort: r.cohort, Customers: r.customers, ...Object.fromEntries(r.cells.map((v, i) => [`Year ${i + 1}`, v === null ? null : Number(v.toFixed(4))])) }))
      }
    >
      <div className="pbi-scroll h-full overflow-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr className="text-pbi-ink2">
              <th className="px-2 py-1 text-left font-semibold">Cohort</th>
              <th className="px-2 py-1 text-right font-semibold">Customers</th>
              {Array.from({ length: years }, (_, i) => (
                <th key={i} className="px-1 py-1 text-center font-semibold">Yr {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.cohort}>
                <td className="px-2 font-semibold">{r.cohort}</td>
                <td className="px-2 text-right tabular-nums text-pbi-ink2">{fmtInt(r.customers)}</td>
                {r.cells.map((v, i) =>
                  v === null ? (
                    <td key={i} className="h-7 rounded-[2px] bg-[#FAF9F8]" />
                  ) : (
                    <td
                      key={i}
                      onMouseEnter={() => setHover({ cohort: r.cohort, year: i + 1, v, n: r.customers })}
                      onMouseLeave={() => setHover(null)}
                      className="h-7 cursor-default rounded-[2px] text-center tabular-nums transition-[outline] hover:outline hover:outline-2 hover:outline-pbi-ink"
                      style={{ background: sequentialBlue(norm(v)), color: norm(v) > 0.55 ? "#fff" : PBI.text }}
                    >
                      {Math.round(v * 100)}%
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1 flex items-center justify-between px-2 text-[11px] text-pbi-ink2">
          <span>
            {hover ? (
              <>
                <b className="text-pbi-ink">{hover.cohort}</b> cohort · Year {hover.year}: <b className="text-pbi-ink">{fmtPct(hover.v)}</b> retained ({fmtInt(hover.n)} customers)
              </>
            ) : (
              "Hover a cell for details · blank = not yet observable"
            )}
          </span>
          <span className="flex items-center gap-1.5">
            {fmtPct(min, 0)}
            <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${sequentialBlue(0)}, ${sequentialBlue(1)})` }} />
            {fmtPct(max, 0)}
          </span>
        </div>
      </div>
    </VisualContainer>
  );
}

// ---------------------------------------------------------------------------
// Attrition by tenure year (single series column)
// ---------------------------------------------------------------------------
export function AttritionByTenure({ className }: { className?: string }) {
  const id = "attrition-tenure";
  const rows = useVisualRows(id);
  const data = useMemo(() => {
    const acc = Array.from({ length: 11 }, (_, t) => ({ tenure: t, n: 0, e: 0 }));
    for (const c of rows) {
      acc[c.tenure].n++;
      acc[c.tenure].e += c.churned;
    }
    return acc.filter((a) => a.n > 0).map((a) => ({ tenure: `${a.tenure}`, rate: a.e / a.n, n: a.n }));
  }, [rows]);

  return (
    <VisualContainer
      id={id}
      className={className}
      title="Attrition Rate by Tenure (Years)"
      subtitle="Early-life customers carry the highest exit risk"
      fields={["Customers[Tenure]", "[Attrition Rate %]"]}
      tableRows={() => data.map((d) => ({ "Tenure (Years)": d.tenure, Customers: d.n, "Attrition Rate": Number(d.rate.toFixed(4)) }))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={PBI.grid} />
          <XAxis dataKey="tenure" tick={AXIS_TICK} axisLine={{ stroke: PBI.grid }} tickLine={false} />
          <YAxis tickFormatter={pctTick} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <PbiTooltip title={`Tenure ${d.tenure} yr`} rows={[{ label: "Attrition rate", value: fmtPct(d.rate) }, { label: "Customers", value: fmtInt(d.n) }]} />;
            }}
          />
          <Bar dataKey="rate" fill="#118DFF" radius={[3, 3, 0, 0]} maxBarSize={28}>
            <LabelList dataKey="rate" position="top" style={{ fontSize: 10, fill: PBI.textSecondary }} formatter={(v: unknown) => pctTick(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </VisualContainer>
  );
}
