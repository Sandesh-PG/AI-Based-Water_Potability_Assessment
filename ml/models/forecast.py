"""Simple pollution trend forecasting with Prophet."""

from __future__ import annotations

import pandas as pd
from prophet import Prophet


def forecast_pollution(df: pd.DataFrame, location: str, periods: int = 5):
    """Forecast pollution_score for a specific monitoring location.

    Returns a dataframe with columns: ds, yhat.
    Returns None when there is not enough data to train.
    """
    df_loc = df[df["monitoring_location"] == location].copy()

    if df_loc.empty:
        return None

    # Prepare data for Prophet.
    df_loc = df_loc[["year", "pollution_score"]].rename(
        columns={"year": "ds", "pollution_score": "y"}
    )
    df_loc["y"] = pd.to_numeric(df_loc["y"], errors="coerce")
    df_loc = df_loc.dropna(subset=["ds", "y"])
    df_loc = df_loc.groupby("ds", as_index=False).mean()

    if len(df_loc) < 3:
        return None

    df_loc["ds"] = pd.to_datetime(df_loc["ds"], format="%Y", errors="coerce")
    df_loc = df_loc.dropna(subset=["ds"]).sort_values("ds")

    if len(df_loc) < 3:
        return None

    model = Prophet()
    model.fit(df_loc)

    future = model.make_future_dataframe(periods=periods, freq="YS")
    forecast = model.predict(future)
    forecast["yhat"] = forecast["yhat"].clip(lower=0, upper=100)
    last_actual = df_loc["y"].iloc[-1]
    
    last_pred = forecast["yhat"].iloc[-1]
    last_year = df_loc["ds"].iloc[-1].year

    trend = "Stable"
    if last_pred > last_actual:
        trend = "Worsening"
    elif last_pred < last_actual:
        trend = "Improving"

    return {
        "forecast": forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]],
        "trend": trend,
        "last_actual_year": last_year,
    }
