"""Hybrid explainability module for water quality insights.

Primary source of truth:
- Rule-based parameter knowledge (causes + impacts)

Secondary enhancement:
- RAG/LLM-backed recommended measures via generate_pollution_insights
"""

from __future__ import annotations

from pathlib import Path
import sys
from typing import Any

PARAM_KNOWLEDGE: dict[str, dict[str, str]] = {
    "BOD": {
        "cause": "High BOD indicates organic pollution due to sewage or industrial discharge.",
        "impact": "Reduces oxygen available for aquatic life.",
    },
    "DO": {
        "cause": "Low dissolved oxygen indicates poor water quality.",
        "impact": "Harms aquatic organisms.",
    },
    "Nitrate": {
        "cause": "High nitrate caused by agricultural runoff or fertilizers.",
        "impact": "Leads to eutrophication and health risks.",
    },
    "Fecal Coliform": {
        "cause": "Indicates contamination from human or animal waste.",
        "impact": "Risk of waterborne diseases.",
    },
    "pH": {
        "cause": "Abnormal pH due to chemical discharge.",
        "impact": "Affects aquatic life and water chemistry.",
    },
}


def _normalize_param_name(raw_param: str) -> str | None:
    """Normalize user/dataset violation text to canonical parameter labels."""
    text = (raw_param or "").strip().lower()
    if not text or text in {"none", "na", "n/a"}:
        return None

    if "bod" in text:
        return "BOD"
    if "dissolved oxygen" in text or text == "do" or "low do" in text:
        return "DO"
    if "nitrate" in text:
        return "Nitrate"
    if "fecal" in text and "coliform" in text:
        return "Fecal Coliform"
    if text in {"ph", "p h"} or "ph" in text:
        return "pH"

    return None


def _parse_violated_params(violated_params: str | None) -> list[str]:
    """Parse comma-separated violations into canonical parameter names."""
    if not violated_params:
        return []

    parts = [item.strip() for item in str(violated_params).split(",") if item.strip()]

    normalized: list[str] = []
    for part in parts:
        param = _normalize_param_name(part)
        if param and param not in normalized:
            normalized.append(param)

    return normalized


def _build_rule_based_explanation(params: list[str]) -> tuple[list[str], list[str]]:
    """Build deterministic causes and impacts from rule knowledge."""
    causes: list[str] = []
    impacts: list[str] = []

    for param in params:
        info = PARAM_KNOWLEDGE.get(param)
        if not info:
            continue

        cause = info.get("cause")
        impact = info.get("impact")

        if cause and cause not in causes:
            causes.append(cause)
        if impact and impact not in impacts:
            impacts.append(impact)

    return causes, impacts


def _get_rag_measures(
    violated_params: list[str],
    water_body_type: str,
    station_name: str,
) -> list[str]:
    """Fetch recommended measures from RAG insights module.

    This is intentionally secondary; failures return an empty list.
    """
    try:
        # Try package-style import first when running from ml/ as workspace root.
        from analysis.pollution_insights import generate_pollution_insights
    except Exception:
        try:
            # Fallback for direct execution contexts.
            analysis_dir = Path(__file__).resolve().parents[1] / "analysis"
            if str(analysis_dir) not in sys.path:
                sys.path.append(str(analysis_dir))
            from pollution_insights import generate_pollution_insights
        except Exception:
            return []

    try:
        payload: dict[str, Any] = generate_pollution_insights(
            violated_params=", ".join(violated_params),
            water_body_type=water_body_type,
            station_name=station_name,
        )
    except Exception as e:
        print(f"RAG failed: {e}")
        return []

    measures = payload.get("recommended_measures", [])
    if not isinstance(measures, list):
        return []

    cleaned = [str(item).strip() for item in measures if str(item).strip()]
    # Keep insertion order while removing duplicates.
    return list(dict.fromkeys(cleaned))


def generate_explanation(
    violated_params: str,
    water_body_type: str,
    station_name: str,
) -> dict[str, Any]:
    """Generate hybrid explanation with rule-based causes and RAG measures."""
    parsed_params = _parse_violated_params(violated_params)
    causes, impacts = _build_rule_based_explanation(parsed_params)
    recommended_measures = _get_rag_measures(parsed_params, water_body_type, station_name)

    return {
        "station_name": station_name,
        "water_body_type": water_body_type,
        "violated_params": parsed_params,
        "causes_of_pollution": causes,
        "impacts": impacts,
        "recommended_measures": recommended_measures,
    }
