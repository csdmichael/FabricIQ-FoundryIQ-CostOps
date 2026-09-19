import os
import subprocess
import urllib.request
import concurrent.futures

cmd = ['az.cmd', 'account', 'get-access-token', '--resource', 'https://storage.azure.com/', '--query', 'accessToken', '-o', 'tsv']
token = subprocess.check_output(cmd, text=True, shell=True).strip()
ws_id = '1e14d1a0-d6cd-4810-a23e-094a58dae55e'
lh_id = '2963b5a6-900d-4364-b141-16913bf4548b'
staging_root = os.path.abspath('.generated/tokenomics/staging/Tables')

files_to_upload = []
for root, _, files in os.walk(staging_root):
    for f in files:
        full_path = os.path.join(root, f)
        rel_path = os.path.relpath(full_path, staging_root).replace('\\', '/')
        uri = f'https://onelake.blob.fabric.microsoft.com/{ws_id}/{lh_id}/Tables/{rel_path}'
        files_to_upload.append((full_path, rel_path, uri))

print(f'Total files to upload to OneLake: {len(files_to_upload)}')

def upload_file(item):
    full_path, rel_path, uri = item
    with open(full_path, 'rb') as fp:
        data = fp.read()
    req = urllib.request.Request(uri, data=data, method='PUT')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('x-ms-version', '2023-11-03')
    req.add_header('x-ms-blob-type', 'BlockBlob')
    req.add_header('Content-Type', 'application/octet-stream')
    try:
        with urllib.request.urlopen(req) as resp:
            return rel_path, resp.status, None
    except urllib.error.HTTPError as e:
        return rel_path, e.code, e.read().decode('utf-8')
    except Exception as ex:
        return rel_path, 0, str(ex)

succeeded = 0
failed = 0
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(upload_file, item) for item in files_to_upload]
    for future in concurrent.futures.as_completed(futures):
        rel, status, err = future.result()
        if status in (200, 201):
            succeeded += 1
        else:
            failed += 1
            print(f'FAILED {rel}: HTTP {status} {err}')

print(f'Upload complete: {succeeded} succeeded, {failed} failed.')
