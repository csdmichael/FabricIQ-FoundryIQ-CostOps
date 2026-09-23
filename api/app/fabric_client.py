"""Fabric Lakehouse SQL analytics endpoint client.

Connects to the Microsoft Fabric SQL endpoint using an Entra ID access token
obtained from :class:`azure.identity.DefaultAzureCredential`. This works with an
Azure CLI login locally and a managed identity in Azure App Service without any
code change or stored secret.
"""
from __future__ import annotations

import struct
from typing import Any

import pyodbc
from azure.identity import DefaultAzureCredential

from .config import Settings

# SQL Server ODBC option for pre-authenticated access tokens.
_SQL_COPT_SS_ACCESS_TOKEN = 1256
_DATABASE_SCOPE = "https://database.windows.net/.default"


class FabricSqlClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)

    def _token_struct(self) -> bytes:
        token = self._credential.get_token(_DATABASE_SCOPE).token
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
            timeout=settings.sql_connect_timeout,
        )

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as connection:
            connection.timeout = self._settings.sql_query_timeout
            cursor = connection.cursor()
            cursor.execute(sql, params)
            columns = [column[0] for column in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def scalar(self, sql: str, params: tuple[Any, ...] = ()) -> Any:
        rows = self.query(sql, params)
        if not rows:
            return None
        return next(iter(rows[0].values()))

    def ping(self) -> bool:
        return bool(self.scalar("SELECT 1"))
