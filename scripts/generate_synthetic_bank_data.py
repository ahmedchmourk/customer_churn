"""
generate_synthetic_bank_data.py
===============================

Generates a realistic, *survival-consistent* synthetic retail-bank customer base.

Unlike a naive generator that flips a biased coin for churn, this script simulates
each customer's relationship over time:

1. Every customer receives a join date within the last 10 years (the observation
   window) and a set of demographic / product attributes.
2. A latent log-hazard is built from well-known churn drivers (inactivity,
   product over-/under-holding, age, geography, gender, credit quality).
3. A Weibull time-to-churn is sampled from that hazard. If the churn time falls
   inside the customer's observed tenure the customer is churned; otherwise the
   customer is right-censored (still active at the snapshot date).
4. Behavioural *leading indicators* (transaction decay, 90-day balance change,
   complaints) are generated conditional on the outcome, as they would be
   observed in the months before attrition.

The baseline hazard is calibrated with a bisection search so the portfolio-level
attrition rate lands on ``--target-churn`` (default 20.4%, the retail-banking
benchmark used in the well-known Kaggle "Bank Customer Churn" dataset).

Usage
-----
    python scripts/generate_synthetic_bank_data.py --n 10000 --seed 42
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "data" / "raw" / "bank_customers.csv"
SNAPSHOT_DATE = pd.Timestamp("2026-06-30")
OBSERVATION_MONTHS = 120  # 10-year window
WEIBULL_SHAPE = 1.25  # >1 => hazard rises with tenure-age of relationship


@dataclass(frozen=True)
class GeneratorConfig:
    n_customers: int = 10_000
    seed: int = 42
    target_churn: float = 0.204


def _latent_log_hazard(df: pd.DataFrame, rng: np.random.Generator) -> np.ndarray:
    """Linear predictor of the (log) churn hazard; higher => churns sooner."""
    age = df["Age"].to_numpy()
    # Churn risk rises through the 40s-50s and falls again for retirees.
    age_effect = 0.065 * (age - 38) - 0.0022 * np.clip(age - 58, 0, None) ** 2

    geo_effect = df["Geography"].map({"France": 0.0, "Spain": 0.05, "Germany": 0.78}).to_numpy()
    gender_effect = np.where(df["Gender"] == "Female", 0.42, 0.0)
    inactive_effect = np.where(df["IsActiveMember"] == 0, 0.95, 0.0)
    # Two products is the "sweet spot"; 3-4 product holders are often mis-sold.
    product_effect = df["NumOfProducts"].map({1: 0.0, 2: -1.25, 3: 1.95, 4: 3.4}).to_numpy()
    balance_effect = np.where(df["Balance"] > 0, 0.28, 0.0)
    credit_effect = -0.0009 * (df["CreditScore"].to_numpy() - 650)
    card_effect = np.where(df["HasCrCard"] == 1, -0.06, 0.0)
    noise = rng.normal(0, 0.35, len(df))

    return (
        age_effect
        + geo_effect
        + gender_effect
        + inactive_effect
        + product_effect
        + balance_effect
        + credit_effect
        + card_effect
        + noise
    )


def _simulate_churn_times(eta: np.ndarray, baseline_scale: float, u: np.ndarray) -> np.ndarray:
    """Inverse-CDF sample of a proportional-hazards Weibull time-to-churn (months)."""
    scale = baseline_scale * np.exp(-eta / WEIBULL_SHAPE)
    return scale * (-np.log(u)) ** (1.0 / WEIBULL_SHAPE)


def _calibrate_scale(eta: np.ndarray, months_observed: np.ndarray, u: np.ndarray, target: float) -> float:
    """Bisection on the Weibull baseline scale so that P(churn in window) == target."""
    lo, hi = 1.0, 1e6
    for _ in range(100):
        mid = np.sqrt(lo * hi)  # geometric bisection: scale spans orders of magnitude
        churn_rate = (_simulate_churn_times(eta, mid, u) < months_observed).mean()
        if churn_rate > target:
            lo = mid  # too much churn -> lengthen lifetimes
        else:
            hi = mid
    return float(np.sqrt(lo * hi))


def generate(config: GeneratorConfig) -> pd.DataFrame:
    rng = np.random.default_rng(config.seed)
    n = config.n_customers

    df = pd.DataFrame(
        {
            "Customer_ID": [f"CUST-{100001 + i}" for i in range(n)],
            "Geography": rng.choice(["France", "Germany", "Spain"], n, p=[0.50, 0.25, 0.25]),
            "Gender": rng.choice(["Male", "Female"], n, p=[0.545, 0.455]),
            "Age": np.clip(np.round(18 + rng.gamma(shape=4.2, scale=5.0, size=n)), 18, 92).astype(int),
            "CreditScore": np.clip(np.round(rng.normal(650, 96, n)), 350, 850).astype(int),
            "NumOfProducts": rng.choice([1, 2, 3, 4], n, p=[0.508, 0.459, 0.027, 0.006]),
            "HasCrCard": rng.binomial(1, 0.706, n),
            "IsActiveMember": rng.binomial(1, 0.515, n),
            "EstimatedSalary": np.round(np.clip(rng.lognormal(np.log(72_000), 0.55, n), 12_000, 650_000), 2),
        }
    )

    # Balance: ~36% of retail customers hold transactional accounts with zero balance;
    # German customers are almost never zero-balance (matches the classic benchmark).
    zero_prob = df["Geography"].map({"France": 0.48, "Spain": 0.48, "Germany": 0.0}).to_numpy()
    has_balance = rng.uniform(size=n) > zero_prob
    # Deposit wealth is heavily right-skewed in real retail books (log-normal).
    balances = np.clip(rng.lognormal(mean=np.log(88_000), sigma=0.8, size=n), 2_500, 2_500_000)
    df["Balance"] = np.round(np.where(has_balance, balances, 0.0), 2)

    # Relationship start: uniform over the 10-year observation window.
    months_observed = rng.integers(1, OBSERVATION_MONTHS + 1, n)

    # ---- Survival simulation -------------------------------------------------
    eta = _latent_log_hazard(df, rng)
    u = rng.uniform(1e-12, 1.0, n)
    scale = _calibrate_scale(eta, months_observed, u, config.target_churn)
    churn_time = _simulate_churn_times(eta, scale, u)

    churned = churn_time < months_observed
    tenure_months = np.where(churned, np.maximum(1, np.ceil(churn_time)), months_observed).astype(int)

    join_date = SNAPSHOT_DATE - pd.to_timedelta(months_observed * 30.4375, unit="D")
    df["Join_Date"] = join_date.normalize().date
    df["Tenure_Months"] = tenure_months
    df["Tenure"] = np.minimum(tenure_months // 12, 10)
    df["Churn_Status"] = churned.astype(int)
    df["Churn_Date"] = np.where(
        churned,
        (join_date + pd.to_timedelta(tenure_months * 30.4375, unit="D")).normalize().date,
        None,
    )

    # ---- Behavioural leading indicators (last 90 days before snapshot / churn) --
    # Disengagement "signal strength" s in [0, 1]. Real portfolios are noisy:
    #  * ~70% of churners visibly disengage first; the rest leave abruptly.
    #  * Active customers whose (future) churn time falls in the next 12 months are
    #    already drifting -> these are the "silent churners" the model must find.
    #  * A minority of healthy customers show temporary dips (false positives).
    months_to_future_churn = churn_time - months_observed
    silent_churner = (~churned) & (months_to_future_churn < 12)
    noisy_dip = (~churned) & (~silent_churner) & (rng.uniform(size=n) < 0.10)
    signal = np.select(
        [churned & (rng.uniform(size=n) < 0.70), churned, silent_churner, noisy_dip],
        [rng.uniform(0.55, 1.0, n), rng.uniform(0.0, 0.3, n), rng.uniform(0.3, 0.85, n), rng.uniform(0.15, 0.6, n)],
        default=rng.uniform(0.0, 0.15, n),
    )

    active = df["IsActiveMember"].to_numpy() == 1
    base_txn = np.where(active, 27.0, 11.0) * rng.uniform(0.75, 1.25, n)
    df["Monthly_Txn_Count"] = rng.poisson(base_txn * (1 - 0.7 * signal))

    decay = np.clip(0.12 + 0.62 * signal + rng.normal(0, 0.11, n) + np.where(active, -0.04, 0.05), 0, 1)
    df["Transaction_Decay_Score"] = np.round(decay, 4)

    bal_change = np.clip(0.02 - 0.45 * signal + rng.normal(0, 0.12, n), -1.0, 0.6)
    df["Balance_Change_90d_Pct"] = np.round(np.where(df["Balance"] > 0, bal_change, 0.0), 4)

    df["Complaints_12M"] = rng.poisson(0.18 + 0.9 * signal)

    column_order = [
        "Customer_ID", "Age", "Gender", "Geography", "CreditScore", "Tenure", "Tenure_Months",
        "Join_Date", "Balance", "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary",
        "Monthly_Txn_Count", "Transaction_Decay_Score", "Balance_Change_90d_Pct", "Complaints_12M",
        "Churn_Status", "Churn_Date",
    ]
    return df[column_order]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=10_000, help="number of customers")
    parser.add_argument("--seed", type=int, default=42, help="random seed (deterministic output)")
    parser.add_argument("--target-churn", type=float, default=0.204, help="portfolio attrition rate")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV output path")
    args = parser.parse_args()

    df = generate(GeneratorConfig(n_customers=args.n, seed=args.seed, target_churn=args.target_churn))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    print(f"[generator] wrote {len(df):,} customers -> {args.output}")
    print(f"[generator] attrition rate: {df['Churn_Status'].mean():.2%}")
    print(df.groupby("NumOfProducts")["Churn_Status"].agg(["count", "mean"]).round(3).to_string())


if __name__ == "__main__":
    main()
