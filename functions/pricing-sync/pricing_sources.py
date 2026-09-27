"""Provider pricing sources for the pricing-sync function.

Loads the configured pricing sources from ``config/deployment.json`` and returns
normalized model rates in the ``prices.token_price_history`` column shape. The
catalog APIs (AWS/GCP/Azure) require network egress and, for GCP, an API key; the
published snapshots (OpenAI/Anthropic) are curated. Each parser is intentionally
isolated so a single failing source never blocks the others.

Returned rate dict shape (per model):
    {
      "source_code", "model_family", "model_name", "model_version",
      "currency", "unit_scale",
      "market_input_usd_per_million", "market_cached_input_usd_per_million",
      "market_cache_write_usd_per_million", "market_output_usd_per_million",
      "negotiated_input_usd_per_million", "negotiated_cached_input_usd_per_million",
      "negotiated_cache_write_usd_per_million", "negotiated_output_usd_per_million",
      "source_type", "source_name", "source_uri", "source_payload_sha256"
    }
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path

import requests

_CONFIG_PATH = os.environ.get(
    "TOKENOMICS_CONFIG_PATH",
    str(Path(__file__).resolve().parents[2] / "config" / "deployment.json"),
)
_SNAPSHOT_DIR = Path(_CONFIG_PATH).resolve().parent / "pricing-snapshots"


def _load_pricing_config() -> dict:
    with open(_CONFIG_PATH, "r", encoding="utf-8-sig") as handle:
        config = json.load(handle)
    return config.get("tokenomicsPlatform", {}).get("pricing", {})


def _discount(config: dict) -> float:
    return float(config.get("negotiatedDiscountPercent", 12)) / 100.0


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _normalize(source: dict, discount: float, models: list[dict], payload: bytes) -> list[dict]:
    """Apply the negotiated discount and stamp provenance onto raw model rates."""
    out = []
    digest = _sha256(payload)
    for m in models:
        mi = float(m.get("input", 0.0))
        mci = float(m.get("cached_input", mi * 0.5))
        mcw = float(m.get("cache_write", mi))
        mo = float(m.get("output", 0.0))
        out.append({
            "source_code": source["sourceCode"],
            "model_family": m["family"],
            "model_name": m["name"],
            "model_version": m.get("version", ""),
            "currency": "USD",
            "unit_scale": 1000000,
            "market_input_usd_per_million": mi,
            "market_cached_input_usd_per_million": mci,
            "market_cache_write_usd_per_million": mcw,
            "market_output_usd_per_million": mo,
            "negotiated_input_usd_per_million": round(mi * (1 - discount), 6),
            "negotiated_cached_input_usd_per_million": round(mci * (1 - discount), 6),
            "negotiated_cache_write_usd_per_million": round(mcw * (1 - discount), 6),
            "negotiated_output_usd_per_million": round(mo * (1 - discount), 6),
            "source_type": source["sourceType"],
            "source_name": source["sourceName"],
            "source_uri": source["sourceUri"],
            "source_payload_sha256": digest,
        })
    return out


def _fetch_published_snapshot(source: dict) -> tuple[list[dict], bytes]:
    """Curated published-price snapshots (OpenAI Direct, Anthropic Claude).

    Snapshots are versioned alongside the repo under ``config/pricing-snapshots``.
    """
    snap = _SNAPSHOT_DIR / f"{source['sourceCode']}.json"
    if not snap.exists():
        logging.warning("No published snapshot for %s at %s", source["sourceCode"], snap)
        return []
    payload = snap.read_bytes()
    return json.loads(payload).get("models", []), payload


def _fetch_catalog_api(source: dict) -> tuple[list[dict], bytes]:
    """Live catalog APIs (AWS/GCP/Azure). Requires network egress; GCP needs a key."""
    headers = {}
    key_env = source.get("apiKeyEnvironmentVariable")
    if key_env and os.environ.get(key_env):
        headers["x-api-key"] = os.environ[key_env]
    resp = requests.get(source["sourceUri"], headers=headers, timeout=int(source.get("timeoutSeconds", 60)))
    resp.raise_for_status()
    payload = resp.content
    # Provider-specific parsing lives in the offline generator; here we accept a
    # normalized {models:[...]} contract when the catalog already returns it, and
    # otherwise skip (leaving the last-known snapshot in place).
    try:
        models = resp.json().get("models", [])
    except ValueError:
        models = []
    return models, payload


def fetch_all_rates() -> list[dict]:
    pricing = _load_pricing_config()
    discount = _discount(pricing)
    rates: list[dict] = []
    for source in pricing.get("sources", []):
        if not source.get("enabled", True):
            continue
        try:
            if source["sourceType"] == "catalog_api":
                models, payload = _fetch_catalog_api(source)
            else:
                models, payload = _fetch_published_snapshot(source)
            rates.extend(_normalize(source, discount, models, payload))
        except Exception:  # pragma: no cover - network dependent
            logging.exception("Pricing source %s failed; skipping.", source.get("sourceCode"))
    return rates
