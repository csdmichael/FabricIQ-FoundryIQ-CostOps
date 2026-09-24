#!/bin/bash
# App Service (Linux, code-hosted) startup for the Tokenomics FastAPI service.
# Oryx has already activated the antenv virtualenv and set the working directory
# to the extracted app, so we only install the Microsoft ODBC Driver 18 (needed
# by pyodbc at query time; the app still starts without it) and launch uvicorn.
if ! (odbcinst -q -d 2>/dev/null | grep -q "ODBC Driver 18"); then
  echo "Installing msodbcsql18..."
  export DEBIAN_FRONTEND=noninteractive
  curl -sSL https://packages.microsoft.com/keys/microsoft.asc -o /etc/apt/trusted.gpg.d/microsoft.asc 2>/dev/null || true
  curl -sSL https://packages.microsoft.com/config/debian/12/prod.list -o /etc/apt/sources.list.d/mssql-release.list 2>/dev/null || true
  apt-get update -y 2>/dev/null || true
  ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 unixodbc 2>/dev/null || echo "WARN: msodbcsql18 install failed"
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
