"""
Performance analysis for AI-Based Water Potability Assessment System.

Generates reports in ml/analysis/reports/ including:
- Rule-based classifier confusion matrix and metrics
- Prophet forecasting errors per station and summary plots
- Pollution score distribution and parameter violation analysis
- Simple RAG retrieval summary (uses ChromaDB if available, otherwise placeholders)

Do NOT install new packages. Uses: pandas, numpy, matplotlib, seaborn, sklearn, prophet (if available)

Run:
    python ml/analysis/performance_analysis.py

"""
from __future__ import annotations

import os
import math
import textwrap
from typing import List, Dict, Tuple, Any
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
    mean_absolute_error,
)

# Prophet import (may be installed as 'prophet')
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except Exception:
    PROPHET_AVAILABLE = False

# Reuse rule-based functions from ml.pipeline.pollution
from ml.pipeline import pollution as pollution_mod

# Constants
REPORT_DIR = os.path.join("ml", "analysis", "reports")
os.makedirs(REPORT_DIR, exist_ok=True)
DPI = 150
sns.set_style("white")


# -----------------------------
# SECTION 1 — Rule-based Classifier
# -----------------------------

def run_classifier_analysis(df: pd.DataFrame):
    """Recompute safety_label using rule-based function and compare to stored label."""
    print("Running rule-based classifier analysis...")

    # Work on a copy
    data = df.copy()

    # Ensure required columns exist
    data = pollution_mod.compute_safety_and_violations(data)

    # 'predicted' uses recomputed safety_label; 'actual' is stored safety_label
    actual = data["safety_label"].astype(str)
    predicted = data["safety_label"].astype(str)  # default to same if stored missing

    # If original stored column exists, use it as actual and recomputed as predicted
    if "safety_label" in df.columns:
        actual = df["safety_label"].astype(str)
        recomputed = pollution_mod.compute_safety_and_violations(df.copy())["safety_label"]
        predicted = recomputed.astype(str)

    # Ensure labels are ['Safe','Unsafe'] ordering
    labels = ["Safe", "Unsafe"]

    # Metrics
    y_true = actual.values
    y_pred = predicted.values

    acc = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, labels=labels, average=None, zero_division=0)
    recall = recall_score(y_true, y_pred, labels=labels, average=None, zero_division=0)
    f1 = f1_score(y_true, y_pred, labels=labels, average=None, zero_division=0)

    # Print classification report
    report = classification_report(y_true, y_pred, labels=labels, zero_division=0)
    print("\nRule-based classifier — Classification Report:\n")
    print(report)

    # Confusion matrix with counts and percentages
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    cm_total = cm.sum()

    cm_percent = cm / cm_total * 100.0

    # Create heatmap without annotations; we'll draw count and percentage manually
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(cm, annot=False, fmt="d", cmap="Blues", cbar=False,
                xticklabels=["Predicted: Safe", "Predicted: Unsafe"],
                yticklabels=["Actual: Safe", "Actual: Unsafe"], ax=ax)

    # Manually annotate each cell with count (large, bold) and percentage (smaller)
    max_count = cm.max() if cm.size > 0 else 1
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            count = int(cm[i, j])
            pct = cm_percent[i, j]
            # choose text color based on cell darkness
            text_color = "white" if (cm[i, j] / max_count) > 0.5 else "#1e293b"

            # cell center coordinates
            x = j + 0.5
            y = i + 0.5

            # count (larger, bold) slightly above center
            ax.text(x, y - 0.15, f"{count}", ha="center", va="center", fontsize=16, fontweight="bold", color=text_color)
            # percentage below center (smaller)
            ax.text(x, y + 0.15, f"({pct:.1f}%)", ha="center", va="center", fontsize=12, color=text_color)

    plt.title("Safe/Unsafe Classification — Confusion Matrix")
    plt.xlabel("")
    plt.ylabel("")
    plt.tight_layout()
    cm_path = os.path.join(REPORT_DIR, "confusion_matrix.png")
    fig.savefig(cm_path, dpi=DPI)
    plt.close(fig)
    print("Saved", cm_path)

    # Classification metrics bar chart
    # Build metric list in requested order
    metrics_names = [
        ("Precision (Safe)", precision[0], "safe"),
        ("Recall (Safe)", recall[0], "safe"),
        ("F1 (Safe)", f1[0], "safe"),
        ("Precision (Unsafe)", precision[1], "unsafe"),
        ("Recall (Unsafe)", recall[1], "unsafe"),
        ("F1 (Unsafe)", f1[1], "unsafe"),
        ("Accuracy", acc, "accuracy"),
    ]

    labels_plot = [m[0] for m in metrics_names]
    values_plot = [m[1] for m in metrics_names]
    colors = []
    for _, _, kind in metrics_names:
        if kind == "safe":
            colors.append("#16a34a")  # green
        elif kind == "unsafe":
            colors.append("#ef4444")  # red
        else:
            colors.append("#2563eb")  # blue

    plt.figure(figsize=(8, 5))
    y_pos = np.arange(len(labels_plot))
    sns.barplot(x=values_plot, y=labels_plot, palette=colors)
    for i, v in enumerate(values_plot):
        plt.text(v + 0.01, i, f"{v:.3f}")
    plt.xlim(0, 1)
    plt.title("Classification Performance Metrics")
    plt.xlabel("")
    plt.tight_layout()
    metrics_path = os.path.join(REPORT_DIR, "classification_metrics.png")
    plt.savefig(metrics_path, dpi=DPI)
    plt.close()
    print("Saved", metrics_path)


# -----------------------------
# SECTION 2 — Prophet Forecast Performance
# -----------------------------

def run_prophet_analysis(df: pd.DataFrame):
    print("Running Prophet forecast analysis...")

    if not PROPHET_AVAILABLE:
        print("Prophet not available in environment. Skipping Prophet analysis.")
        return

    # We'll collect per-station errors
    station_rows = []

    grouped = df.groupby("stn_code")
    for stn, g in grouped:
        # Need pollution_score per year
        series = g[["year", "pollution_score", "monitoring_location"]].dropna(subset=["pollution_score"]) 
        # Ensure we have actual 2022
        if 2022 not in series["year"].values:
            continue
        if series["year"].nunique() < 4:
            continue

        # Prepare Prophet dataframe: use Jan 1 of each year as date
        series_unique = series.groupby("year").agg({"pollution_score": "mean", "monitoring_location": "first"}).reset_index()
        train_df = series_unique[series_unique["year"] <= 2021]
        test_df = series_unique[series_unique["year"] == 2022]
        if train_df.shape[0] < 3 or test_df.empty:
            continue

        prophet_df = pd.DataFrame({"ds": pd.to_datetime(train_df["year"].astype(str) + "-01-01"), "y": train_df["pollution_score"].values})

        m = Prophet(yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False)
        try:
            m.fit(prophet_df)
            future = pd.DataFrame({"ds": pd.to_datetime(["2022-01-01"])})
            fcst = m.predict(future)
            pred = float(fcst.loc[0, "yhat"])
            actual = float(test_df.iloc[0]["pollution_score"])

            mae = abs(pred - actual)
            rmse = math.sqrt((pred - actual) ** 2)
            mape = abs((actual - pred) / actual) * 100.0 if actual != 0 else np.nan

            station_rows.append(
                {
                    "stn_code": stn,
                    "station_name": test_df.iloc[0]["monitoring_location"],
                    "mae": mae,
                    "rmse": rmse,
                    "mape": mape,
                    "actual_2022": actual,
                    "predicted_2022": pred,
                }
            )
        except Exception as e:
            # skip stations where prophet fails
            continue

    metrics_df = pd.DataFrame(station_rows)
    if metrics_df.empty:
        print("No station forecasts computed (insufficient data or prophet errors).")
        return

    # Aggregate metrics
    agg_mae = metrics_df["mae"].mean()
    agg_rmse = metrics_df["rmse"].mean()
    agg_mape = metrics_df["mape"].mean()
    print(f"Prophet aggregate MAE={agg_mae:.3f}, RMSE={agg_rmse:.3f}, MAPE={agg_mape:.2f}%")

    # Save station-level CSV
    csv_path = os.path.join(REPORT_DIR, "prophet_metrics_summary.csv")
    metrics_df.to_csv(csv_path, index=False)
    print("Saved", csv_path)

    # Error distribution plots
    plt.figure(figsize=(12, 4))
    for i, col in enumerate(["mae", "rmse", "mape"]):
        plt.subplot(1, 3, i + 1)
        sns.histplot(metrics_df[col].dropna(), kde=True, color="#0ea5e9")
        plt.title(col.upper() + " Distribution")
    plt.suptitle("Prophet Model — Error Distribution Across Stations")
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    dist_path = os.path.join(REPORT_DIR, "prophet_error_distribution.png")
    plt.savefig(dist_path, dpi=DPI)
    plt.close()
    print("Saved", dist_path)

    # Actual vs Predicted scatter (color by error magnitude)
    metrics_df["error"] = abs(metrics_df["actual_2022"] - metrics_df["predicted_2022"])
    plt.figure(figsize=(6, 6))
    sc = plt.scatter(metrics_df["actual_2022"], metrics_df["predicted_2022"], c=metrics_df["error"], cmap="RdYlGn_r", s=30)
    plt.plot([metrics_df[["actual_2022","predicted_2022"]].min().min(), metrics_df[["actual_2022","predicted_2022"]].max().max()],
             [metrics_df[["actual_2022","predicted_2022"]].min().min(), metrics_df[["actual_2022","predicted_2022"]].max().max()],
             linestyle="--", color="black")
    plt.colorbar(sc, label="Absolute error")
    plt.xlabel("Actual")
    plt.ylabel("Predicted")
    plt.title("Prophet — Actual vs Predicted Pollution Score (2022)")
    # Add text box with aggregate metrics
    textstr = f"MAE={agg_mae:.3f}\nRMSE={agg_rmse:.3f}\nMAPE={agg_mape:.2f}%"
    plt.gcf().text(0.02, 0.98, textstr, fontsize=9, va="top")
    ap_path = os.path.join(REPORT_DIR, "prophet_actual_vs_predicted.png")
    plt.tight_layout()
    plt.savefig(ap_path, dpi=DPI)
    plt.close()
    print("Saved", ap_path)

    # Top 10 stations by MAE
    top10 = metrics_df.sort_values("mae", ascending=False).head(10).copy()
    # Ensure station code is string and use station name on x axis
    top10["stn_code"] = top10["stn_code"].astype(str)
    top10["station_name"] = top10["station_name"].astype(str)
    # Truncate station names for readability
    top10["station_name_trunc"] = top10["station_name"].str.slice(0, 30)

    plt.figure(figsize=(10, 6))
    sns.barplot(x="station_name_trunc", y="mae", data=top10, color="#ef4444")
    plt.xlabel("Station (truncated)")
    plt.ylabel("MAE")
    plt.title("Prophet — Top 10 Stations with Highest Prediction Error")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    top10_path = os.path.join(REPORT_DIR, "prophet_top10_stations.png")
    plt.savefig(top10_path, dpi=DPI)
    plt.close()
    print("Saved", top10_path)


# -----------------------------
# SECTION 3 — Pollution Score Analysis
# -----------------------------

def run_pollution_analysis(df: pd.DataFrame):
    print("Running pollution score analysis...")
    data = df.copy()

    # Distribution of pollution_score
    plt.figure(figsize=(8, 4))
    sns.histplot(data["pollution_score"].dropna(), bins=30, color="#0ea5e9")
    mean = data["pollution_score"].mean()
    median = data["pollution_score"].median()
    plt.axvline(mean, color="blue", linestyle="--", label=f"mean={mean:.2f}")
    plt.axvline(median, color="green", linestyle="--", label=f"median={median:.2f}")
    plt.legend()
    plt.title("Pollution Score Distribution (2016-2022)")
    plt.tight_layout()
    ps_path = os.path.join(REPORT_DIR, "pollution_score_distribution.png")
    plt.savefig(ps_path, dpi=DPI)
    plt.close()
    print("Saved", ps_path)

    # Parameter violation rates
    params = [
        ("BOD", "bod_avg", pollution_mod.SAFE_LIMITS["bod_max"], "max"),
        ("DO", "do_avg", pollution_mod.SAFE_LIMITS["do_min"], "min"),
        ("pH", "ph_avg", (pollution_mod.SAFE_LIMITS["ph_min"], pollution_mod.SAFE_LIMITS["ph_max"]), "range"),
        ("Nitrate", "nitrate_avg", pollution_mod.SAFE_LIMITS["nitrate_max"], "max"),
        ("Fecal Coliform", "fecal_coliform_avg", pollution_mod.SAFE_LIMITS["fecal_coliform_max"], "max"),
    ]

    rates = []
    for display, col, limit, kind in params:
        s = data[col]
        valid = s.dropna()
        if valid.empty:
            rate = 0.0
        else:
            if kind == "max":
                rate = (valid > limit).sum() / len(valid) * 100.0
            elif kind == "min":
                rate = (valid < limit).sum() / len(valid) * 100.0
            else:  # range
                lo, hi = limit
                rate = ((valid < lo) | (valid > hi)).sum() / len(valid) * 100.0
        rates.append((display, rate))

    # Colors based on thresholds
    labels = [r[0] for r in rates]
    values = [r[1] for r in rates]
    colors = []
    for v in values:
        if v < 20:
            colors.append("#16a34a")
        elif v < 50:
            colors.append("#f97316")
        else:
            colors.append("#ef4444")

    plt.figure(figsize=(8, 5))
    sns.barplot(x=values, y=labels, palette=colors)
    plt.xlabel("Violation rate (%)")
    plt.title("Parameter Violation Rates Across All Stations")
    for i, v in enumerate(values):
        plt.text(v + 0.5, i, f"{v:.1f}%")
    plt.tight_layout()
    pv_path = os.path.join(REPORT_DIR, "parameter_violation_rates.png")
    plt.savefig(pv_path, dpi=DPI)
    plt.close()
    print("Saved", pv_path)

    # Yearly safety trend
    yearly = data.groupby("year")["safety_label"].value_counts().unstack(fill_value=0)
    # Ensure both columns exist
    for col in ["Safe", "Unsafe"]:
        if col not in yearly.columns:
            yearly[col] = 0
    yearly = yearly[["Safe", "Unsafe"]]

    yearly.plot(kind="bar", stacked=False, color=["#22c55e", "#ef4444"], figsize=(10, 5))
    plt.title("Safe vs Unsafe Stations by Year (2016-2022)")
    plt.ylabel("Count")
    plt.tight_layout()
    ys_path = os.path.join(REPORT_DIR, "yearly_safety_trend.png")
    plt.savefig(ys_path, dpi=DPI)
    plt.close()
    print("Saved", ys_path)

    # Pollution by water_body_type boxplot
    plt.figure(figsize=(8, 5))
    sns.boxplot(x="water_body_type", y="pollution_score", data=data, color="#0ea5e9")
    plt.title("Pollution Score Distribution by Water Body Type")
    plt.tight_layout()
    wb_path = os.path.join(REPORT_DIR, "water_body_pollution.png")
    plt.savefig(wb_path, dpi=DPI)
    plt.close()
    print("Saved", wb_path)


# -----------------------------
# SECTION 4 — RAG Pipeline Analysis (simple)
# -----------------------------

def run_rag_analysis():
    print("Running RAG pipeline retrieval summary...")

    queries = [
        "What is the safe limit for BOD in drinking water?",
        "Health effects of fecal coliform contamination",
        "Dissolved oxygen standards for river water",
        "Nitrate contamination causes and treatment",
        "pH acceptable range for drinking water WHO guidelines",
    ]

    rows = []

    # Use the local rag_pipeline helper to query the knowledge base and ensure the
    # persist_directory points to ml/analysis/chroma_db inside this package.
    persist_dir = str(Path(__file__).resolve().parent / "chroma_db")
    try:
        from ml.analysis.rag_pipeline import query_knowledge_base
    except Exception:
        query_knowledge_base = None

    for q in queries:
        preview = ""
        chunks = 0
        if query_knowledge_base is not None:
            try:
                docs = query_knowledge_base(q, n_results=3, persist_directory=persist_dir)
                chunks = len(docs)
                if docs:
                    preview = docs[0][:80]
            except Exception:
                chunks = 0
                preview = "(query failed)"
        else:
            preview = "(ChromaDB helper not available)"
            chunks = 0

        rows.append((q, chunks, preview))

    # Render table using matplotlib
    fig, ax = plt.subplots(figsize=(12, 3 + 0.6 * len(rows)))
    ax.axis("off")

    table_data = [(r[0], r[1], r[2]) for r in rows]
    col_labels = ["Query", "Chunks Retrieved", "Top Chunk Preview"]
    table = ax.table(cellText=table_data, colLabels=col_labels, cellLoc='left', loc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1, 1.2)

    # Alternate row colors
    for i, key in enumerate(table._cells):
        cell = table._cells[key]
        r, c = key
        if r > 0:
            if r % 2 == 0:
                cell.set_facecolor("#f7f7f7")

    plt.title("RAG Pipeline — Knowledge Base Retrieval Summary")
    plt.tight_layout()
    rag_path = os.path.join(REPORT_DIR, "rag_retrieval_summary.png")
    plt.savefig(rag_path, dpi=DPI)
    plt.close()
    print("Saved", rag_path)


# -----------------------------
# MAIN
# -----------------------------

def main():
    print("Running performance analysis...")
    print("=" * 60)

    # Load dataset
    path = os.path.join("ml", "data", "geocoded", "karnataka_train_2016_2022.csv")
    df = pd.read_csv(path)

    # Split train (2016-2021) and test (2022) where needed; many analyses use full range
    train_df = df[df["year"] <= 2021].copy()
    test_df = df[df["year"] == 2022].copy()

    print("\n[1/4] Rule-based Classifier Analysis...")
    run_classifier_analysis(df)

    print("\n[2/4] Prophet Forecast Analysis...")
    run_prophet_analysis(df)

    print("\n[3/4] Pollution Score Analysis...")
    run_pollution_analysis(df)

    print("\n[4/4] RAG Pipeline Analysis...")
    run_rag_analysis()

    print("\n" + "=" * 60)
    print(f"All reports saved to {REPORT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
