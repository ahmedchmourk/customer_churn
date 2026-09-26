/**
 * Semantic-model types. These mirror the JSON contract written by
 * `scripts/analytical_engine.py` (customers.json + model.json).
 */

export type AgeTier = "18-29" | "30-39" | "40-49" | "50-59" | "60+";
export type RiskTier = "Low" | "Medium" | "High" | "Critical" | "Churned";
export type ValueTier = "Bronze" | "Silver" | "Gold" | "Platinum";

/** One row of the enriched customer fact table. */
export interface Customer {
  id: string;
  age: number;
  ageTier: AgeTier;
  gender: "Male" | "Female";
  geography: string;
  creditScore: number;
  tenure: number;
  tenureMonths: number;
  cohortYear: number;
  balance: number;
  products: number;
  hasCrCard: 0 | 1;
  isActive: 0 | 1;
  salary: number;
  txnFreq: number;
  txnDecay: number;
  balanceChange: number;
  complaints: number;
  churned: 0 | 1;
  churnProb: number;
  riskTier: RiskTier;
  valueTier: ValueTier;
  annualRevenue: number;
  ltv: number;
  atRiskRevenue: number;
  action: string;
  saveRate: number;
  actionCost: number;
}

export interface HypothesisTest {
  test: "Chi-Square" | "Welch t-test";
  feature: string;
  label: string;
  statistic: number;
  dof: number | null;
  p_value: number;
  p_value_adj: number;
  significant: boolean;
  effect_size: number;
  effect_metric: "Cramer's V" | "Cohen's d";
  churn_rate_by_level?: Record<string, number>;
  mean_churned?: number;
  mean_retained?: number;
}

export interface SurvivalPoint {
  t: number;
  s: number;
  lo: number;
  hi: number;
}

export interface SurvivalCurve {
  label: string;
  n: number;
  events: number;
  median_survival_months: number | null;
  retention_12m: number;
  retention_36m: number;
  retention_60m: number;
  points: SurvivalPoint[];
}

export interface SurvivalSegment {
  curves: SurvivalCurve[];
  logrank_p: number | null;
  logrank_statistic?: number;
}

export interface AnalyticsModel {
  meta: {
    generated_at: string;
    source: string;
    rows: number;
    attrition_rate: number;
    engine_version: string;
  };
  assumptions: Record<string, number | string>;
  hypothesis_tests: HypothesisTest[];
  survival: Record<string, SurvivalSegment>;
  propensity_model: {
    algorithm: string;
    validation: string;
    roc_auc: number;
    pr_auc: number;
    base_rate: number;
    coefficients: { feature: string; coefficient: number; odds_ratio: number }[];
  };
}

export interface Dataset {
  customers: Customer[];
  model: AnalyticsModel;
}
