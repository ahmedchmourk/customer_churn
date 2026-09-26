"""
analytical_engine.py
====================

Retail-bank churn & LTV analytics engine. Reads the raw customer extract, runs the
statistical workload, and publishes the semantic model consumed by the dashboard.

Pipeline
--------
1. Feature engineering    Age tiers, join cohorts, revenue attribution.
2. Hypothesis testing     Chi-square (categorical drivers) and Welch t-tests
                          (continuous drivers), with Cramer's V / Cohen's d effect
                          sizes and Bonferroni-adjusted p-values.
3. Survival analysis      Kaplan-Meier retention curves (lifelines) overall and by
                          segment, plus multivariate log-rank tests.
4. Propensity model       Regularised logistic regression; churn probabilities are
                          produced *out-of-fold* (5-fold CV) so that every score is
                          an honest, unseen-data prediction.
5. LTV & risk scoring     Margin-based LTV with a retention-adjusted perpetuity,
                          at-risk revenue, risk / value tiers and next-best-action
                          retention recommendations.

Outputs
-------
- <data-dir>/customers.json          Row-level enriched fact table (dashboard)
- <data-dir>/model.json              Tests, survival curves, model diagnostics
- data/processed/customers_enriched.csv   Analyst-friendly flat export

Usage
-----
    python scripts/analytical_engine.py
    python scripts/analytical_engine.py --input data/raw/bank_customers.csv --data-dir app/data
"""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from lifelines import KaplanMeierFitter
from lifelines.statistics import multivariate_logrank_test
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "data" / "raw" / "bank_customers.csv"
DEFAULT_DATA_DIR = REPO_ROOT / "app" / "data"
DEFAULT_CSV_EXPORT = REPO_ROOT / "data" / "processed" / "customers_enriched.csv"

ALPHA = 0.05

# ---- Financial assumptions (documented in model.json -> assumptions) ----------
NET_INTEREST_MARGIN = 0.021      # earned on deposit balances
FEE_PER_PRODUCT = 85.0           # annual account / product fees
CARD_REVENUE_ACTIVE = 210.0      # interchange + card fees, active card users
CARD_REVENUE_INACTIVE = 90.0
PAYROLL_FLOW_YIELD = 0.0035      # float / cross-sell yield on salary inflows
CONTRIBUTION_MARGIN = 0.62       # after cost-to-serve
DISCOUNT_RATE = 0.10
MAX_RETENTION = 0.97

AGE_BINS = [0, 29, 39, 49, 59, 200]
AGE_LABELS = ["18-29", "30-39", "40-49", "50-59", "60+"]

CATEGORICAL_DRIVERS = {
    "Geography": "Geography",
    "Gender": "Gender",
    "Age_Tier": "Age Tier",
    "NumOfProducts": "Number of Products",
    "IsActiveMember": "Active Member Status",
    "HasCrCard": "Has Credit Card",
    "Complaints_Flag": "Complaint Logged (12M)",
}
CONTINUOUS_DRIVERS = {
    "Age": "Age",
    "CreditScore": "Credit Score",
    "Balance": "Account Balance",
    "EstimatedSalary": "Estimated Salary",
    "Tenure_Months": "Tenure (Months)",
    "Transaction_Decay_Score": "Transaction Decay Score",
    "Monthly_Txn_Count": "Monthly Transaction Count",
    "Balance_Change_90d_Pct": "90-Day Balance Change",
}


# =============================================================================
# 1. Feature engineering
# =============================================================================
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Age_Tier"] = pd.cut(df["Age"], bins=AGE_BINS, labels=AGE_LABELS).astype(str)
    df["Cohort_Year"] = pd.to_datetime(df["Join_Date"]).dt.year
    df["Complaints_Flag"] = (df["Complaints_12M"] > 0).astype(int)

    card_revenue = np.where(df["IsActiveMember"] == 1, CARD_REVENUE_ACTIVE, CARD_REVENUE_INACTIVE)
    df["Annual_Revenue"] = (
        df["Balance"] * NET_INTEREST_MARGIN
        + df["NumOfProducts"] * FEE_PER_PRODUCT
        + df["HasCrCard"] * card_revenue
        + df["EstimatedSalary"] * PAYROLL_FLOW_YIELD
    ).round(2)
    return df


# =============================================================================
# 2. Statistical hypothesis testing
# =============================================================================
def chi_square_tests(df: pd.DataFrame) -> list[dict[str, Any]]:
    """H0: churn is independent of the categorical driver."""
    results = []
    for col, label in CATEGORICAL_DRIVERS.items():
        table = pd.crosstab(df[col], df["Churn_Status"])
        chi2, p, dof, _ = stats.chi2_contingency(table)
        n = table.to_numpy().sum()
        cramers_v = math.sqrt(chi2 / (n * (min(table.shape) - 1)))
        rates = df.groupby(col)["Churn_Status"].mean()
        results.append(
            {
                "test": "Chi-Square",
                "feature": col,
                "label": label,
                "statistic": round(float(chi2), 3),
                "dof": int(dof),
                "p_value": float(p),
                "effect_size": round(cramers_v, 4),
                "effect_metric": "Cramer's V",
                "churn_rate_by_level": {str(k): round(float(v), 4) for k, v in rates.items()},
            }
        )
    return results


def t_tests(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Welch's t-test. H0: churned and retained customers have equal means."""
    results = []
    churned = df[df["Churn_Status"] == 1]
    retained = df[df["Churn_Status"] == 0]
    for col, label in CONTINUOUS_DRIVERS.items():
        a, b = churned[col].to_numpy(float), retained[col].to_numpy(float)
        t_stat, p = stats.ttest_ind(a, b, equal_var=False)
        pooled_sd = math.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2))
        cohens_d = (a.mean() - b.mean()) / pooled_sd if pooled_sd else 0.0
        results.append(
            {
                "test": "Welch t-test",
                "feature": col,
                "label": label,
                "statistic": round(float(t_stat), 3),
                "dof": None,
                "p_value": float(p),
                "effect_size": round(float(cohens_d), 4),
                "effect_metric": "Cohen's d",
                "mean_churned": round(float(a.mean()), 4),
                "mean_retained": round(float(b.mean()), 4),
            }
        )
    return results


def hypothesis_testing(df: pd.DataFrame) -> list[dict[str, Any]]:
    results = chi_square_tests(df) + t_tests(df)
    m = len(results)
    for r in results:
        r["p_value_adj"] = min(1.0, r["p_value"] * m)  # Bonferroni family-wise correction
        r["significant"] = bool(r["p_value_adj"] < ALPHA)
        r["p_value"] = _safe_p(r["p_value"])
        r["p_value_adj"] = _safe_p(r["p_value_adj"])
    return sorted(results, key=lambda r: abs(r["effect_size"]), reverse=True)


def _safe_p(p: float) -> float:
    """JSON-safe p-value (floats underflow to 0.0 for extremely strong effects)."""
    return float(max(p, 1e-300))


# =============================================================================
# 3. Kaplan-Meier survival analysis
# =============================================================================
def _km_curve(durations: pd.Series, events: pd.Series, label: str) -> dict[str, Any]:
    kmf = KaplanMeierFitter(label=label)
    timeline = np.arange(0, 121, 1)
    kmf.fit(durations, event_observed=events, timeline=timeline)
    sf = kmf.survival_function_.iloc[:, 0]
    ci = kmf.confidence_interval_survival_function_
    median = kmf.median_survival_time_
    return {
        "label": label,
        "n": int(len(durations)),
        "events": int(events.sum()),
        "median_survival_months": None if not np.isfinite(median) else float(median),
        "retention_12m": round(float(sf.loc[12]), 4),
        "retention_36m": round(float(sf.loc[36]), 4),
        "retention_60m": round(float(sf.loc[60]), 4),
        "points": [
            {
                "t": int(t),
                "s": round(float(sf.loc[t]), 4),
                "lo": round(float(ci.iloc[i, 0]), 4),
                "hi": round(float(ci.iloc[i, 1]), 4),
            }
            for i, t in enumerate(timeline)
            if t % 3 == 0  # quarterly resolution keeps the payload light
        ],
    }


def survival_analysis(df: pd.DataFrame) -> dict[str, Any]:
    T, E = df["Tenure_Months"], df["Churn_Status"]
    segments: dict[str, Any] = {"Overall": {"curves": [_km_curve(T, E, "All Customers")], "logrank_p": None}}

    segment_defs = {
        "Active Status": df["IsActiveMember"].map({1: "Active", 0: "Inactive"}),
        "Geography": df["Geography"],
        "Products": df["NumOfProducts"].map(lambda k: f"{k} Product" + ("s" if k > 1 else "")),
        "Age Tier": df["Age_Tier"],
    }
    for name, groups in segment_defs.items():
        curves = [_km_curve(T[groups == g], E[groups == g], str(g)) for g in sorted(groups.unique())]
        lr = multivariate_logrank_test(T, groups, E)
        segments[name] = {
            "curves": curves,
            "logrank_p": _safe_p(float(lr.p_value)),
            "logrank_statistic": round(float(lr.test_statistic), 3),
        }
    return segments


# =============================================================================
# 4. Churn propensity model
# =============================================================================
MODEL_NUMERIC = [
    "Age", "CreditScore", "Balance", "EstimatedSalary", "Tenure_Months", "HasCrCard",
    "IsActiveMember", "Monthly_Txn_Count", "Transaction_Decay_Score", "Balance_Change_90d_Pct",
    "Complaints_12M",
]
MODEL_CATEGORICAL = ["Geography", "Gender", "NumOfProducts"]


def propensity_model(df: pd.DataFrame, seed: int = 42) -> tuple[np.ndarray, dict[str, Any]]:
    X = df[MODEL_NUMERIC + MODEL_CATEGORICAL]
    y = df["Churn_Status"].to_numpy()

    pipeline = Pipeline(
        [
            (
                "prep",
                ColumnTransformer(
                    [
                        ("num", StandardScaler(), MODEL_NUMERIC),
                        ("cat", OneHotEncoder(handle_unknown="ignore", drop="first"), MODEL_CATEGORICAL),
                    ]
                ),
            ),
            ("clf", LogisticRegression(C=0.5, max_iter=2000, class_weight=None)),
        ]
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    oof_proba = cross_val_predict(pipeline, X, y, cv=cv, method="predict_proba")[:, 1]

    pipeline.fit(X, y)
    names = pipeline.named_steps["prep"].get_feature_names_out()
    coefs = pipeline.named_steps["clf"].coef_[0]
    coefficients = sorted(
        (
            {
                "feature": n.replace("num__", "").replace("cat__", ""),
                "coefficient": round(float(c), 4),
                "odds_ratio": round(float(np.exp(c)), 4),
            }
            for n, c in zip(names, coefs)
        ),
        key=lambda d: abs(d["coefficient"]),
        reverse=True,
    )

    diagnostics = {
        "algorithm": "L2-regularised Logistic Regression (C=0.5), standardised features",
        "validation": "5-fold stratified cross-validation (out-of-fold scoring)",
        "roc_auc": round(float(roc_auc_score(y, oof_proba)), 4),
        "pr_auc": round(float(average_precision_score(y, oof_proba)), 4),
        "base_rate": round(float(y.mean()), 4),
        "coefficients": coefficients,
    }
    return oof_proba, diagnostics


# =============================================================================
# 5. LTV, risk scoring & next-best-action
# =============================================================================
def _ltv(annual_margin: pd.Series, retention: pd.Series) -> pd.Series:
    """Retention-adjusted perpetuity: LTV = m * r / (1 + d - r)."""
    r = retention.clip(0.05, MAX_RETENTION)
    return annual_margin * r / (1 + DISCOUNT_RATE - r)


def recommend_action(row: pd.Series) -> tuple[str, float, float]:
    """Rule-based next-best-action -> (action, expected save rate, cost per account)."""
    if row["NumOfProducts"] >= 3:
        return "Product Rationalisation Review", 0.30, 150.0
    if row["Complaints_12M"] >= 2:
        return "Priority Complaint Resolution + Goodwill Credit", 0.38, 120.0
    if row["Balance"] >= 100_000 and row["Balance_Change_90d_Pct"] <= -0.15:
        return "Premium Savings Rate (+0.75% APY)", 0.42, 0.0075 * row["Balance"]
    if row["IsActiveMember"] == 0 and row["Transaction_Decay_Score"] >= 0.5:
        return "Relationship Manager Re-engagement Call", 0.33, 85.0
    if row["Age"] >= 50 and row["Balance"] > 0:
        return "Wealth & Retirement Advisory Session", 0.35, 200.0
    if row["NumOfProducts"] == 1:
        return "Bundle Cross-Sell with 12-Month Fee Waiver", 0.28, 110.0
    if row["CreditScore"] < 580:
        return "Credit Health Programme + Fee Waiver", 0.22, 60.0
    return "Loyalty Rewards Boost", 0.20, 45.0


def score_customers(df: pd.DataFrame, churn_proba: np.ndarray) -> pd.DataFrame:
    df = df.copy()
    df["Churn_Probability"] = np.round(churn_proba, 4)

    annual_margin = df["Annual_Revenue"] * CONTRIBUTION_MARGIN
    active = df["Churn_Status"] == 0
    baseline_retention = 1 - df["Churn_Status"].mean()

    # Active customers: forward-looking LTV at their individual retention probability.
    # Churned customers: forfeited LTV they would have generated at the portfolio baseline.
    expected_ltv = _ltv(annual_margin, 1 - df["Churn_Probability"])
    forfeited_ltv = _ltv(annual_margin, pd.Series(baseline_retention, index=df.index))
    df["LTV"] = np.where(active, expected_ltv, forfeited_ltv).round(2)
    df["At_Risk_Revenue"] = np.where(active, df["Annual_Revenue"] * df["Churn_Probability"], 0.0).round(2)

    df["Risk_Tier"] = np.where(
        active,
        pd.cut(df["Churn_Probability"], [-0.01, 0.15, 0.35, 0.60, 1.01], labels=["Low", "Medium", "High", "Critical"]).astype(str),
        "Churned",
    )

    # Value tier reflects revenue contribution, independent of risk, so that
    # "high-value but at-risk" accounts can be identified (LTV itself is risk-adjusted).
    q = df["Annual_Revenue"].quantile([0.40, 0.70, 0.90]).to_numpy()
    df["Value_Tier"] = pd.cut(
        df["Annual_Revenue"], [-np.inf, q[0], q[1], q[2], np.inf], labels=["Bronze", "Silver", "Gold", "Platinum"]
    ).astype(str)

    actions = df.apply(recommend_action, axis=1, result_type="expand")
    df["Recommended_Action"] = actions[0]
    df["Expected_Save_Rate"] = actions[1].round(3)
    df["Action_Cost"] = actions[2].round(2)
    df["Priority_Score"] = (df["Churn_Probability"] * df["LTV"]).where(active, 0.0).round(2)
    return df


# =============================================================================
# Export
# =============================================================================
def to_dashboard_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Compact camelCase fact table for the web client."""
    out = pd.DataFrame(
        {
            "id": df["Customer_ID"],
            "age": df["Age"],
            "ageTier": df["Age_Tier"],
            "gender": df["Gender"],
            "geography": df["Geography"],
            "creditScore": df["CreditScore"],
            "tenure": df["Tenure"],
            "tenureMonths": df["Tenure_Months"],
            "cohortYear": df["Cohort_Year"],
            "balance": df["Balance"].round(0),
            "products": df["NumOfProducts"],
            "hasCrCard": df["HasCrCard"],
            "isActive": df["IsActiveMember"],
            "salary": df["EstimatedSalary"].round(0),
            "txnFreq": df["Monthly_Txn_Count"],
            "txnDecay": df["Transaction_Decay_Score"].round(3),
            "balanceChange": df["Balance_Change_90d_Pct"].round(3),
            "complaints": df["Complaints_12M"],
            "churned": df["Churn_Status"],
            "churnProb": df["Churn_Probability"].round(3),
            "riskTier": df["Risk_Tier"],
            "valueTier": df["Value_Tier"],
            "annualRevenue": df["Annual_Revenue"].round(0),
            "ltv": df["LTV"].round(0),
            "atRiskRevenue": df["At_Risk_Revenue"].round(0),
            "action": df["Recommended_Action"],
            "saveRate": df["Expected_Save_Rate"],
            "actionCost": df["Action_Cost"].round(0),
        }
    )
    records = out.to_dict(orient="records")
    # Convert numpy scalars -> native Python so json.dump stays lossless & compact.
    return [{k: (v.item() if hasattr(v, "item") else v) for k, v in r.items()} for r in records]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="dashboard JSON output dir")
    parser.add_argument("--csv-export", type=Path, default=DEFAULT_CSV_EXPORT)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    raw = pd.read_csv(args.input)
    print(f"[engine] loaded {len(raw):,} rows from {args.input}")

    df = engineer_features(raw)

    print("[engine] running hypothesis tests (chi-square, Welch t)...")
    tests = hypothesis_testing(df)

    print("[engine] fitting Kaplan-Meier survival curves...")
    survival = survival_analysis(df)

    print("[engine] training churn propensity model (5-fold OOF)...")
    proba, diagnostics = propensity_model(df, seed=args.seed)
    print(f"[engine]   ROC-AUC={diagnostics['roc_auc']:.3f}  PR-AUC={diagnostics['pr_auc']:.3f}")

    print("[engine] scoring LTV, risk tiers and retention actions...")
    scored = score_customers(df, proba)

    args.data_dir.mkdir(parents=True, exist_ok=True)
    args.csv_export.parent.mkdir(parents=True, exist_ok=True)
    scored.to_csv(args.csv_export, index=False)

    model = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": str(args.input.name),
            "rows": int(len(scored)),
            "attrition_rate": round(float(scored["Churn_Status"].mean()), 4),
            "engine_version": "1.0.0",
        },
        "assumptions": {
            "net_interest_margin": NET_INTEREST_MARGIN,
            "fee_per_product": FEE_PER_PRODUCT,
            "card_revenue_active": CARD_REVENUE_ACTIVE,
            "card_revenue_inactive": CARD_REVENUE_INACTIVE,
            "payroll_flow_yield": PAYROLL_FLOW_YIELD,
            "contribution_margin": CONTRIBUTION_MARGIN,
            "discount_rate": DISCOUNT_RATE,
            "max_retention": MAX_RETENTION,
            "ltv_formula": "LTV = annual_margin * r / (1 + d - r), r = 1 - churn_probability",
        },
        "hypothesis_tests": tests,
        "survival": survival,
        "propensity_model": diagnostics,
    }

    with open(args.data_dir / "model.json", "w") as f:
        json.dump(model, f, indent=2)
    with open(args.data_dir / "customers.json", "w") as f:
        json.dump(to_dashboard_rows(scored), f, separators=(",", ":"))

    print(f"[engine] wrote {args.data_dir / 'model.json'}")
    print(f"[engine] wrote {args.data_dir / 'customers.json'}")
    print(f"[engine] wrote {args.csv_export}")
    print(scored.groupby("Risk_Tier")["Customer_ID"].count().to_string())


if __name__ == "__main__":
    main()
