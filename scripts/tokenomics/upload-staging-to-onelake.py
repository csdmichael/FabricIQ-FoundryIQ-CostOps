import argparse
import concurrent.futures
import json
import os
import subprocess
import time
import urllib.error
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
        status, error = self._request('HEAD', self._uri('dfs', path))
        if status == 404:
            return False
        if status not in (200, 206):
            raise RuntimeError(f'Unable to inspect OneLake path {path}: HTTP {status} {error}')
        return True

    def file_exists(self, path):
        status, error = self._request('HEAD', self._uri('blob', path))
        if status not in (200, 206):
            raise RuntimeError(f'Unable to verify staged OneLake file {path}: HTTP {status} {error}')
        return True

    def delete(self, path):
        status, error = self._request('DELETE', self._uri('dfs', path, 'recursive=true'))
        if status not in (200, 202, 204, 404):
            raise RuntimeError(f'Unable to delete OneLake path {path}: HTTP {status} {error}')

    def rename(self, source, destination):
        rename_source = urllib.parse.quote(
            f'/{self.workspace_id}/{self.lakehouse_id}/{source}',
            safe='/',
        )
        status, error = self._request(
            'PUT',
            self._uri('dfs', destination, 'resource=directory'),
            headers={'x-ms-rename-source': rename_source},
        )
        if status not in (200, 201):
            raise RuntimeError(f'Unable to rename OneLake path {source} to {destination}: HTTP {status} {error}')

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


def write_transaction(path, transaction):
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f'{path.suffix}.tmp')
    temporary_path.write_text(json.dumps(transaction, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary_path, path)


def rollback_transaction(client, transaction):
    errors = []
    for entry in reversed(transaction['tables']):
        try:
            if entry['swapped']:
                final_exists = client.exists(entry['finalPath'])
                backup_exists = client.exists(entry['backupPath'])
                if entry['hadOriginal']:
                    if backup_exists:
                        if final_exists:
                            client.delete(entry['finalPath'])
                        client.rename(entry['backupPath'], entry['finalPath'])
                    elif not final_exists:
                        raise RuntimeError(f"Neither live nor backup table exists for {entry['finalPath']}.")
                elif final_exists:
                    client.delete(entry['finalPath'])
            if client.exists(entry['stagePath']):
                client.delete(entry['stagePath'])
            if entry['swapped']:
                final_exists = client.exists(entry['finalPath'])
                backup_exists = client.exists(entry['backupPath'])
                if entry['hadOriginal'] and (not final_exists or backup_exists):
                    raise RuntimeError(f"Original table restoration could not be verified for {entry['finalPath']}.")
                if not entry['hadOriginal'] and final_exists:
                    raise RuntimeError(f"New table removal could not be verified for {entry['finalPath']}.")
        except Exception as error:
            errors.append(str(error))
    if errors:
        raise RuntimeError(f'OneLake rollback failed: {"; ".join(errors)}')


def finalize_transaction(client, transaction):
    errors = []
    for entry in transaction['tables']:
        try:
            if client.exists(entry['backupPath']):
                client.delete(entry['backupPath'])
            if client.exists(entry['stagePath']):
                client.delete(entry['stagePath'])
        except Exception as error:
            errors.append(str(error))
    if errors:
        raise RuntimeError(f'OneLake finalization failed: {"; ".join(errors)}')


def validate_transaction_target(transaction, target):
    for name in ('workspaceId', 'lakehouseId', 'configFingerprint'):
        if transaction.get(name) != target.get(name):
            raise RuntimeError(f'OneLake transaction {name} does not match the active Fabric target.')


def synchronize_tables(client, staging_root, deployment_id, transaction_path=None, target=None, max_workers=10):
    table_directories = sorted(
        table
        for schema in staging_root.iterdir()
        if schema.is_dir()
        for table in schema.iterdir()
        if table.is_dir() and (table / '_delta_log').is_dir()
    )
    if not table_directories:
        raise RuntimeError(f'No Delta tables found in {staging_root}.')

    transaction = {
        'schemaVersion': 1,
        'deploymentId': deployment_id,
        'phase': 'swapping',
        **(target or {}),
        'tables': [],
    }
    uploads = []
    for table_directory in table_directories:
        schema, table = table_directory.relative_to(staging_root).parts
        final_path = f'Tables/{schema}/{table}'
        stage_path = f'Tables/{schema}/__stage_{table}_{deployment_id}'
        backup_path = f'Tables/{schema}/__backup_{table}_{deployment_id}'
        if client.exists(backup_path):
            raise RuntimeError(f'Unresolved OneLake backup found at {backup_path}. Roll back or finalize the prior transaction first.')
        if client.exists(stage_path):
            client.delete(stage_path)

        transaction['tables'].append({
            'finalPath': final_path,
            'stagePath': stage_path,
            'backupPath': backup_path,
            'hadOriginal': False,
            'swapped': False,
        })

        for source_path in table_directory.rglob('*'):
            if source_path.is_file():
                suffix = source_path.relative_to(table_directory).as_posix()
                uploads.append((source_path, f'{stage_path}/{suffix}'))

    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(client.upload, source, destination): destination
            for source, destination in uploads
        }
        for future in concurrent.futures.as_completed(future_map):
            try:
                future.result()
            except Exception as error:
                failures.append(f'{future_map[future]}: {error}')
    if failures:
        rollback_transaction(client, transaction)
        raise RuntimeError(f'OneLake staging failed for {len(failures)} file(s): {"; ".join(failures[:5])}')

    for _, destination in uploads:
        client.file_exists(destination)

    for entry in transaction['tables']:
        entry['hadOriginal'] = client.exists(entry['finalPath'])
    write_transaction(transaction_path, transaction)

    try:
        for entry in transaction['tables']:
            entry['swapped'] = True
            write_transaction(transaction_path, transaction)
            if entry['hadOriginal']:
                client.rename(entry['finalPath'], entry['backupPath'])
            try:
                client.rename(entry['stagePath'], entry['finalPath'])
            except Exception:
                if entry['hadOriginal'] and client.exists(entry['backupPath']):
                    client.rename(entry['backupPath'], entry['finalPath'])
                raise
    except Exception as swap_error:
        try:
            rollback_transaction(client, transaction)
            if transaction_path and transaction_path.exists():
                transaction_path.unlink()
        except Exception as rollback_error:
            raise RuntimeError(f'OneLake table swap failed: {swap_error}. Rollback also failed: {rollback_error}') from swap_error
        raise RuntimeError(f'OneLake table swap failed: {swap_error}. The prior tables were restored.') from swap_error

    transaction['phase'] = 'pending_acceptance'
    write_transaction(transaction_path, transaction)
    return {'tableCount': len(table_directories), 'fileCount': len(uploads)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fabric-metadata', default=str(repo_root / '.generated' / 'tokenomics' / 'fabric.json'))
    parser.add_argument('--staging', default=str(repo_root / '.generated' / 'tokenomics' / 'staging' / 'Tables'))
    parser.add_argument('--deployment-id', required=True)
    parser.add_argument('--transaction-path', required=True)
    parser.add_argument('--operation', choices=('swap', 'rollback', 'accept', 'finalize'), default='swap')
    args = parser.parse_args()
    if not args.deployment_id.replace('-', '').replace('_', '').isalnum():
        raise RuntimeError('deployment-id must contain only letters, numbers, hyphens, and underscores.')

    with open(args.fabric_metadata, 'r', encoding='utf-8-sig') as file_handle:
        metadata = json.load(file_handle)
    az_command = 'az.cmd' if os.name == 'nt' else 'az'
    token = subprocess.check_output(
        [az_command, 'account', 'get-access-token', '--resource', 'https://storage.azure.com/', '--query', 'accessToken', '-o', 'tsv'],
        text=True,
        shell=os.name == 'nt',
    ).strip()
    client = OneLakeClient(metadata['workspaceId'], metadata['lakehouseId'], token)
    target = {
        'workspaceId': metadata['workspaceId'],
        'lakehouseId': metadata['lakehouseId'],
        'configFingerprint': metadata.get('configFingerprint'),
    }
    transaction_path = Path(args.transaction_path).resolve()
    if args.operation == 'swap':
        if transaction_path.exists():
            raise RuntimeError(f'Unresolved OneLake transaction found at {transaction_path}. Roll it back or finalize it first.')
        result = synchronize_tables(
            client,
            Path(args.staging).resolve(),
            args.deployment_id,
            transaction_path=transaction_path,
            target=target,
        )
    else:
        if not transaction_path.is_file():
            raise RuntimeError(f'OneLake transaction not found: {transaction_path}')
        transaction = json.loads(transaction_path.read_text(encoding='utf-8-sig'))
        if transaction.get('deploymentId') != args.deployment_id:
            raise RuntimeError('OneLake transaction deployment ID does not match the requested deployment.')
        validate_transaction_target(transaction, target)
        phase = transaction.get('phase')
        if args.operation == 'rollback':
            if phase in ('accepted', 'finalizing'):
                raise RuntimeError('An accepted OneLake transaction cannot be rolled back; resume finalization.')
            rollback_transaction(client, transaction)
            transaction_path.unlink()
        elif args.operation == 'accept':
            if phase != 'pending_acceptance' or not all(entry.get('swapped') for entry in transaction['tables']):
                raise RuntimeError('Only a fully swapped OneLake transaction can be accepted.')
            for entry in transaction['tables']:
                if not client.exists(entry['finalPath']):
                    raise RuntimeError(f"Accepted OneLake table is missing: {entry['finalPath']}")
            transaction['phase'] = 'accepted'
            write_transaction(transaction_path, transaction)
        else:
            if phase not in ('accepted', 'finalizing'):
                raise RuntimeError('Only an accepted OneLake transaction can be finalized.')
            transaction['phase'] = 'finalizing'
            write_transaction(transaction_path, transaction)
            finalize_transaction(client, transaction)
            transaction_path.unlink()
        result = {'tableCount': len(transaction['tables']), 'fileCount': 0}
    print(json.dumps({
        'workspaceId': metadata['workspaceId'],
        'lakehouseId': metadata['lakehouseId'],
        'operation': args.operation,
        **result,
    }))


if __name__ == '__main__':
    main()
