from __future__ import annotations

from typing import Annotated

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from backend.data_loader import get_data
from ml.models.forecast import forecast_pollution

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.get("/")
def forecast_status() -> dict[str, str]:
    return {"message": "Forecast router active"}


@router.get(
    "/{id}",
    responses={
        400: {"description": "Invalid station id or insufficient data points for forecasting"},
        404: {"description": "Station not found"},
        500: {"description": "Forecast generation failed"},
    },
)
def location_forecast(
    id: str,
    years: Annotated[int, Query(ge=1, le=20)] = 5,
) -> dict:
    try:
        df = get_data()

        try:
            station_id = int(id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Station id must be an integer")

        stn_codes = df["stn_code"]
        station_mask = stn_codes.astype(str).str.strip() == str(station_id)
        if not station_mask.any():
            raise HTTPException(status_code=404, detail="Station not found")

        # Keep all rows across years for this station; model handles temporal learning.
        df_loc = df.loc[station_mask, ["stn_code", "monitoring_location", "year", "pollution_score"]]

        usable_points = (df_loc["year"].notna() & df_loc["pollution_score"].notna()).sum()
        if usable_points < 3:
            # Provide a safe fallback for stations with sparse history:
            # - 1 point: repeat the last observed value forward with wide uncertainty
            # - 2 points: simple linear extrapolation with residual-based uncertainty
            valid_rows = df_loc[df_loc["pollution_score"].notna()].copy()
            if valid_rows.empty:
                raise HTTPException(
                    status_code=400,
                    detail="Not enough historical data points to generate a forecast",
                )

            # determine last observed year and value
            valid_years = pd.to_numeric(valid_rows["year"], errors="coerce").dropna()
            last_observed_year = int(valid_years.max())
            last_val = float(valid_rows.loc[valid_rows["year"] == valid_years.max(), "pollution_score"].iloc[-1])

            import numpy as np

            periods = int(years)
            future_years = [last_observed_year + i for i in range(1, periods + 1)]
            ds = pd.to_datetime([f"{y}-01-01" for y in future_years])

            if usable_points == 1:
                yhat = np.array([last_val] * periods, dtype=float)
                yhat_lower = yhat - abs(last_val) * 0.5
                yhat_upper = yhat + abs(last_val) * 0.5
                trend = "Fallback (last_value)"
            else:
                yrs = pd.to_numeric(valid_rows["year"], errors="coerce").astype(float)
                vals = pd.to_numeric(valid_rows["pollution_score"], errors="coerce").astype(float)
                # linear fit
                slope, intercept = np.polyfit(yrs, vals, 1)
                yhat = intercept + slope * np.array(future_years, dtype=float)
                # residual-based uncertainty (conservative)
                preds_train = intercept + slope * yrs
                resid = vals - preds_train
                std = float(np.nanstd(resid)) if len(resid) > 0 else 0.0
                yhat_lower = yhat - 2.0 * std
                yhat_upper = yhat + 2.0 * std
                trend = "Fallback (linear)"

            forecast_df = pd.DataFrame({
                "ds": ds,
                "yhat": yhat,
                "yhat_lower": yhat_lower,
                "yhat_upper": yhat_upper,
            })
            forecast_df["ds"] = pd.to_datetime(forecast_df["ds"]).dt.strftime("%Y-%m-%d")
            # round values
            for col in ["yhat", "yhat_lower", "yhat_upper"]:
                forecast_df[col] = forecast_df[col].astype(float).round(2)

            records = forecast_df.to_dict(orient="records")
            return {
                "id": station_id,
                "location": str(df_loc["monitoring_location"].iloc[0]),
                "forecast": records,
                "trend": trend,
                "fallback": True,
            }

        valid_years = pd.to_numeric(df_loc["year"], errors="coerce").dropna()
        if valid_years.empty:
            raise HTTPException(
                status_code=400,
                detail="No valid year values available for forecasting",
            )
        last_observed_year = int(valid_years.max())

        # forecast_pollution performs an internal exact filter; pass canonical value.
        canonical_location = str(df_loc["monitoring_location"].iloc[0])
        try:
            result = forecast_pollution(df_loc, canonical_location, periods=years)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Unable to generate forecast at the moment",
            )

        if not result or "forecast" not in result:
            raise HTTPException(status_code=500, detail="Forecast output is unavailable")

        forecast_df = result["forecast"]
        required_columns = ["ds", "yhat", "yhat_lower", "yhat_upper"]
        missing_cols = [col for col in required_columns if col not in forecast_df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=500,
                detail=f"Forecast output missing required columns: {', '.join(missing_cols)}",
            )

        forecast_df = forecast_df.loc[:, required_columns].copy()
        forecast_df["ds"] = forecast_df["ds"].dt.strftime("%Y-%m-%d")

        # Return only future rows (exclude history) relative to the last actual year.
        cutoff = pd.Timestamp(year=last_observed_year, month=12, day=31)
        forecast_df = forecast_df[pd.to_datetime(forecast_df["ds"]) > cutoff]

        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            forecast_df[col] = forecast_df[col].astype(float).round(2)

        records = forecast_df.to_dict(orient="records")
        return {
            "id": station_id,
            "location": canonical_location,
            "forecast": records,
            "trend": result.get("trend", "Stable"),
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected server error while processing forecast")
