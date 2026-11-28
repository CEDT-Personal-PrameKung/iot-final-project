"""Gemini / Vertex AI Express HTTP client for generating structured parking insights."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from src.features.insights.schemas import DailyInsightMetrics, GeminiInsightNarrative

logger = logging.getLogger(__name__)

GEMINI_DEVELOPER_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"

SYSTEM_PROMPT = (
    "You are an IoT Smart Parking operations analyst. "
    "Given compact JSON telemetry for today (Asia/Bangkok time), write a concise, "
    "factual English daily insight for drivers and lot operators. "
    "Cover how crowded the parking lot is today (including current availability, "
    "today's occupancy/peak if available, and barrier entrance queue activity) and "
    "what the weather and ambient light feel like based on BME280 and LDR readings. "
    "Never invent measurements that are null or missing; if environment data is missing, "
    "clearly state that live weather readings are not yet available. "
    "Keep every field short, clear, and practical."
)

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "headline": {"type": "STRING"},
        "crowdLevel": {
            "type": "STRING",
            "enum": ["low", "moderate", "busy", "full"],
        },
        "crowdSummary": {"type": "STRING"},
        "weatherMood": {
            "type": "STRING",
            "enum": ["comfortable", "warm", "hot", "humid", "cool", "unknown"],
        },
        "weatherSummary": {"type": "STRING"},
        "recommendation": {"type": "STRING"},
        "highlights": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
        },
    },
    "required": [
        "headline",
        "crowdLevel",
        "crowdSummary",
        "weatherMood",
        "weatherSummary",
        "recommendation",
        "highlights",
    ],
}


def resolve_gemini_endpoint(_api_key: str, model: str) -> str:
    """Build the Gemini Developer API `generateContent` endpoint URL."""
    cleaned_model = model.strip() or DEFAULT_GEMINI_MODEL
    if cleaned_model.startswith("models/"):
        cleaned_model = cleaned_model.removeprefix("models/")
    return f"{GEMINI_DEVELOPER_BASE_URL}/{cleaned_model}:generateContent"


def _extract_response_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Gemini response contained no candidates")
    first = candidates[0]
    if not isinstance(first, dict):
        raise ValueError("Gemini candidate payload was invalid")
    content = first.get("content")
    if not isinstance(content, dict):
        raise ValueError("Gemini candidate contained no content")
    parts = content.get("parts")
    if not isinstance(parts, list) or not parts:
        raise ValueError("Gemini content contained no parts")

    chunks = [
        part["text"]
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]
    text = "".join(chunks).strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if not text:
        raise ValueError("Gemini returned empty text")
    return text


async def generate_gemini_insight(
    metrics: DailyInsightMetrics,
    *,
    api_key: str,
    model: str = DEFAULT_GEMINI_MODEL,
    timeout_seconds: float = 20.0,
) -> GeminiInsightNarrative:
    """Call Gemini API and validate the structured JSON narrative response."""
    endpoint = resolve_gemini_endpoint(api_key, model)
    metrics_json = json.dumps(metrics.model_dump(by_alias=True, mode="json"))

    request_body = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_PROMPT}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Analyze this Smart Parking telemetry snapshot and return "
                            f"the structured JSON insight:\n{metrics_json}"
                        )
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }

    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.post(
            endpoint,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key.strip(),
            },
            json=request_body,
        )
        response.raise_for_status()
        raw_payload = response.json()

    raw_text = _extract_response_text(raw_payload)
    narrative = GeminiInsightNarrative.model_validate_json(raw_text)
    if len(narrative.highlights) > 4:
        narrative = narrative.model_copy(update={"highlights": narrative.highlights[:4]})
    return narrative
