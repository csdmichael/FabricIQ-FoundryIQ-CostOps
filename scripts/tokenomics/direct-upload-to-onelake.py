import concurrent.futures
import json
import os
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

repo_root = Path(__file__).resolve().parents[2]


def encoded_path(value):
    return '/'.join(urllib.parse.quote(segment, safe='') for segment in value.split('/'))


class OneLakeClient:
    def __init__(self, workspace_id, lakehouse_id, token):
        self.workspace_id = workspace_id
        self.lakehouse_id = lakehouse_id
        self.token = token

    def _uri(self, endpoint, path, query=''):
        suffix = f'?{query}' if query else ''
        return (
            f'https://onelake.{endpoint}.fabric.microsoft.com/{self.workspace_id}/{self.lakehouse_id}/'
            f'{encoded_path(path)}{suffix}'
        )

    def _request(self, method, uri, data=None, headers=None):
        for attempt in range(1, 7):
            request = urllib.request.Request(uri, data=data, method=method)
            request.add_header('Authorization', f'Bearer {self.token}')
            request.add_header('x-ms-version', '2023-11-03')
            for name, value in (headers or {}).items():
                request.add_header(name, value)
            try:
                with urllib.request.urlopen(request) as response:
                    return response.status, None
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    return error.code, None
                if attempt < 6 and (error.code == 429 or error.code >= 500):
                    time.sleep(int(error.headers.get('Retry-After', 5)))
                    continue
                return error.code, error.read().decode('utf-8')
            except Exception as error:
                if attempt < 6:
                    time.sleep(5)
                    continue
                return 0, str(error)

    def exists(self, path):
        status, _ = self._request('HEAD', self._uri('dfs', path))
        return status in (200, 206)

    def file_exists(self, path):
        status, _ = self._request('HEAD', self._uri('blob', path))
        return status in (200, 206)

    def delete(self, path):
        status, _ = self._request('DELETE', self._uri('dfs', path, 'recursive=true'))
        return status in (200, 202, 204, 404)

    def upload(self, source, destination):
        status, error = self._request(
            'PUT',
            self._uri('blob', destination),
            data=source.read_bytes(),
            headers={
                'x-ms-blob-type': 'BlockBlob',
                'Content-Type': 'application/octet-stream',
            },
        )
        if status not in (200, 201):
            raise RuntimeError(f'Unable to upload OneLake file {destination}: HTTP {status} {error}')


def main():
    metadata_path = repo_root / '.generated' / 'tokenomics' / 'fabric.json'
    with open(metadata_path, 'r', encoding='utf-8-sig') as f:
        metadata = json.load(f)

    workspace_id = metadata['workspaceId']
    lakehouse_id = metadata['lakehouseId']

    az_cmd = 'az.cmd' if os.name == 'nt' else 'az'
    token = subprocess.check_output(
        [az_cmd, 'account', 'get-access-token', '--resource', 'https://storage.azure.com/', '--query', 'accessToken', '-o', 'tsv'],
        text=True,
        shell=os.name == 'nt',
    ).strip()

    client = OneLakeClient(workspace_id, lakehouse_id, token)
    staging_root = repo_root / '.generated' / 'tokenomics' / 'staging' / 'Tables'

    tables = []
    for schema in staging_root.iterdir():
        if not schema.is_dir():
            continue
        for table in schema.iterdir():
            if table.is_dir() and (table / '_delta_log').is_dir():
                tables.append(table)

    print(f'Found {len(tables)} Delta tables to upload to Fabric OneLake...')

    print('Deleting existing remote table directories for a clean overwrite...')
    for table_dir in tables:
        schema, table = table_dir.relative_to(staging_root).parts
        dest_base = f'Tables/{schema}/{table}'
        if client.exists(dest_base):
            client.delete(dest_base)
            print(f'  Cleared remote {dest_base}')

    uploads = []
    for table_dir in tables:
        schema, table = table_dir.relative_to(staging_root).parts
        dest_base = f'Tables/{schema}/{table}'
        for file_path in table_dir.rglob('*'):
            if file_path.is_file():
                rel_path = file_path.relative_to(table_dir).as_posix()
                dest_file = f'{dest_base}/{rel_path}'
                uploads.append((file_path, dest_file))

    print(f'Uploading {len(uploads)} files across {len(tables)} tables to OneLake (concurrency=8)...')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(client.upload, src, dst): dst for src, dst in uploads}
        completed = 0
        for f in concurrent.futures.as_completed(futures):
            dst = futures[f]
            try:
                f.result()
                completed += 1
                if completed % 20 == 0 or completed == len(uploads):
                    print(f'Uploaded {completed}/{len(uploads)} files...')
            except Exception as e:
                print(f'Failed to upload {dst}: {e}')
                raise

    print('Successfully uploaded all updated tokenomics Delta tables to Microsoft Fabric OneLake!')


if __name__ == '__main__':
    main()
