"""OneLake reader/writer for the pricing-sync function (SCD-2 price history).

Reads the current effective prices from the Fabric SQL endpoint, and writes the
updated ``prices.token_price_history`` Delta table to Fabric OneLake using the
Function's managed identity (no keys). Only models whose rate changed produce a new
effective-dated row; unchanged models are left untouched.
"""
from __future__ import annotations

import logging
import os
import struct
import uuid
from datetime import datetime, timezone

import pyodbc
import pyarrow as pa
from azure.identity import DefaultAzureCredential
from azure.storage.filedatalake import DataLakeServiceClient
from deltalake import write_deltalake

_ONELAKE = "https://onelake.dfs.fabric.microsoft.com"
_DB_SCOPE = "https://database.windows.net/.default"
_SQL_COPT_SS_ACCESS_TOKEN = 1256

_SCHEMA = os.environ.get("TOKENOMICS_PRICES_SCHEMA", "prices")
_TABLE = os.environ.get("TOKENOMICS_PRICES_TABLE", "token_price_history")
_SQL_HOST = os.environ.get("TOKENOMICS_SQL_ENDPOINT_HOST", "")
_LAKEHOUSE = os.environ.get("TOKENOMICS_LAKEHOUSE_NAME", "lh_tokenomics")
_ODBC = os.environ.get("TOKENOMICS_ODBC_DRIVER", "ODBC Driver 18 for SQL Server")

_RATE_COLUMNS = [
    "market_input_usd_per_million", "market_cached_input_usd_per_million",
    "market_cache_write_usd_per_million", "market_output_usd_per_million",
    "negotiated_input_usd_per_million", "negotiated_cached_input_usd_per_million",
    "negotiated_cache_write_usd_per_million", "negotiated_output_usd_per_million",
]


def _credential() -> DefaultAzureCredential:
    return DefaultAzureCredential(exclude_interactive_browser_credential=True)


def _sql_connection() -> pyodbc.Connection:
    token = _credential().get_token(_DB_SCOPE).token.encode("utf-16-le")
    struct_token = struct.pack(f"<I{len(token)}s", len(token), token)
    cs = (
        f"Driver={{{_ODBC}}};Server={_SQL_HOST},1433;Database={_LAKEHOUSE};"
        "Encrypt=yes;TrustServerCertificate=no;"
    )
    return pyodbc.connect(cs, attrs_before={_SQL_COPT_SS_ACCESS_TOKEN: struct_token}, timeout=30)


def read_current_prices() -> list[dict]:
    """Return all current rows (is_current = 1) from prices.token_price_history."""
    if not _SQL_HOST:
        logging.warning("TOKENOMICS_SQL_ENDPOINT_HOST not set; returning empty current set.")
        return []
    with _sql_connection() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM [{_SCHEMA}].[{_TABLE}] WHERE is_current = 1")
        columns = [c[0] for c in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def read_all_prices() -> list[dict]:
    """Return the entire price history (for a full-table rewrite)."""
    if not _SQL_HOST:
        return []
    with _sql_connection() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM [{_SCHEMA}].[{_TABLE}]")
        columns = [c[0] for c in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def _key(row: dict) -> tuple:
    return (row["source_code"], row["model_name"], row.get("model_version", ""))


def _rate_changed(current: dict, incoming: dict) -> bool:
    for col in _RATE_COLUMNS:
        if round(float(current.get(col) or 0), 6) != round(float(incoming.get(col) or 0), 6):
            return True
    return False


def _to_arrow(records: list[dict]) -> pa.Table:
    reference = records[0]
    fields, data = [], {}
    for name, sample in reference.items():
        if isinstance(sample, bool):
            t = pa.bool_(); values = [r.get(name) for r in records]
        elif isinstance(sample, int):
            t = pa.int64(); values = [r.get(name) for r in records]
        elif isinstance(sample, float):
            t = pa.float64(); values = [r.get(name) for r in records]
        else:
            t = pa.string(); values = [None if r.get(name) is None else str(r.get(name)) for r in records]
        fields.append(pa.field(name, t, nullable=True)); data[name] = values
    return pa.Table.from_pydict(data, schema=pa.schema(fields))


def _write_to_onelake(records: list[dict]) -> None:
    ws = os.environ["FABRIC_WORKSPACE_ID"]
    lh = os.environ["FABRIC_LAKEHOUSE_ID"]
    local = f"/tmp/{_SCHEMA}/{_TABLE}"
    write_deltalake(local, _to_arrow(records), mode="overwrite")
    fs = DataLakeServiceClient(account_url=_ONELAKE, credential=_credential()).get_file_system_client(ws)
    remote = f"{lh}/Tables/{_SCHEMA}/{_TABLE}"
    try:
        fs.get_directory_client(remote).delete_directory()
    except Exception:
        pass
    fs.get_directory_client(remote).create_directory()
    import pathlib
    for fp in sorted(pathlib.Path(local).rglob("*")):
        if fp.is_file():
            rel = fp.relative_to(local).as_posix()
            fs.get_file_client(f"{remote}/{rel}").upload_data(fp.read_bytes(), overwrite=True)


def upsert_price_changes(current: list[dict], incoming: list[dict], effective_at: datetime) -> int:
    """Apply SCD-2 changes: close changed current rows and append new effective rows.

    Returns the number of price changes written. When there are no changes, OneLake is
    not rewritten.
    """
    if not incoming:
        return 0
    now = effective_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    current_by_key = {_key(r): r for r in current}
    all_rows = read_all_prices()
    changes = 0
    new_rows: list[dict] = []

    for inc in incoming:
        cur = current_by_key.get(_key(inc))
        if cur is not None and not _rate_changed(cur, inc):
            continue  # unchanged
        changes += 1
        # Close the previous current row in the full history.
        for row in all_rows:
            if _key(row) == _key(inc) and row.get("is_current"):
                row["is_current"] = False
                row["effective_to"] = now
        new_rows.append({
            "price_id": f"{inc['source_code']}-{uuid.uuid4().hex[:12]}",
            "snapshot_id": uuid.uuid4().hex,
            **{k: inc[k] for k in (
                "source_code", "model_family", "model_name", "model_version",
                "currency", "unit_scale", *(_RATE_COLUMNS),
                "source_type", "source_name", "source_uri", "source_payload_sha256",
            )},
            "effective_from": now,
            "effective_to": None,
            "is_current": True,
        })

    if changes == 0:
        return 0

    # Align new rows to the existing column set where possible, then rewrite.
    combined = all_rows + new_rows if all_rows else new_rows
    _write_to_onelake(combined)
    return changes
