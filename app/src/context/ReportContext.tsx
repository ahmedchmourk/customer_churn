"use client";

/**
 * ReportContext - the report's "filter context" and UI state.
 *
 * Holds the loaded semantic model, report/page filters, the transient
 * cross-filter, visual selection & focus mode, pane state and refresh status.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  applyCrossFilter,
  applySelection,
  type CrossFilter,
  type FieldKey,
  type FilterSelection,
} from "@/lib/filters";
import type { WhatIfParams } from "@/lib/measures";
import type { Customer, Dataset } from "@/lib/types";

export type PageId = "overview" | "diagnostic" | "planner" | "drillthrough";

export interface PageDef {
  id: PageId;
  title: string;
  hidden?: boolean;
  /** Page-scoped filter fields ("Filters on this page"). */
  pageFields: FieldKey[];
}

export const PAGES: PageDef[] = [
  { id: "overview", title: "Executive Attrition Overview", pageFields: ["products"] },
  { id: "diagnostic", title: "Diagnostic & Root-Cause Analytics", pageFields: ["valueTier"] },
  { id: "planner", title: "Prescriptive Retention & What-If Planner", pageFields: ["riskTier"] },
  { id: "drillthrough", title: "Customer Drill-through", hidden: true, pageFields: [] },
];

export interface VisualMeta {
  id: string;
  title: string;
  fields: string[];
}

type RefreshState = "idle" | "refreshing" | "error";

interface ReportState {
  data: Dataset | null;
  loadError: string | null;
  refreshState: RefreshState;
  lastRefreshed: Date | null;
  refresh: () => Promise<void>;

  page: PageId;
  setPage: (p: PageId) => void;

  reportFilters: FilterSelection;
  pageFilters: Record<PageId, FilterSelection>;
  setFilter: (scope: "report" | "page", field: FieldKey, values: string[]) => void;
  resetFilters: () => void;

  crossFilter: CrossFilter | null;
  toggleCrossFilter: (cf: CrossFilter) => void;

  selectedVisual: VisualMeta | null;
  setSelectedVisual: (v: VisualMeta | null) => void;
  focusedVisual: string | null;
  setFocusedVisual: (id: string | null) => void;

  filterPaneOpen: boolean;
  setFilterPaneOpen: (open: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;

  drillCustomer: Customer | null;
  drillThrough: (c: Customer) => void;
  drillBack: () => void;

  toast: string | null;
  notify: (msg: string) => void;

  whatIf: WhatIfParams;
  setWhatIf: (p: WhatIfParams) => void;

  /** Rows after report + page filters (before cross-filter). */
  pageRows: Customer[];
}

const Ctx = createContext<ReportState | null>(null);

export const DEFAULT_WHAT_IF: WhatIfParams = {
  reduction: { Platinum: 0.3, Gold: 0.2, Silver: 0.1, Bronze: 0 },
  threshold: 0.35,
};

const EMPTY_PAGE_FILTERS: Record<PageId, FilterSelection> = { overview: {}, diagnostic: {}, planner: {}, drillthrough: {} };

async function fetchDataset(): Promise<Dataset> {
  const [customers, model] = await Promise.all([
    fetch("/api/data/customers", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`customers.json: HTTP ${r.status}`);
      return r.json();
    }),
    fetch("/api/data/model", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`model.json: HTTP ${r.status}`);
      return r.json();
    }),
  ]);
  return { customers, model };
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [page, setPageState] = useState<PageId>("overview");
  const [returnPage, setReturnPage] = useState<PageId>("planner");
  const [reportFilters, setReportFilters] = useState<FilterSelection>({});
  const [pageFilters, setPageFilters] = useState<Record<PageId, FilterSelection>>(EMPTY_PAGE_FILTERS);
  const [crossFilter, setCrossFilter] = useState<CrossFilter | null>(null);
  const [selectedVisual, setSelectedVisual] = useState<VisualMeta | null>(null);
  const [focusedVisual, setFocusedVisual] = useState<string | null>(null);
  const [filterPaneOpen, setFilterPaneOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [drillCustomer, setDrillCustomer] = useState<Customer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIfParams>(DEFAULT_WHAT_IF);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshState("refreshing");
    try {
      const ds = await fetchDataset();
      setData(ds);
      setLoadError(null);
      setLastRefreshed(new Date());
      setRefreshState("idle");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setRefreshState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setPage = useCallback((p: PageId) => {
    setPageState(p);
    setCrossFilter(null);
    setSelectedVisual(null);
    setFocusedVisual(null);
  }, []);

  const setFilter = useCallback(
    (scope: "report" | "page", field: FieldKey, values: string[]) => {
      if (scope === "report") setReportFilters((f) => ({ ...f, [field]: values }));
      else setPageFilters((f) => ({ ...f, [page]: { ...f[page], [field]: values } }));
    },
    [page],
  );

  const resetFilters = useCallback(() => {
    setReportFilters({});
    setPageFilters(EMPTY_PAGE_FILTERS);
    setCrossFilter(null);
  }, []);

  const toggleCrossFilter = useCallback((cf: CrossFilter) => {
    setCrossFilter((cur) =>
      cur && cur.field === cf.field && cur.value === cf.value && cur.sourceVisual === cf.sourceVisual ? null : cf,
    );
  }, []);

  const drillThrough = useCallback(
    (c: Customer) => {
      setDrillCustomer(c);
      setReturnPage(page === "drillthrough" ? returnPage : page);
      setPage("drillthrough");
    },
    [page, returnPage, setPage],
  );

  const drillBack = useCallback(() => setPage(returnPage), [returnPage, setPage]);

  const pageRows = useMemo(() => {
    if (!data) return [];
    return applySelection(applySelection(data.customers, reportFilters), pageFilters[page]);
  }, [data, reportFilters, pageFilters, page]);

  const value: ReportState = {
    data, loadError, refreshState, lastRefreshed, refresh,
    page, setPage,
    reportFilters, pageFilters, setFilter, resetFilters,
    crossFilter, toggleCrossFilter,
    selectedVisual, setSelectedVisual, focusedVisual, setFocusedVisual,
    filterPaneOpen, setFilterPaneOpen, zoom, setZoom,
    drillCustomer, drillThrough, drillBack,
    toast, notify,
    whatIf, setWhatIf,
    pageRows,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReport(): ReportState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReport must be used inside <ReportProvider>");
  return ctx;
}

/**
 * Rows visible to a specific visual. A cross-filter applies to every visual
 * except the one that emitted it (which instead highlights the selected point).
 */
export function useVisualRows(visualId: string): Customer[] {
  const { pageRows, crossFilter } = useReport();
  return useMemo(
    () => (crossFilter && crossFilter.sourceVisual !== visualId ? applyCrossFilter(pageRows, crossFilter) : pageRows),
    [pageRows, crossFilter, visualId],
  );
}
