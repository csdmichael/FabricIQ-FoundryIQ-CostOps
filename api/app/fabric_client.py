"""Fabric Lakehouse SQL analytics endpoint client (resilient).

Connects to the Microsoft Fabric SQL endpoint using an Entra ID access token from
:class:`azure.identity.DefaultAzureCredential`. Adds demo-grade reliability:

* **Error classification** - raw ODBC failures are turned into a :class:`FabricError`
  carrying a human reason + remediation (e.g. "Fabric capacity is paused - resume it")
  and the right HTTP status, so the UI can show the *real* cause, not "Failed to fetch".
* **Bounded retry** - transient timeouts / connectivity blips get one quick retry with
  short backoff (never long stalls in front of an audience).
* **Circuit breaker** - after a couple of consecutive failures the breaker opens and
  calls fail *fast* (no repeated multi-second hangs) until a short cool-down half-opens it.
"""
from __future__ import annotations

import logging
import struct
import time
from typing import Any

import pyodbc
from azure.identity import DefaultAzureCredential

from .config import Settings

logger = logging.getLogger("tokenomics.fabric")

# SQL Server ODBC option for pre-authenticated access tokens.
_SQL_COPT_SS_ACCESS_TOKEN = 1256
_DATABASE_SCOPE = "https://database.windows.net/.default"


class FabricError(RuntimeError):
    """A classified Fabric failure with a demo-friendly reason and remediation."""

    def __init__(self, category: str, reason: str, remediation: str,
                 http_status: int, detail: str = "") -> None:
        super().__init__(reason)
        self.category = category
        self.reason = reason
        self.remediation = remediation
        self.http_status = http_status
        self.detail = detail

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "reason": self.reason,
            "remediation": self.remediation,
            "detail": self.detail,
        }


# category -> (http_status, reason, remediation)
_CATEGORY_INFO = {
    "capacity_paused": (
        503,
        "Microsoft Fabric capacity is paused or resuming.",
        "Resume the Fabric capacity (Azure portal -> Fabric capacity -> Resume, or `az fabric capacity resume`), then retry. A cold start can take ~30-60 seconds.",
    ),
    "auth": (
        401,
        "The analytics API could not authenticate to Fabric.",
        "Sign in again and confirm the API's managed identity has access to the Fabric workspace SQL endpoint.",
    ),
    "timeout": (
        504,
        "The Fabric SQL query timed out.",
        "The capacity may be resuming or under load. Wait a few seconds and retry.",
    ),
    "unreachable": (
        503,
        "The Fabric SQL endpoint is unreachable.",
        "Check network/VNet connectivity to the Fabric SQL endpoint and that the capacity is running.",
    ),
    "circuit_open": (
        503,
        "Fabric is temporarily unavailable - failing fast to avoid long delays.",
        "The service auto-recovers within a few seconds. Retry shortly; if it persists, resume the Fabric capacity.",
    ),
    "query_error": (
        502,
        "A Fabric query failed.",
        "Verify the Lakehouse tables exist and the capacity is active; see technical detail below.",
    ),
}


def _classify(exc: Exception) -> str:
    text = f"{getattr(exc, 'args', '')} {exc}".lower()
    sqlstate = ""
    if getattr(exc, "args", None):
        first = str(exc.args[0])
        if len(first) <= 6:
            sqlstate = first.upper()
    if any(k in text for k in ("paused", "resume", "not currently available",
                               "is not available", "currently unavailable", "suspend",
                               "capacity")):
        return "capacity_paused"
    if any(k in text for k in ("login failed", "18456", "aadsts", "unauthorized",
                               "forbidden", "access token", "not authorized")) or sqlstate in ("28000", "42000"):
        return "auth"
    if "timeout" in text or "timed out" in text or sqlstate in ("HYT00", "HYT01"):
        return "timeout"
    if any(k in text for k in ("server was not found", "tcp provider", "getaddrinfo",
                               "network-related", "refused", "no such host",
                               "unable to connect")) or sqlstate in ("08001", "08S01", "08S02"):
        return "unreachable"
    return "query_error"


def _error(category: str, detail: str = "") -> "FabricError":
    status, reason, remediation = _CATEGORY_INFO[category]
    return FabricError(category, reason, remediation, status, detail)


class _CircuitBreaker:
    """Minimal breaker: opens after N consecutive failures, half-opens after cooldown."""

    def __init__(self, fail_threshold: int = 2, reset_seconds: float = 15.0) -> None:
        self._fail_threshold = fail_threshold
        self._reset_seconds = reset_seconds
        self._failures = 0
        self._opened_at: float | None = None

    def allow(self) -> bool:
        if self._opened_at is None:
            return True
        return (time.monotonic() - self._opened_at) >= self._reset_seconds

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self._fail_threshold:
            self._opened_at = time.monotonic()


# Categories worth one quick retry (transient); capacity/auth are not retried
# because they need operator action and we must not stall the demo.
_RETRYABLE = {"timeout", "unreachable"}


class FabricSqlClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)
        self._breaker = _CircuitBreaker()
        # Bound the connect time so a paused capacity fails fast instead of hanging.
        self._connect_timeout = min(int(settings.sql_connect_timeout), 8)

    def _token_struct(self) -> bytes:
        try:
            token = self._credential.get_token(_DATABASE_SCOPE).token
        except Exception as exc:  # noqa: BLE001 - credential failure = auth problem
            raise _error("auth", str(exc)) from exc
        token_bytes = token.encode("utf-16-le")
        return struct.pack(f"<I{len(token_bytes)}s", len(token_bytes), token_bytes)

    def _connect(self) -> pyodbc.Connection:
        settings = self._settings
        connection_string = (
            f"Driver={{{settings.odbc_driver}}};"
            f"Server={settings.sql_endpoint_host},1433;"
            f"Database={settings.lakehouse_name};"
            "Encrypt=yes;TrustServerCertificate=no;"
        )
        return pyodbc.connect(
            connection_string,
            attrs_before={_SQL_COPT_SS_ACCESS_TOKEN: self._token_struct()},
            timeout=self._connect_timeout,
        )

    def _run(self, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        with self._connect() as connection:
            connection.timeout = self._settings.sql_query_timeout
            cursor = connection.cursor()
            cursor.execute(sql, params)
            if cursor.description is None:
                return []
            columns = [column[0] for column in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        # Fast-fail when the breaker is open to avoid long stalls on stage.
        if not self._breaker.allow():
            raise _error("circuit_open")

        attempts = 2
        last_category = "query_error"
        last_detail = ""
        for attempt in range(1, attempts + 1):
            try:
                rows = self._run(sql, params)
                self._breaker.record_success()
                return rows
            except FabricError:  # already classified (e.g. auth token failure)
                self._breaker.record_failure()
                raise
            except Exception as exc:  # noqa: BLE001
                last_category = _classify(exc)
                last_detail = str(exc)
                logger.warning("Fabric query failed (attempt %s/%s, %s): %s",
                               attempt, attempts, last_category, last_detail)
                if last_category in _RETRYABLE and attempt < attempts:
                    time.sleep(0.5)
                    continue
                break
        self._breaker.record_failure()
        raise _error(last_category, last_detail)

    def scalar(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        rows = self.query(sql, params)
        if not rows:
            return None
        return next(iter(rows[0].values()))

    def ping(self) -> bool:
        return bool(self.scalar("SELECT 1"))

    def diagnose(self) -> dict:
        """Structured health probe used by /health: returns ok or the classified reason."""
        try:
            ok = self.ping()
            return {"ok": bool(ok), "category": "ok",
                    "reason": "Fabric SQL endpoint reachable.", "remediation": ""}
        except FabricError as exc:
            return {"ok": False, **exc.to_dict()}
        except Exception as exc:  # noqa: BLE001
            err = _error(_classify(exc), str(exc))
            return {"ok": False, **err.to_dict()}
