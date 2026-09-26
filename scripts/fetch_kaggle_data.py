"""
fetch_kaggle_data.py
====================

Downloads the real-world **Bank Customer Churn** dataset from Kaggle and
validates it before the analytics engine runs.

Dataset : https://www.kaggle.com/datasets/radheshyamkollipara/bank-customer-churn
File    : Customer-Churn-Records.csv (10,000 customers x 18 columns)

Authentication
--------------
The dataset is public, so the Kaggle download endpoint normally works
anonymously. If Kaggle requires authentication in your environment, set
``KAGGLE_USERNAME`` and ``KAGGLE_KEY`` (from kaggle.com -> Settings -> API ->
"Create New Token") and the request is sent with HTTP basic auth.

The raw file is **not committed** to the repository (the dataset has no explicit
redistribution licence); run this script (or ``docker compose up``) to fetch it.

Usage
-----
    python scripts/fetch_kaggle_data.py            # download if missing
    python scripts/fetch_kaggle_data.py --force    # re-download
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET = "radheshyamkollipara/bank-customer-churn"
CSV_NAME = "Customer-Churn-Records.csv"
DOWNLOAD_URL = f"https://www.kaggle.com/api/v1/datasets/download/{DATASET}"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "raw" / CSV_NAME

EXPECTED_COLUMNS = [
    "RowNumber", "CustomerId", "Surname", "CreditScore", "Geography", "Gender", "Age", "Tenure",
    "Balance", "NumOfProducts", "HasCrCard", "IsActiveMember", "EstimatedSalary", "Exited",
    "Complain", "Satisfaction Score", "Card Type", "Point Earned",
]
MIN_ROWS = 9_000


def _request() -> urllib.request.Request:
    req = urllib.request.Request(DOWNLOAD_URL, headers={"User-Agent": "bank-churn-ltv-dashboard/1.0"})
    user, key = os.environ.get("KAGGLE_USERNAME"), os.environ.get("KAGGLE_KEY")
    if user and key:
        token = base64.b64encode(f"{user}:{key}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    return req


def download(output: Path) -> None:
    print(f"[fetch] downloading {DATASET} from Kaggle ...")
    try:
        with urllib.request.urlopen(_request(), timeout=60) as resp:
            payload = resp.read()
    except Exception as exc:  # noqa: BLE001 - surface a helpful message for any network/auth error
        sys.exit(
            f"[fetch] download failed: {exc}\n"
            "        If Kaggle requires login, export KAGGLE_USERNAME and KAGGLE_KEY, or download\n"
            f"        {CSV_NAME} manually from https://www.kaggle.com/datasets/{DATASET}\n"
            f"        and place it at {output}"
        )

    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        member = next((n for n in zf.namelist() if n.endswith(CSV_NAME)), None)
        if member is None:
            sys.exit(f"[fetch] {CSV_NAME} not found in archive: {zf.namelist()}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(zf.read(member))
    print(f"[fetch] saved -> {output}")


def validate(path: Path) -> None:
    df = pd.read_csv(path)
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        sys.exit(f"[fetch] schema mismatch - missing columns: {missing}")
    if len(df) < MIN_ROWS:
        sys.exit(f"[fetch] unexpected row count {len(df)} (< {MIN_ROWS})")
    sha = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    print(f"[fetch] validated {len(df):,} rows x {df.shape[1]} cols · churn rate {df['Exited'].mean():.2%} · sha256 {sha}…")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true", help="re-download even if the file exists")
    args = parser.parse_args()

    if args.force or not args.output.exists():
        download(args.output)
    else:
        print(f"[fetch] using cached {args.output} (pass --force to re-download)")
    validate(args.output)


if __name__ == "__main__":
    main()
