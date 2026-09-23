"""Upload locally-materialized Delta tables to the Fabric Lakehouse OneLake.

Uses the ADLS Gen2 SDK (azure-storage-file-datalake) against the OneLake DFS
endpoint, which correctly creates managed-table directories and uploads Delta
files. Authentication uses AzureCliCredential locally / DefaultAzureCredential in
Azure, so no secret is stored.

Fabric workspace + lakehouse identifiers are read from the generated Fabric
metadata (.generated/tokenomics/fabric.json) — nothing is hard-coded.
"""
from __future__ import annotations

import json
from pathlib import Path

from azure.identity import AzureCliCredential
from azure.storage.filedatalake import DataLakeServiceClient

REPO_ROOT = Path(__file__).resolve().parents[2]
ONELAKE_ACCOUNT_URL = "https://onelake.dfs.fabric.microsoft.com"


def load_metadata() -> dict:
    with open(REPO_ROOT / ".generated" / "tokenomics" / "fabric.json", "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def main() -> None:
    metadata = load_metadata()
    workspace_id = metadata["workspaceId"]
    lakehouse_id = metadata["lakehouseId"]

    credential = AzureCliCredential()
    service = DataLakeServiceClient(account_url=ONELAKE_ACCOUNT_URL, credential=credential)
    filesystem = service.get_file_system_client(workspace_id)

    staging_root = REPO_ROOT / ".generated" / "tokenomics" / "staging" / "Tables"
    tables = [
        table
        for schema in staging_root.iterdir()
        if schema.is_dir()
        for table in schema.iterdir()
        if table.is_dir() and (table / "_delta_log").is_dir()
    ]
    print(f"Found {len(tables)} Delta tables to upload to Fabric OneLake...")

    total_files = 0
    for table_dir in tables:
        schema, table = table_dir.relative_to(staging_root).parts
        remote_base = f"{lakehouse_id}/Tables/{schema}/{table}"

        # Replace the managed table directory for a clean overwrite.
        try:
            filesystem.get_directory_client(remote_base).delete_directory()
        except Exception:
            pass
        filesystem.get_directory_client(remote_base).create_directory()

        for file_path in sorted(table_dir.rglob("*")):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(table_dir).as_posix()
            file_client = filesystem.get_file_client(f"{remote_base}/{rel}")
            file_client.upload_data(file_path.read_bytes(), overwrite=True)
            total_files += 1
        print(f"  Uploaded {schema}.{table}")

    print(f"Successfully uploaded {total_files} files across {len(tables)} tables to OneLake.")


if __name__ == "__main__":
    main()
