from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[2] / "ml" / "analysis" / ".env")

from typing import Any

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from backend.data_loader import get_data
from ml.analysis.pollution_insights import _call_groq
from ml.analysis.rag_pipeline import query_knowledge_base

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    station_id: int | str | None = None


class ChatResponse(BaseModel):
    answer: str
    sources_used: int
    station_name: str | None
    violated_params: list[str]
    has_station_context: bool


def _normalize_violated_params(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _format_station_context(row: pd.Series) -> tuple[str, str | None, list[str]]:
    station_name = str(row.get("monitoring_location") or "").strip() or None
    water_body_type = str(row.get("water_body_type") or "").strip() or "Unknown"
    year = row.get("year")
    year_value = int(year) if pd.notna(year) else None

    violated_params = _normalize_violated_params(row.get("violated_params"))
    violated_params_text = ", ".join(violated_params) if violated_params else "None"

    station_context = (
        f"Station: {station_name or 'Unknown'}, Type: {water_body_type}, Year: {year_value if year_value is not None else 'Unknown'}, "
        f"DO: {row.get('do_avg', 'N/A')}, BOD: {row.get('bod_avg', 'N/A')}, pH: {row.get('ph_avg', 'N/A')}, "
        f"Nitrate: {row.get('nitrate_avg', 'N/A')}, Fecal Coliform: {row.get('fecal_coliform_avg', 'N/A')}, "
        f"Pollution Score: {row.get('pollution_score', 'N/A')}, Violations: {violated_params_text}"
    )

    return station_context, station_name, violated_params


@router.post("/")
def chat(request: ChatRequest) -> ChatResponse:
    try:
        station_context = ""
        station_name: str | None = None
        violated_params: list[str] = []
        has_station_context = False

        if request.station_id is not None:
            try:
                df = get_data().copy()
                station_mask = df["stn_code"].astype(str).str.strip() == str(request.station_id).strip()
                station_rows = df.loc[station_mask].copy()

                if not station_rows.empty:
                    station_rows["_year_numeric"] = pd.to_numeric(station_rows["year"], errors="coerce")
                    station_rows = station_rows.sort_values("_year_numeric", ascending=False, na_position="last")
                    latest_row = station_rows.iloc[0]
                    station_context, station_name, violated_params = _format_station_context(latest_row)
                    has_station_context = True
            except Exception as e:
                print(f"[chat.py ERROR] {e}")
                station_context = ""
                station_name = None
                violated_params = []
                has_station_context = False

        retrieval_query = (
            f"{request.message}. Context: {station_context}" if station_context else request.message
        )

        chunks: list[str] = []
        try:
            chunks = query_knowledge_base(
                retrieval_query,
                n_results=5,
                persist_directory="ml/analysis/chroma_db",
            )
        except Exception as e:
            print(f"[chat.py ERROR] {e}")
            chunks = []

        context_text = "\n\n".join(chunks)

        system_prompt = (
            "You are AquaAI, a water quality expert assistant for Karnataka, India. "
            "Answer based on provided station data and retrieved guidelines context. "
            "Be concise, factual, and cite parameter values when available. "
            "If asked about a specific station, use its parameter data. "
            "Reference WHO, CPCB, or BIS standards when relevant."
        )

        user_prompt = (
            f"User question: {request.message}\n\n"
            f"Station data: {station_context if station_context else 'No station selected'}\n\n"
            f"Retrieved guidelines context:\n{context_text if context_text else 'No context retrieved'}\n\n"
            "Answer in 3-5 sentences. Be specific about parameter values and standards."
        )

        try:
            answer = _call_groq(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                use_json_format=False,
            )
        except Exception as e:
            print(f"[chat.py ERROR] {e}")
            return ChatResponse(
                answer="Sorry, I could not process your request.",
                sources_used=len(chunks),
                station_name=station_name,
                violated_params=violated_params,
                has_station_context=has_station_context,
            )

        return ChatResponse(
            answer=answer,
            sources_used=len(chunks),
            station_name=station_name,
            violated_params=violated_params,
            has_station_context=has_station_context,
        )
    except Exception as e:
        print(f"[chat.py ERROR] {e}")
        return ChatResponse(
            answer="Sorry, I could not process your request.",
            sources_used=0,
            station_name=None,
            violated_params=[],
            has_station_context=False,
        )
