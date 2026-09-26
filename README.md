# Retail Bank Customer Churn & Lifetime Value (LTV) Diagnostic Analytics Dashboard

An end-to-end churn analytics project: a **Python engine** (pandas · scipy · lifelines · scikit-learn) generates and analyses a 10,000-customer retail bank, and a **Next.js "Power BI Web Simulator"** presents the results in a report that looks and behaves like the Power BI Service. It runs on localhost and needs no Power BI licence.

![Executive Attrition Overview](docs/screenshots/01-executive-overview.png)

---

## Highlights

| Layer | What it does |
|---|---|
| **Synthetic data generator** | A survival-consistent simulation. Each customer gets a Weibull proportional-hazards time-to-churn built from known drivers (inactivity, product holding, age, geography). Customers are right-censored at the snapshot date. Behavioural leading indicators include "silent churners" who are still active but already disengaging. |
| **Hypothesis testing** | χ² independence tests (with Cramér's V) and Welch t-tests (with Cohen's d) on 15 candidate drivers. P-values are Bonferroni-adjusted. |
| **Survival analysis** | `lifelines` Kaplan-Meier curves with 95% CIs, overall and by segment, plus multivariate log-rank tests. |
| **Propensity model** | L2 logistic regression. Scores are produced **out-of-fold** (5-fold stratified CV), so every probability is an unseen-data prediction. ROC-AUC ≈ 0.91. |
| **LTV & risk scoring** | Margin-based, retention-adjusted LTV: `LTV = m·r / (1 + d − r)`. Also computes at-risk revenue, risk tiers, value tiers and a rule-based next-best retention action. |
| **Power BI simulator** | Left nav, header and action bar, a collapsible filter pane (visual / page / all-pages scopes and search), bottom page tabs with zoom, cross-filtering, focus mode, "Show as a table", CSV export, drill-through, and a live data refresh. |

## Report pages

1. **Executive Attrition Overview**
   - KPI cards: attrition rate, lost balance, at-risk revenue, average LTV.
   - Attrition by geography × age tier (click a column to cross-filter the page).
   - Product-holding small multiples.
   - Kaplan-Meier cohort retention heatmap.
   - Attrition by tenure.
2. **Diagnostic & Root-Cause Analytics**
   - Simulated **Key Influencers** visual: lift and two-proportion z-tests, with *Key influencers* and *Top segments* tabs.
   - KM survival curves with CI bands.
   - Balance decay vs. transaction frequency scatter with a danger zone.
   - **80/20 Pareto** of lost revenue.
   - Hypothesis-testing results table.
3. **Prescriptive Retention & What-If Planner**
   - What-if sliders for churn reduction per value tier and a targeting threshold.
   - Live KPIs: revenue saved, LTV preserved, cost, ROI.
   - Baseline vs. scenario chart.
   - Savings by action.
   - Sortable, searchable **drill-through table** of high-LTV at-risk accounts.
4. **Customer Drill-through** (hidden page)
   - Profile, churn-probability gauge and active risk drivers.
   - Behavioural benchmarks and the recommended action with its expected value.

| | |
|---|---|
| ![Diagnostic](docs/screenshots/02-diagnostic-root-cause.png) | ![What-if](docs/screenshots/03-what-if-planner.png) |
| ![Drill-through](docs/screenshots/04-customer-drillthrough.png) | ![Cross-filter](docs/screenshots/05-cross-filtering.png) |

---

## Quick start

### Option A: Docker (one command)

```bash
docker compose -f docker/docker-compose.yml up --build
```

The `analytics` container generates the data and runs the engine. When it finishes, the `web` container starts. Open **http://localhost:3000**.

You can change the dataset size or seed with environment variables:

```bash
N_CUSTOMERS=25000 SEED=7 docker compose -f docker/docker-compose.yml up --build
```

### Option B: Local (Node 20+ and Python 3.9+)

```bash
# 1. Analytics engine (optional: a pre-generated dataset ships in app/data)
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/generate_synthetic_bank_data.py      # -> data/raw/bank_customers.csv
python scripts/analytical_engine.py                 # -> app/data/{customers,model}.json

# 2. Dashboard
cd app
npm install
npm run dev                                         # http://localhost:3000
```

If you re-run the engine while the app is running, click the **Refresh** icon in the action bar. The dashboard reads the JSON at request time, so it doesn't need a rebuild.

---

## Architecture

```
┌──────────────────────── scripts/ (Python) ────────────────────────┐
│ generate_synthetic_bank_data.py ─► data/raw/bank_customers.csv    │
│ analytical_engine.py                                              │
│   1 feature engineering   2 χ² / Welch t-tests                    │
│   3 Kaplan-Meier + log-rank   4 OOF logistic propensity           │
│   5 LTV · risk tiers · next-best-action                           │
│        ├─► app/data/customers.json  (row-level fact table)        │
│        ├─► app/data/model.json      (tests, survival, model)      │
│        └─► data/processed/customers_enriched.csv                  │
└───────────────────────────────────────────────────────────────────┘
                              │  GET /api/data/:dataset  (read at request time)
┌──────────────────────── app/ (Next.js 16 · React 19) ─────────────┐
│ context/ReportContext   filter context: report/page filters,      │
│                         cross-filter, focus, zoom, drill-through  │
│ lib/measures.ts         "DAX" measures evaluated per filter ctx   │
│ components/shell/*      Power BI service chrome                   │
│ components/visuals/*    Recharts visuals in PBI visual containers │
│ components/pages/*      the four report pages                     │
└───────────────────────────────────────────────────────────────────┘
```

**Design choice:** the heavy statistics run once in Python and are shipped as a semantic model. Measures such as attrition %, KM cohort retention, key-influencer lift, Pareto and the what-if simulation are computed in the browser against the current filter context, the same way Power BI evaluates DAX measures. That's why every slicer, filter-pane card and cross-filter updates the visuals instantly.

### Repository layout

```
├── app/                      Next.js dashboard (TypeScript, Tailwind CSS v4, Recharts, Lucide)
│   ├── data/                 engine output served by /api/data/*
│   └── src/{app,components,context,lib}
├── scripts/
│   ├── generate_synthetic_bank_data.py
│   ├── analytical_engine.py
│   └── requirements.txt
├── docker/
│   ├── Dockerfile.analytics  python:3.11-slim engine image
│   ├── Dockerfile.web        multi-stage Next.js standalone image
│   └── docker-compose.yml
├── data/                     raw + processed CSV extracts
└── docs/screenshots/
```

## Data dictionary (key fields)

| Field | Description |
|---|---|
| `Customer_ID`, `Age`, `Gender`, `Geography` | Demographics (France / Germany / Spain) |
| `Tenure`, `Tenure_Months`, `Join_Date` | Relationship length; `Tenure_Months` is the survival duration |
| `Balance`, `NumOfProducts`, `HasCrCard`, `IsActiveMember`, `EstimatedSalary`, `CreditScore` | Account and product holdings |
| `Monthly_Txn_Count`, `Transaction_Decay_Score`, `Balance_Change_90d_Pct`, `Complaints_12M` | Behavioural leading indicators (90-day window) |
| `Churn_Status` | 1 = churned within the observation window (survival event) |
| `Churn_Probability` | Out-of-fold propensity score |
| `Annual_Revenue`, `LTV`, `At_Risk_Revenue` | Revenue attribution and lifetime value |
| `Risk_Tier`, `Value_Tier`, `Recommended_Action` | Scoring outputs used by the planner |

Financial assumptions (NIM, fees, margin, discount rate) are documented in `model.json → assumptions` and at the top of `analytical_engine.py`.

---

## Using the simulator

- **Slicers** on the canvas sync with the *Filters on all pages* cards in the filter pane.
- **Page-level filters** (for example *Number of Products* on page 1) apply only to that page.
- **Click a column** in *Attrition by Geography* or *Product Holding* to cross-filter the page. Click it again to clear.
- **Hover a visual** for its header: filter peek, **focus mode**, and a **⋯** menu with *Show as a table* and *Export data*.
- **Click a row** in the at-risk table to drill through to the customer. The **←** button returns you.
- **Export → Analyze in Excel** downloads the currently filtered customer table as CSV.
- **Zoom slider** (bottom right) and **View → Actual size** scale the canvas for screenshots.

> *Disclaimer:* this is an independent portfolio project that recreates the look of the Power BI Service UI for demonstration purposes. It is not affiliated with or endorsed by Microsoft. All customer data is synthetic.
