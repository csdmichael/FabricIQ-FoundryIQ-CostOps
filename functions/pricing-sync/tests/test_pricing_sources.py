from __future__ import annotations

import hashlib
import importlib.util
import json
from datetime import date, datetime
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SNAPSHOT_DIR = REPO_ROOT / "config" / "pricing-snapshots"
SOURCE_PATH = REPO_ROOT / "functions" / "pricing-sync" / "pricing_sources.py"

spec = importlib.util.spec_from_file_location("pricing_sources", SOURCE_PATH)
assert spec and spec.loader
pricing_sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pricing_sources)


@pytest.mark.parametrize(
    ("source_code", "source_uri"),
    [
        ("oai", "https://openai.com/api/pricing/"),
        ("cld", "https://platform.claude.com/docs/en/about-claude/pricing"),
    ],
)
def test_published_snapshot_envelope_and_provenance(source_code: str, source_uri: str) -> None:
    snapshot_path = SNAPSHOT_DIR / f"{source_code}.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

    assert snapshot["schemaVersion"] == 1
    assert snapshot["sourceCode"] == source_code
    assert snapshot["sourceUri"] == source_uri
    assert snapshot["sourceDocumentUri"].startswith("https://")
    assert snapshot["currency"] == "USD"
    assert snapshot["unitScale"] == 1_000_000
    assert date.fromisoformat(snapshot["effectiveFrom"]) <= datetime.fromisoformat(
        snapshot["observedAt"]
    ).date()
    assert snapshot["effectiveThrough"] is None
    assert snapshot["models"]

    model_names = set()
    for model in snapshot["models"]:
        assert model["family"]
        assert model["name"] not in model_names
        model_names.add(model["name"])
        for rate_name in ("input", "cached_input", "cache_write", "output"):
            assert isinstance(model[rate_name], (int, float))
            assert model[rate_name] >= 0


@pytest.mark.parametrize("source_code", ["oai", "cld"])
def test_loader_reads_and_hashes_published_snapshot(source_code: str) -> None:
    deployment = json.loads(
        (REPO_ROOT / "config" / "deployment.json").read_text(encoding="utf-8-sig")
    )
    source = next(
        source
        for source in deployment["tokenomicsPlatform"]["pricing"]["sources"]
        if source["sourceCode"] == source_code
    )

    models, payload = pricing_sources._fetch_published_snapshot(source)
    normalized = pricing_sources._normalize(source, 0.12, models, payload)

    assert len(normalized) == len(models)
    assert {rate["source_code"] for rate in normalized} == {source_code}
    assert {rate["source_uri"] for rate in normalized} == {source["sourceUri"]}
    assert {rate["source_payload_sha256"] for rate in normalized} == {
        hashlib.sha256(payload).hexdigest()
    }


def test_representative_current_published_rates() -> None:
    openai = json.loads((SNAPSHOT_DIR / "oai.json").read_text(encoding="utf-8"))
    anthropic = json.loads((SNAPSHOT_DIR / "cld.json").read_text(encoding="utf-8"))
    openai_models = {model["name"]: model for model in openai["models"]}
    anthropic_models = {model["name"]: model for model in anthropic["models"]}

    assert openai_models["gpt-6-astra"] == {
        "family": "GPT-6",
        "name": "gpt-6-astra",
        "input": 10.0,
        "cached_input": 1.0,
        "cache_write": 12.5,
        "output": 50.0,
    }
    assert anthropic_models["claude-sonnet-5"] == {
        "family": "Claude Sonnet",
        "name": "claude-sonnet-5",
        "input": 2.0,
        "cached_input": 0.2,
        "cache_write": 2.5,
        "output": 10.0,
    }
