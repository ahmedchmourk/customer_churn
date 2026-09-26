"""
analytical_engine.py
====================

Retail-bank churn & LTV analytics engine for the real-world Kaggle
"Bank Customer Churn" dataset (radheshyamkollipara/bank-customer-churn).
Reads the raw extract, runs the statistical workload, and publishes the
semantic model consumed by the dashboard.

Pipeline
--------
0. Ingestion & data quality  Schema mapping, null / duplicate / range checks.
1. Feature engineering       Age tiers, tenure in months, revenue attribution.
2. Leakage audit             Single-feature ROC-AUC per column; anything that
                             predicts churn near-perfectly on its own (e.g.
                             `Complain`) is flagged and excluded from modelling.
3. Hypothesis testing        Chi-square (categorical drivers) and Welch t-tests
                             (continuous drivers), with Cramer's V / Cohen's d
                             effect sizes and Bonferroni-adjusted p-values.
4. Survival analysis         Kaplan-Meier retention curves (lifelines) over tenure,
                             overall and by segment, plus multivariate log-rank tests.
5. Propensity model          Logistic regression vs. gradient boosting, compared on
                             5-fold stratified out-of-fold predictions; the better
                             model scores every customer on data it never saw.
6. LTV & risk scoring        Margin-based LTV with a retention-adjusted perpetuity,
                             at-risk revenue, risk / value tiers and next-best-action
                             retention recommendations.

Outputs
-------
- <data-dir>/customers.json               Row-level enriched fact table (dashboard)
- <data-dir>/model.json                   Tests, survival curves, model diagnostics
- data/processed/customers_enriched.csv   Analyst-friendly flat export

Usage
-----
    python scripts/fetch_kaggle_data.py
    python scripts/analytical_engine.py
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
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "data" / "raw" / "Customer-Churn-Records.csv"
DEFAULT_DATA_DIR = REPO_ROOT / "app" / "data"
DEFAULT_CSV_EXPORT = REPO_ROOT / "data" / "processed" / "customers_enriched.csv"

DATASET_NAME = "Bank Customer Churn (Kaggle · radheshyamkollipara)"
DATASET_URL = "https://www.kaggle.com/datasets/radheshyamkollipara/bank-customer-churn"

ALPHA = 0.05
LEAKAGE_AUC = 0.95  # a single raw column this predictive is almost certainly post-outcome

# ---- Financial assumptions (documented in model.json -> assumptions) ----------
NET_INTEREST_MARGIN = 0.021      # earned on deposit balances
FEE_PER_PRODUCT = 85.0           # annual account / product fees
CARD_FEES = {"SILVER": 90.0, "GOLD": 150.0, "PLATINUM": 220.0, "DIAMOND": 300.0}
INACTIVE_CARD_FACTOR = 0.5       # interchange falls when the member is inactive
PAYROLL_FLOW_YIELD = 0.0035      # float / cross-sell yield on salary inflows
CONTRIBUTION_MARGIN = 0.62       # after cost-to-serve
DISCOUNT_RATE = 0.10
MAX_RETENTION = 0.97

AGE_BINS = [0, 29, 39, 49, 59, 200]
AGE_LABELS = ["18-29", "30-39", "40-49", "50-59", "60+"]

# Raw Kaggle column -> engine column
COLUMN_MAP = {
    "CustomerId": "Customer_ID",
    "Exited": "Churn_Status",
    "Complain": "Complain",
    "Satisfaction Score": "Satisfaction_Score",
    "Card Type": "Card_Type",
    "Point Earned": "Points_Earned",
}
DROP_COLUMNS = ["RowNumber", "Surname"]  # row index + personal name: no analytical value

CATEGORICAL_DRIVERS = {
    "Geography": "Geography",
    "Gender": "Gender",
    "Age_Tier": "Age Tier",
    "NumOfProducts": "Number of Products",
    "IsActiveMember": "Active Member Status",
    "HasCrCard": "Has Credit Card",
    "Card_Type": "Card Type",
    "Satisfaction_Score": "Satisfaction Score",
    "Complain": "Complaint Logged",
}
CONTINUOUS_DRIVERS = {
    "Age": "Age",
    "Balance": "Account Balance",
    "CreditScore": "Credit Score",
    "EstimatedSalary": "Estimated Salary",
    "Tenure": "Tenure (Years)",
    "Points_Earned": "Loyalty Points Earned",
}


# =============================================================================
# 0. Ingestion & data quality
# =============================================================================
def load_and_validate(path: Path) -> tuple[pd.DataFrame, dict[str, Any]]:
    raw = pd.read_csv(path)
    df = raw.drop(columns=[c for c in DROP_COLUMNS if c in raw.columns]).rename(columns=COLUMN_MAP)
    df["Customer_ID"] = df["Customer_ID"].astype(str)
    df["Card_Type"] = df["Card_Type"].str.upper().str.strip()

    checks = {
        "rows": int(len(df)),
        "columns": int(raw.shape[1]),
        "null_cells": int(raw.isna().sum().sum()),
        "duplicate_customer_ids": int(df["Customer_ID"].duplicated().sum()),
        "age_out_of_range": int((~df["Age"].between(18, 100)).sum()),
        "credit_score_out_of_range": int((~df["CreditScore"].between(300, 900)).sum()),
        "negative_balances": int((df["Balance"] < 0).sum()),
        "zero_balance_share": round(float((df["Balance"] == 0).mean()), 4),
        "dropped_columns": DROP_COLUMNS,
    }
    checks["passed"] = checks["null_cells"] == 0 and checks["duplicate_customer_ids"] == 0 and checks["negative_balances"] == 0
    df = df.drop_duplicates("Customer_ID").dropna().reset_index(drop=True)
    return df, checks


# =============================================================================
# 1. Feature engineering
# =============================================================================
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["Age_Tier"] = pd.cut(df["Age"], bins=AGE_BINS, labels=AGE_LABELS).astype(str)
    # Tenure is recorded in whole years; year 0 means < 12 months, so place it mid-year.
    df["Tenure_Months"] = np.where(df["Tenure"] == 0, 6, df["Tenure"] * 12).astype(int)
    df["Zero_Balance"] = (df["Balance"] == 0).astype(int)

    card_fee = df["Card_Type"].map(CARD_FEES).fillna(0.0)
    card_revenue = df["HasCrCard"] * card_fee * np.where(df["IsActiveMember"] == 1, 1.0, INACTIVE_CARD_FACTOR)
    df["Annual_Revenue"] = (
        df["Balance"] * NET_INTEREST_MARGIN
        + df["NumOfProducts"] * FEE_PER_PRODUCT
        + card_revenue
        + df["EstimatedSalary"] * PAYROLL_FLOW_YIELD
    ).round(2)
    return df


# =============================================================================
# 2. Target-leakage audit
# =============================================================================
def leakage_audit(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Single-feature ROC-AUC (direction-agnostic) for every candidate predictor."""
    y = df["Churn_Status"].to_numpy()
    out = []
    for col in list(CATEGORICAL_DRIVERS) + list(CONTINUOUS_DRIVERS):
        x = df[col]
        if x.dtype == object:
            x = x.map(df.groupby(col)["Churn_Status"].mean())  # target-rate encoding
        auc = roc_auc_score(y, x.astype(float))
        auc = max(auc, 1 - auc)
        out.append({"feature": col, "single_feature_auc": round(float(auc), 4), "leakage": bool(auc >= LEAKAGE_AUC)})
    return sorted(out, key=lambda r: r["single_feature_auc"], reverse=True)


# =============================================================================
# 3. Statistical hypothesis testing
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


def hypothesis_testing(df: pd.DataFrame, leaky: set[str]) -> list[dict[str, Any]]:
    results = chi_square_tests(df) + t_tests(df)
    m = len(results)
    for r in results:
        r["p_value_adj"] = min(1.0, r["p_value"] * m)  # Bonferroni family-wise correction
        r["significant"] = bool(r["p_value_adj"] < ALPHA)
        r["leakage"] = r["feature"] in leaky
        r["p_value"] = _safe_p(r["p_value"])
        r["p_value_adj"] = _safe_p(r["p_value_adj"])
    # Leaky columns go last: they're a data-quality finding, not a churn driver.
    return sorted(results, key=lambda r: (r["leakage"], -abs(r["effect_size"])))


def _safe_p(p: float) -> float:
    """JSON-safe p-value (floats underflow to 0.0 for extremely strong effects)."""
    return float(max(p, 1e-300))


# =============================================================================
# 4. Kaplan-Meier survival analysis
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
        "Gender": df["Gender"],
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
# 5. Churn propensity models
# =============================================================================
MODEL_NUMERIC = [
    "Age", "Age_Sq", "CreditScore", "Balance", "Zero_Balance", "EstimatedSalary", "Tenure",
    "HasCrCard", "IsActiveMember", "Satisfaction_Score", "Points_Earned",
]
MODEL_CATEGORICAL = ["Geography", "Gender", "NumOfProducts", "Card_Type"]


def _model_frame(df: pd.DataFrame) -> pd.DataFrame:
    X = df[[c for c in MODEL_NUMERIC if c != "Age_Sq"] + MODEL_CATEGORICAL].copy()
    X["Age_Sq"] = (df["Age"] - 40) ** 2  # churn risk peaks in middle age -> quadratic term
    return X[MODEL_NUMERIC + MODEL_CATEGORICAL]


def propensity_model(df: pd.DataFrame, leaky: set[str], seed: int = 42) -> tuple[np.ndarray, dict[str, Any]]:
    excluded = sorted(leaky)
    assert not (set(MODEL_NUMERIC + MODEL_CATEGORICAL) & leaky), "leaky feature in model inputs"
    X = _model_frame(df)
    y = df["Churn_Status"].to_numpy()
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)

    candidates = {
        "Logistic Regression": Pipeline(
            [
                ("prep", ColumnTransformer([
                    ("num", StandardScaler(), MODEL_NUMERIC),
                    ("cat", OneHotEncoder(handle_unknown="ignore", drop="first"), MODEL_CATEGORICAL),
                ])),
                ("clf", LogisticRegression(C=0.5, max_iter=3000)),
            ]
        ),
        "Gradient Boosting": Pipeline(
            [
                ("prep", ColumnTransformer([
                    ("num", "passthrough", MODEL_NUMERIC),
                    ("cat", OneHotEncoder(handle_unknown="ignore"), MODEL_CATEGORICAL),
                ])),
                ("clf", HistGradientBoostingClassifier(
                    learning_rate=0.05, max_iter=300, max_leaf_nodes=15, min_samples_leaf=40,
                    l2_regularization=1.0, random_state=seed,
                )),
            ]
        ),
    }

    comparison, oof = [], {}
    for name, pipe in candidates.items():
        proba = cross_val_predict(pipe, X, y, cv=cv, method="predict_proba")[:, 1]
        oof[name] = proba
        comparison.append({
            "model": name,
            "roc_auc": round(float(roc_auc_score(y, proba)), 4),
            "pr_auc": round(float(average_precision_score(y, proba)), 4),
            "brier": round(float(brier_score_loss(y, proba)), 4),
        })
    best = max(comparison, key=lambda r: r["roc_auc"])

    # Interpretability: odds ratios from the logistic model ...
    lr = candidates["Logistic Regression"].fit(X, y)
    names = lr.named_steps["prep"].get_feature_names_out()
    coefficients = sorted(
        (
            {"feature": n.replace("num__", "").replace("cat__", ""), "coefficient": round(float(c), 4), "odds_ratio": round(float(np.exp(c)), 4)}
            for n, c in zip(names, lr.named_steps["clf"].coef_[0])
        ),
        key=lambda d: abs(d["coefficient"]),
        reverse=True,
    )
    # ... and permutation importance (drop in ROC-AUC) for the scoring model.
    scorer = candidates[best["model"]].fit(X, y)
    perm = permutation_importance(scorer, X, y, scoring="roc_auc", n_repeats=5, random_state=seed)
    importance = sorted(
        ({"feature": c, "importance": round(float(m), 4)} for c, m in zip(X.columns, perm.importances_mean)),
        key=lambda d: d["importance"],
        reverse=True,
    )

    diagnostics = {
        "algorithm": f"{best['model']} (selected by out-of-fold ROC-AUC)",
        "validation": "5-fold stratified cross-validation (out-of-fold scoring)",
        "roc_auc": best["roc_auc"],
        "pr_auc": best["pr_auc"],
        "base_rate": round(float(y.mean()), 4),
        "comparison": comparison,
        "excluded_features": excluded,
        "coefficients": coefficients,
        "permutation_importance": importance,
    }
    return oof[best["model"]], diagnostics


# =============================================================================
# 6. LTV, risk scoring & next-best-action
# =============================================================================
def _ltv(annual_margin: pd.Series, retention: pd.Series) -> pd.Series:
    """Retention-adjusted perpetuity: LTV = m * r / (1 + d - r)."""
    r = retention.clip(0.05, MAX_RETENTION)
    return annual_margin * r / (1 + DISCOUNT_RATE - r)


def recommend_action(row: pd.Series) -> tuple[str, float, float]:
    """Rule-based next-best-action -> (action, expected save rate, cost per account)."""
    if row["NumOfProducts"] >= 3:
        return "Product Rationalisation Review", 0.30, 150.0
    if row["Complain"] == 1:
        return "Priority Complaint Resolution + Goodwill Credit", 0.38, 120.0
    if row["Balance"] >= 100_000 and row["IsActiveMember"] == 0:
        return "Premium Savings Rate (+0.75% APY)", 0.42, 0.0075 * row["Balance"]
    if row["IsActiveMember"] == 0:
        return "Relationship Manager Re-engagement Call", 0.33, 85.0
    if row["Age"] >= 50 and row["Balance"] > 0:
        return "Wealth & Retirement Advisory Session", 0.35, 200.0
    if row["NumOfProducts"] == 1:
        return "Bundle Cross-Sell with 12-Month Fee Waiver", 0.28, 110.0
    if row["Satisfaction_Score"] <= 2:
        return "Service Recovery Call", 0.25, 40.0
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
            "balance": df["Balance"].round(0),
            "products": df["NumOfProducts"],
            "hasCrCard": df["HasCrCard"],
            "isActive": df["IsActiveMember"],
            "salary": df["EstimatedSalary"].round(0),
            "complain": df["Complain"],
            "satisfaction": df["Satisfaction_Score"],
            "cardType": df["Card_Type"].str.title(),
            "points": df["Points_Earned"],
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

    if not args.input.exists():
        raise SystemExit(f"[engine] {args.input} not found - run: python scripts/fetch_kaggle_data.py")

    df, quality = load_and_validate(args.input)
    print(f"[engine] loaded {quality['rows']:,} rows from {args.input.name} · quality checks passed={quality['passed']}")

    df = engineer_features(df)

    print("[engine] auditing for target leakage...")
    leakage = leakage_audit(df)
    leaky = {r["feature"] for r in leakage if r["leakage"]}
    for r in leakage:
        if r["leakage"]:
            print(f"[engine]   LEAKAGE: {r['feature']} alone reaches ROC-AUC {r['single_feature_auc']:.3f} -> excluded from model")

    print("[engine] running hypothesis tests (chi-square, Welch t)...")
    tests = hypothesis_testing(df, leaky)

    print("[engine] fitting Kaplan-Meier survival curves...")
    survival = survival_analysis(df)

    print("[engine] comparing churn propensity models (5-fold OOF)...")
    proba, diagnostics = propensity_model(df, leaky, seed=args.seed)
    for row in diagnostics["comparison"]:
        print(f"[engine]   {row['model']:<20} ROC-AUC={row['roc_auc']:.3f}  PR-AUC={row['pr_auc']:.3f}  Brier={row['brier']:.3f}")
    print(f"[engine]   selected: {diagnostics['algorithm']}")

    print("[engine] scoring LTV, risk tiers and retention actions...")
    scored = score_customers(df, proba)

    args.data_dir.mkdir(parents=True, exist_ok=True)
    args.csv_export.parent.mkdir(parents=True, exist_ok=True)
    scored.to_csv(args.csv_export, index=False)

    model = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": args.input.name,
            "dataset": DATASET_NAME,
            "dataset_url": DATASET_URL,
            "rows": int(len(scored)),
            "attrition_rate": round(float(scored["Churn_Status"].mean()), 4),
            "engine_version": "2.0.0",
        },
        "data_quality": quality,
        "leakage_audit": leakage,
        "assumptions": {
            "net_interest_margin": NET_INTEREST_MARGIN,
            "fee_per_product": FEE_PER_PRODUCT,
            "card_fees": CARD_FEES,
            "inactive_card_factor": INACTIVE_CARD_FACTOR,
            "payroll_flow_yield": PAYROLL_FLOW_YIELD,
            "contribution_margin": CONTRIBUTION_MARGIN,
            "discount_rate": DISCOUNT_RATE,
            "max_retention": MAX_RETENTION,
            "ltv_formula": "LTV = annual_margin * r / (1 + d - r), r = 1 - churn_probability",
            "tenure_months": "Tenure (whole years) x 12; tenure 0 mapped to 6 months",
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
