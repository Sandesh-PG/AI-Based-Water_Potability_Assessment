"""Generate pollution insights using RAG context and Groq LLM.

This module retrieves relevant chunks from the local knowledge base and asks
Groq (llama3-8b-8192) to produce structured JSON with:
1) causes of pollution
2) recommended measures
"""

from __future__ import annotations
from dotenv import load_dotenv
load_dotenv()

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

try:
    from .rag_pipeline import query_knowledge_base
except ImportError:
    from rag_pipeline import query_knowledge_base

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"


def _normalize_violated_params(violated_params: str | list[str]) -> list[str]:
    if isinstance(violated_params, list):
        return [str(item).strip() for item in violated_params if str(item).strip()]
    if not violated_params:
        return []
    return [item.strip() for item in str(violated_params).split(",") if item.strip()]


def _build_retrieval_query(
    violated_params: list[str],
    water_body_type: str,
    station_name: str,
) -> str:
    joined = ", ".join(violated_params) if violated_params else "water quality violations"
    return (
        f"Pollution causes and mitigation for {water_body_type} water body at "
        f"{station_name}. Violated parameters: {joined}."
    )


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z]*\n", "", stripped)
        stripped = re.sub(r"\n```$", "", stripped)
    return stripped.strip()


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start : end + 1]
        return json.loads(candidate)

    raise ValueError("Model response does not contain valid JSON")


def _call_groq(messages: list[dict[str, str]], temperature: float = 0.2) -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set")

    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    req = urllib.request.Request(
        GROQ_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Groq API HTTP {exc.code}: {details}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Groq API request failed: {exc.reason}") from exc

    data = json.loads(body)
    return data["choices"][0]["message"]["content"]


def generate_pollution_insights(
    violated_params: str | list[str],
    water_body_type: str,
    station_name: str,
    n_results: int = 5,
) -> dict[str, Any]:
    """Generate structured pollution insights JSON using RAG and Groq.

    Returns a dict with keys:
    - station_name
    - water_body_type
    - violated_params
    - retrieved_context_count
    - causes_of_pollution
    - recommended_measures
    """
    params_list = _normalize_violated_params(violated_params)
    retrieval_query = _build_retrieval_query(params_list, water_body_type, station_name)

    chunks = query_knowledge_base(retrieval_query, n_results=n_results)
    context_text = "\n\n".join(f"Context {i + 1}: {chunk}" for i, chunk in enumerate(chunks))

    system_prompt = (
        "You are a water quality domain expert. "
        "Use only provided context and clear domain reasoning. "
        "Return strict JSON only."
    )

    user_prompt = (
        "Generate a structured analysis for water pollution at a station.\n"
        f"Station name: {station_name}\n"
        f"Water body type: {water_body_type}\n"
        f"Violated parameters: {params_list if params_list else ['None provided']}\n\n"
        "Retrieved context:\n"
        f"{context_text if context_text else 'No relevant context retrieved.'}\n\n"
        "Output JSON schema exactly with these keys:\n"
        "{\n"
        '  "station_name": "string",\n'
        '  "water_body_type": "string",\n'
        '  "violated_params": ["string"],\n'
        '  "causes_of_pollution": ["string"],\n'
        '  "recommended_measures": ["string"],\n'
        '  "retrieved_context_count": 0\n'
        "}\n"
        "Rules:\n"
        "1) Provide 3-7 concise causes in causes_of_pollution.\n"
        "2) Provide 3-7 actionable recommendations in recommended_measures.\n"
        "3) Do not include markdown or extra keys."
    )

    raw_response = _call_groq(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )

    parsed = _extract_json_object(raw_response)

    result = {
        "station_name": str(parsed.get("station_name", station_name)),
        "water_body_type": str(parsed.get("water_body_type", water_body_type)),
        "violated_params": parsed.get("violated_params", params_list),
        "causes_of_pollution": parsed.get("causes_of_pollution", []),
        "recommended_measures": parsed.get("recommended_measures", []),
        "retrieved_context_count": len(chunks),
    }

    if not isinstance(result["violated_params"], list):
        result["violated_params"] = params_list
    if not isinstance(result["causes_of_pollution"], list):
        result["causes_of_pollution"] = []
    if not isinstance(result["recommended_measures"], list):
        result["recommended_measures"] = []

    result["causes_of_pollution"] = [str(x).strip() for x in result["causes_of_pollution"] if str(x).strip()]
    result["recommended_measures"] = [str(x).strip() for x in result["recommended_measures"] if str(x).strip()]
    result["violated_params"] = [str(x).strip() for x in result["violated_params"] if str(x).strip()]

    return result


if __name__ == "__main__":
    # Example (requires GROQ_API_KEY and pre-ingested RAG collection):
    # print(generate_pollution_insights("High BOD, Low DO", "River", "Station A", n_results=5))
    pass
