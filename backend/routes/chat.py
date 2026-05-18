from __future__ import annotations
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parents[2] / "ml" / "analysis" / ".env")

import json
from typing import Any

import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from backend.data_loader import get_data
from ml.analysis.pollution_insights import _call_groq, _extract_json_object
from ml.pipeline.pollution import SAFE_LIMITS
from ml.analysis.rag_pipeline import query_knowledge_base

router = APIRouter(prefix="/chat", tags=["chat"])
FALLBACK_ANSWER = "Sorry, could not process request"


class ChatRequest(BaseModel):
    message: str
    station_id: int | str | None = None
    history: list[dict] | None = []
    year: int | None = None


class ViolationDetail(BaseModel):
    parameter: str
    value: str
    limit: str
    status: str  # "critical" | "warning" | "safe"


class ChatResponse(BaseModel):
    answer: str
    safety_status: str | None
    violations: list[ViolationDetail]
    causes: list[str]
    health_risks: list[str]
    recommended_actions: list[str]
    sources_used: int
    station_name: str | None
    violated_params: list[str]
    has_station_context: bool


class SuggestionRequest(BaseModel):
    station_id: int | str | None = None
    year: int | None = None
    violated_params: list[str] | None = None
    safety_status: str | None = None


@router.post("/suggestions")
def suggestions(req: SuggestionRequest):
    """Return up to 3 templated suggested follow-up questions for a station.

    This is a lightweight, deterministic generator that fills simple templates
    using server-side station data and SAFE_LIMITS.
    """
    try:
        station_context, station_safety_label, station_name, violated_params, has_station_context, server_violations = _get_station_context_data(req.station_id, req.year)

        suggestions = []
        reasons = []

        vp = req.violated_params if req.violated_params is not None else violated_params

        # Helper to find param value and limit
        def _param_info(param_label: str):
            # map common labels to data keys
            mapping = {
                'BOD': ('bod_avg', SAFE_LIMITS.get('bod_max')),
                'Fecal Coliform': ('fecal_coliform_avg', SAFE_LIMITS.get('fecal_coliform_max')),
                'Nitrate': ('nitrate_avg', SAFE_LIMITS.get('nitrate_max')),
                'DO': ('do_avg', SAFE_LIMITS.get('do_min')),
                'pH': ('ph_avg', (SAFE_LIMITS.get('ph_min'), SAFE_LIMITS.get('ph_max'))),
            }
            return mapping.get(param_label, (None, None))

        if vp:
            # Use server_violations if available to report values
            for param in vp[:2]:
                key, limit = _param_info(param)
                value = None
                # try to get a numeric value from server_violations
                for v in server_violations:
                    if v.get('parameter') and param.lower() in v.get('parameter').lower():
                        value = v.get('value')
                        break

                if value:
                    text = f"Why is {param} high at {station_name or 'this station'} (current: {value})?"
                    reason = f"Detected violation: {param}"
                else:
                    text = f"Why is {param} elevated at {station_name or 'this station'}?"
                    reason = f"Detected potential issue: {param}"

                suggestions.append({"text": text, "reason": reason})

            # Add a mitigation/action template
            for param in vp[:2]:
                suggestions.append({"text": f"What actions can reduce {param} contamination at {station_name or 'this station'}?", "reason": f"Mitigation for {param}"})

        else:
            # No violations — generic helpful prompts
            suggestions.append({"text": "Which parameters should be monitored regularly at this station?", "reason": "Monitoring guidance"})
            suggestions.append({"text": "What are the WHO/BIS safe limits for common river parameters?", "reason": "Standards reference"})
            suggestions.append({"text": "How is the pollution score calculated for this station?", "reason": "Methodology"})

        # Deduplicate and limit to 3
        unique = []
        texts = set()
        for s in suggestions:
            if s["text"] in texts:
                continue
            texts.add(s["text"])
            unique.append(s)
            if len(unique) >= 3:
                break

        return {"suggestions": unique}
    except Exception as e:
        print(f"[chat.suggestions ERROR] {e}")
        return {"suggestions": []}


def _normalize_violated_params(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _to_list(val):
    if isinstance(val, list):
        return [str(i).strip() for i in val if str(i).strip()]
    if isinstance(val, str) and val.strip():
        return [val.strip()]
    return []


def _format_station_context(row: pd.Series) -> tuple[str, str | None, list[str], str]:
    station_name = str(row.get("monitoring_location") or "").strip() or None
    water_body_type = str(row.get("water_body_type") or "").strip() or "Unknown"
    safety_label = str(row.get("safety_label", "Unknown") or "Unknown").strip() or "Unknown"
    year = row.get("year")
    year_value = int(year) if pd.notna(year) else None

    violated_params = _normalize_violated_params(row.get("violated_params"))
    violated_params_text = ", ".join(violated_params) if violated_params else "None"

    station_context = (
        f"Station: {station_name or 'Unknown'}, Type: {water_body_type}, Year: {year_value if year_value is not None else 'Unknown'}, "
        f"Safety: {safety_label}, "
        f"DO: {row.get('do_avg', 'N/A')}, BOD: {row.get('bod_avg', 'N/A')}, pH: {row.get('ph_avg', 'N/A')}, "
        f"Nitrate: {row.get('nitrate_avg', 'N/A')}, Fecal Coliform: {row.get('fecal_coliform_avg', 'N/A')}, "
        f"Pollution Score: {row.get('pollution_score', 'N/A')}/10, Violations: {violated_params_text}"
    )

    return station_context, station_name, violated_params, safety_label


def _compute_violations(row: pd.Series) -> list[dict]:
    violations = []

    checks = [
        (
            "ph_avg",
            "pH",
            lambda v: v < SAFE_LIMITS["ph_min"] or v > SAFE_LIMITS["ph_max"],
            f"{SAFE_LIMITS['ph_min']}-{SAFE_LIMITS['ph_max']} (BIS/WHO)",
        ),
        (
            "do_avg",
            "Dissolved Oxygen",
            lambda v: v < SAFE_LIMITS["do_min"],
            f"min {SAFE_LIMITS['do_min']} mg/L (CPCB)",
        ),
        (
            "bod_avg",
            "BOD",
            lambda v: v > SAFE_LIMITS["bod_max"],
            f"max {SAFE_LIMITS['bod_max']} mg/L (CPCB)",
        ),
        (
            "nitrate_avg",
            "Nitrate",
            lambda v: v > SAFE_LIMITS["nitrate_max"],
            f"max {SAFE_LIMITS['nitrate_max']} mg/L (WHO)",
        ),
        (
            "fecal_coliform_avg",
            "Fecal Coliform",
            lambda v: v > SAFE_LIMITS["fecal_coliform_max"],
            f"max {SAFE_LIMITS['fecal_coliform_max']} MPN/100ml (WHO)",
        ),
    ]

    for col, name, is_violated, limit_str in checks:
        val = row.get(col)
        if pd.isna(val):
            continue
        val = float(val)
        if is_violated(val):
            violations.append({
                "parameter": name,
                "value": f"{val} {'mg/L' if 'coliform' not in col.lower() else 'MPN/100ml'}",
                "limit": limit_str,
                "status": "critical",
            })

    return violations


def _get_station_context_data(
    station_id: int | str | None,
    year: int | None = None,
) -> tuple[str, str, str | None, list[str], bool, list[dict]]:
    station_context = ""
    station_safety_label = "Unknown"
    station_name: str | None = None
    violated_params: list[str] = []
    has_station_context = False
    server_violations: list[dict] = []

    if station_id is None:
        return (
            station_context,
            station_safety_label,
            station_name,
            violated_params,
            has_station_context,
            server_violations,
        )

    try:
        df = get_data().copy()
        station_mask = df["stn_code"].astype(str).str.strip() == str(station_id).strip()
        station_rows = df.loc[station_mask].copy()

        if year is not None and not station_rows.empty:
            year_values = pd.to_numeric(station_rows["year"], errors="coerce")
            station_rows = station_rows.loc[year_values == year].copy()

        if not station_rows.empty:
            station_rows["_year_numeric"] = pd.to_numeric(station_rows["year"], errors="coerce")
            station_rows = station_rows.sort_values("_year_numeric", ascending=False, na_position="last")
            latest_row = station_rows.iloc[0]
            station_context, station_name, violated_params, station_safety_label = _format_station_context(latest_row)
            if year is not None and pd.notna(latest_row.get("year")) and int(latest_row.get("year")) == year:
                station_context = station_context.replace(
                    f"Year: {int(latest_row.get('year'))},",
                    f"Year: {int(latest_row.get('year'))} (selected),",
                    1,
                )
            server_violations = _compute_violations(latest_row)
            station_safety_label = str(latest_row.get("safety_label", "Unknown") or "Unknown")
            has_station_context = True
    except Exception as e:
        print(f"[chat.py ERROR] {e}")

    return (
        station_context,
        station_safety_label,
        station_name,
        violated_params,
        has_station_context,
        server_violations,
    )


def _build_groq_messages(system_prompt: str, user_prompt: str, history: list[dict] | None) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for h in history[-4:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                messages.append({
                    "role": h["role"],
                    "content": str(h["content"])[:500],
                })

    messages.append({"role": "user", "content": user_prompt})
    return messages


def _render_response_item(item: Any) -> str:
    """Convert a parsed response item (str or dict) into a human-readable string."""
    if item is None:
        return ""
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, (int, float)):
        return str(item)
    if isinstance(item, dict):
        # Prefer common textual keys
        for key in ("action", "risk", "cause", "recommendation", "explanation", "detail", "description", "note", "text"):
            if key in item and item[key]:
                return str(item[key]).strip()

        # Otherwise synthesize a readable line from available fields
        parts = []
        for k, v in item.items():
            if v is None:
                continue
            parts.append(f"{k.replace('_', ' ').title()}: {v}")
        return "; ".join(parts)

    # Fallback to string conversion
    return str(item)


def _normalize_response_list(value: Any) -> list[str]:
    """Normalize a parsed field which may be a list of strings or dicts into list[str]."""
    if value is None:
        return []
    if isinstance(value, list):
        out = []
        for v in value:
            s = _render_response_item(v)
            if s:
                out.append(s)
        return out
    # Single item
    s = _render_response_item(value)
    return [s] if s else []


def _is_station_specific_question(message: str) -> bool:
    station_keywords = [
        "this station", "the station", "station context", "this water",
        "these readings", "these levels", "this location",
        "analyse", "analyze", "monitoring location"
    ]
    message_lower = message.lower()
    return any(keyword in message_lower for keyword in station_keywords)


def _is_station_risk_question(message: str) -> bool:
    risk_keywords = [
        "unsafe", "safe", "violation", "violations", "out of limit", "exceed",
        "high bod", "high nitrate", "high fecal", "contaminated", "polluted",
        "why is", "why unsafe", "health risk", "risk level", "water quality status"
    ]
    message_lower = message.lower()
    return any(keyword in message_lower for keyword in risk_keywords)


def _build_user_prompt(
    request: ChatRequest,
    station_context: str,
    station_safety_label: str,
    server_violations: list[dict],
    context_text: str,
    has_station_context: bool,
) -> str:
    is_station_question = _is_station_specific_question(request.message)
    is_risk_question = _is_station_risk_question(request.message)

    if has_station_context and is_station_question and is_risk_question:
        return (
            f"User question: {request.message}\n\n"
            f"Station data: {station_context}\n"
            f"Actual safety label from database: {station_safety_label}\n"
            "Server-computed violations (GROUND TRUTH — do not add or remove any):\n"
            f"{json.dumps(server_violations) if server_violations else 'NONE — station meets all thresholds'}\n\n"
            f"Retrieved guidelines context:\n{context_text if context_text else 'No context retrieved'}\n\n"
            "STRICT RULES:\n"
            "1) violations MUST match server_violations exactly\n"
            "2) If server_violations NONE → safety_status='Safe', violations=[]\n"
            "3) causes/health_risks/recommended_actions relate ONLY to actual violations\n"
            "4) If Safe: causes=[], health_risks=[], recommended_actions=['Continue regular monitoring']\n"
            "5) Put a direct response to the user's question in the 'answer' field (3-5 sentences)."
        )

    return (
        f"User question: {request.message}\n\n"
        f"Station context (for reference only): {station_context if station_context else 'None'}\n\n"
        f"Retrieved guidelines context:\n{context_text if context_text else 'No context retrieved'}\n\n"
        "Answer the user's question directly and clearly in the 'answer' field (3-5 sentences).\n"
        "Set safety_status=null and violations=[].\n"
        "Use causes only for concise supporting points (optional), not as the main answer body.\n"
        "Set health_risks and recommended_actions only when relevant to the question."
    )


@router.post("/")
def chat(request: ChatRequest) -> ChatResponse:
    try:
        (
            station_context,
            station_safety_label,
            station_name,
            violated_params,
            has_station_context,
            server_violations,
        ) = _get_station_context_data(request.station_id, request.year)

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
            "You are AquaAI, a water quality expert for Karnataka, India. "
            "Always respond with valid JSON only. No markdown, no extra text. "
            "Use provided station data and guidelines context. "
            "Be specific about parameter values and WHO/CPCB/BIS standards. "
            "Pollution scores are on a 0-10 scale where: 0-2 = Clean, 2-4 = Moderate, 4-7 = Polluted, 7-10 = Severely Polluted."
        )

        user_prompt = _build_user_prompt(
            request,
            station_context,
            station_safety_label,
            server_violations,
            context_text,
            has_station_context,
        )

        messages = _build_groq_messages(system_prompt, user_prompt, request.history)

        try:
            raw_response = _call_groq(
                messages,
                temperature=0.3,
                use_json_format=True,
            )
        except Exception as e:
            print(f"[chat.py ERROR] {e}")
            return ChatResponse(
                answer=FALLBACK_ANSWER,
                safety_status=None,
                violations=[],
                causes=[],
                health_risks=[],
                recommended_actions=[],
                sources_used=len(chunks),
                station_name=station_name,
                violated_params=violated_params,
                has_station_context=has_station_context,
            )

        try:
            parsed = _extract_json_object(raw_response)
        except Exception as e:
            print(f"[chat.py ERROR] {e}")
            return ChatResponse(
                answer=FALLBACK_ANSWER,
                safety_status=None,
                violations=[],
                causes=[],
                health_risks=[],
                recommended_actions=[],
                sources_used=len(chunks),
                station_name=station_name,
                violated_params=violated_params,
                has_station_context=has_station_context,
            )

        is_station_question = _is_station_specific_question(request.message)
        is_risk_question = _is_station_risk_question(request.message)

        answer_text = str(parsed.get("answer", "")).strip()
        if not answer_text:
            causes_fallback = _to_list(parsed.get("causes", []))
            if causes_fallback:
                answer_text = causes_fallback[0]
            else:
                answer_text = FALLBACK_ANSWER

        # When a station is selected, prefer server-computed label and violations
        if has_station_context:
            violations_final = [ViolationDetail(**v) for v in server_violations]
            safety_status_final = station_safety_label

            # Build a short reason summary from server_violations to show to users
            if server_violations:
                reason_parts = []
                for v in server_violations:
                    param = v.get("parameter") or v.get("parameter", "")
                    value = v.get("value") or ""
                    limit = v.get("limit") or ""
                    reason_parts.append(f"{param} = {value} (limit: {limit})")
                reason_text = "; ".join(reason_parts)
                answer_text = f"Station label: {safety_status_final}. Reason: {reason_text}. " + answer_text
        else:
            violations_final = [
                ViolationDetail(**v)
                for v in parsed.get("violations", [])
                if isinstance(v, dict)
                and all(k in v for k in ["parameter", "value", "limit", "status"])
            ]
            safety_status_final = parsed.get("safety_status")

        return ChatResponse(
            answer=answer_text,
            safety_status=safety_status_final,
            violations=violations_final,
            causes=_normalize_response_list(parsed.get("causes", [])),
            health_risks=_normalize_response_list(parsed.get("health_risks", [])),
            recommended_actions=_normalize_response_list(parsed.get("recommended_actions", [])),
            sources_used=len(chunks),
            station_name=station_name,
            violated_params=violated_params,
            has_station_context=has_station_context,
        )
    except Exception as e:
        print(f"[chat.py ERROR] {e}")
        return ChatResponse(
            answer=FALLBACK_ANSWER,
            safety_status=None,
            violations=[],
            causes=[],
            health_risks=[],
            recommended_actions=[],
            sources_used=0,
            station_name=None,
            violated_params=[],
            has_station_context=False,
        )
