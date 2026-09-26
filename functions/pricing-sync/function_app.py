"""Pricing sync Azure Function — keeps prices.token_price_history fresh in Fabric.

Timer-triggered. On each run it:
  1. Reads the current effective prices from ``prices.token_price_history`` (via the
     Fabric SQL endpoint) using the Function's managed identity.
  2. Fetches the latest model rates from the configured provider pricing sources.
  3. Diffs against the current rows and, for any model whose rate changed, closes the
     previous row (``effective_to`` / ``is_current = false``) and appends a new
     effective-dated row (SCD-2).
  4. Writes the updated table to Fabric OneLake as Delta via managed identity.

All configuration comes from environment variables set by the Bicep/Terraform IaC:
  TOKENOMICS_SQL_ENDPOINT_HOST, TOKENOMICS_LAKEHOUSE_NAME,
  TOKENOMICS_PRICES_SCHEMA, TOKENOMICS_PRICES_TABLE, PRICING_SYNC_SCHEDULE,
  FABRIC_WORKSPACE_ID, FABRIC_LAKEHOUSE_ID.

No secrets are stored: DefaultAzureCredential resolves the managed identity in Azure.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import azure.functions as func

from pricing_sources import fetch_all_rates
from onelake_writer import read_current_prices, upsert_price_changes

app = func.FunctionApp()

_SCHEDULE = os.environ.get("PRICING_SYNC_SCHEDULE", "0 0 6 * * *")


@app.function_name(name="pricing_sync")
@app.timer_trigger(schedule=_SCHEDULE, arg_name="timer", run_on_startup=False, use_monitor=True)
def pricing_sync(timer: func.TimerRequest) -> None:
    started = datetime.now(timezone.utc)
    logging.info("pricing-sync started at %s (schedule %s)", started.isoformat(), _SCHEDULE)

    try:
        current = read_current_prices()
        logging.info("Loaded %d current price rows from Fabric.", len(current))

        rates = fetch_all_rates()
        logging.info("Fetched %d model rates from pricing sources.", len(rates))

        changed = upsert_price_changes(current, rates, effective_at=started)
        logging.info("pricing-sync complete: %d price change(s) written.", changed)
    except Exception:  # pragma: no cover - runtime dependent
        logging.exception("pricing-sync failed")
        raise
