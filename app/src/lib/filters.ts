/**
 * Filter model - a small re-implementation of the Power BI filter context.
 *
 * Filters are scoped exactly like Power BI:
 *   - "report" scope  -> Filters on all pages (synced with the on-canvas slicers)
 *   - "page" scope    -> Filters on this page
 * plus a transient cross-filter created by clicking a data point in a visual.
 */
import type { Customer } from "./types";

export type FieldKey =
  | "geography"
  | "ageTier"
  | "gender"
  | "memberStatus"
  | "products"
  | "valueTier"
  | "riskTier";

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** Column name as it would appear in the Power BI data model. */
  column: string;
  values: string[];
  get: (c: Customer) => string;
}

export const FIELDS: Record<FieldKey, FieldDef> = {
  geography: {
    key: "geography",
    label: "Geography",
    column: "Customers[Geography]",
    values: ["France", "Germany", "Spain"],
    get: (c) => c.geography,
  },
  ageTier: {
    key: "ageTier",
    label: "Age Tier",
    column: "Customers[Age_Tier]",
    values: ["18-29", "30-39", "40-49", "50-59", "60+"],
    get: (c) => c.ageTier,
  },
  gender: {
    key: "gender",
    label: "Gender",
    column: "Customers[Gender]",
    values: ["Female", "Male"],
    get: (c) => c.gender,
  },
  memberStatus: {
    key: "memberStatus",
    label: "Member Status",
    column: "Customers[IsActiveMember]",
    values: ["Active", "Inactive"],
    get: (c) => (c.isActive ? "Active" : "Inactive"),
  },
  products: {
    key: "products",
    label: "Number of Products",
    column: "Customers[NumOfProducts]",
    values: ["1", "2", "3", "4"],
    get: (c) => String(c.products),
  },
  valueTier: {
    key: "valueTier",
    label: "Value Tier",
    column: "Scores[Value_Tier]",
    values: ["Platinum", "Gold", "Silver", "Bronze"],
    get: (c) => c.valueTier,
  },
  riskTier: {
    key: "riskTier",
    label: "Risk Tier",
    column: "Scores[Risk_Tier]",
    values: ["Critical", "High", "Medium", "Low", "Churned"],
    get: (c) => c.riskTier,
  },
};

/** Selected values per field; a missing/empty array means "(All)". */
export type FilterSelection = Partial<Record<FieldKey, string[]>>;

export interface CrossFilter {
  field: FieldKey;
  value: string;
  sourceVisual: string;
}

export const REPORT_FILTER_FIELDS: FieldKey[] = ["geography", "ageTier", "gender", "memberStatus"];

export function isActiveFilter(values: string[] | undefined): values is string[] {
  return Array.isArray(values) && values.length > 0;
}

export function applySelection(rows: Customer[], selection: FilterSelection): Customer[] {
  const active = (Object.keys(selection) as FieldKey[]).filter((k) => isActiveFilter(selection[k]));
  if (active.length === 0) return rows;
  const sets = active.map((k) => [FIELDS[k].get, new Set(selection[k])] as const);
  return rows.filter((c) => sets.every(([get, set]) => set.has(get(c))));
}

export function applyCrossFilter(rows: Customer[], cross: CrossFilter | null): Customer[] {
  if (!cross) return rows;
  const get = FIELDS[cross.field].get;
  return rows.filter((c) => get(c) === cross.value);
}

/** Human readable Power BI style summary, e.g. "is France or Spain" / "is (All)". */
export function describeSelection(values: string[] | undefined): string {
  if (!isActiveFilter(values)) return "is (All)";
  if (values.length <= 2) return `is ${values.join(" or ")}`;
  return `is ${values.length} values`;
}
