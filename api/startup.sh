#!/bin/bash
# App Service (Linux, code-hosted) startup for the Tokenomics FastAPI service.
# Installs the Microsoft ODBC Driver 18 (required by pyodbc for the Fabric SQL
# analytics endpoint) on first start, then launches uvicorn. Idempotent: the
# driver install is skipped when already present (e.g. warm restarts).
set -e

if ! (odbcinst -q -d 2>/dev/null | grep -q "ODBC Driver 18"); then
  echo "Installing msodbcsql18..."
  export DEBIAN_FRONTEND=noninteractive
  curl -sSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg 2>/dev/null || true
  curl -sSL https://packages.microsoft.com/config/debian/12/prod.list > /etc/apt/sources.list.d/mssql-release.list 2>/dev/null || true
  apt-get update -y || true
  ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 unixodbc || echo "WARNING: msodbcsql18 install failed"
fi

export TOKENOMICS_CONFIG_PATH="${TOKENOMICS_CONFIG_PATH:-/home/site/wwwroot/config/deployment.json}"
export TOKENOMICS_PROMPTS_PATH="${TOKENOMICS_PROMPTS_PATH:-/home/site/wwwroot/config/tokenomics-prompts.json}"

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
