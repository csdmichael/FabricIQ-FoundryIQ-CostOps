import json
import os
import subprocess
import urllib.request
import time

cmd = ['az.cmd', 'account', 'get-access-token', '--resource', 'https://api.fabric.microsoft.com/', '--query', 'accessToken', '-o', 'tsv']
token = subprocess.check_output(cmd, text=True, shell=True).strip()
ws_id = '1e14d1a0-d6cd-4810-a23e-094a58dae55e'
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

config_path = os.path.abspath('config/deployment.json')
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

fabric_config = config['tokenomicsPlatform']['fabric']
use_cases = fabric_config['mlUseCases']
ml_folder_name = fabric_config['mlFolderName']

def api_call(method, url, data=None):
    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    if data:
        req.data = json.dumps(data).encode('utf-8')
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 204:
                    return None
                return json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry = int(e.headers.get('Retry-After', 5))
                print(f'Rate limited. Waiting {retry}s...')
                time.sleep(retry)
                continue
            err_msg = e.read().decode('utf-8')
            raise RuntimeError(f"HTTP {e.code}: {err_msg}")

print("Listing existing folders in Fabric workspace...")
folders_resp = api_call('GET', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/folders')
existing_folders = {f['displayName']: f for f in folders_resp.get('value', [])}
print(f"Found {len(existing_folders)} existing folders: {list(existing_folders.keys())}")

# 1. Ensure root ML folder exists
ml_folder = existing_folders.get(ml_folder_name)
if not ml_folder:
    print(f"Creating root folder '{ml_folder_name}'...")
    ml_folder = api_call('POST', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/folders', {
        'displayName': ml_folder_name
    })
    print(f"Created root folder: {ml_folder['id']}")
else:
    print(f"Root folder '{ml_folder_name}' already exists: {ml_folder['id']}")

ml_root_id = ml_folder['id']

# 2. Refresh folders list to check child folders
folders_resp = api_call('GET', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/folders')
folder_map = {f['displayName']: f['id'] for f in folders_resp.get('value', [])}

folder_registry = {ml_folder_name: ml_root_id}

for uc in use_cases:
    fn = uc['folderName']
    if fn not in folder_map:
        print(f"Creating child folder '{fn}' under ML...")
        created = api_call('POST', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/folders', {
            'displayName': fn,
            'parentFolderId': ml_root_id
        })
        folder_registry[fn] = created['id']
        print(f"Created '{fn}': {created['id']}")
    else:
        folder_registry[fn] = folder_map[fn]
        print(f"Child folder '{fn}' exists: {folder_map[fn]}")

out_path = os.path.abspath('.generated/tokenomics/fabric-folders.json')
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(folder_registry, f, indent=2)

print(f"Folder reconciliation complete. All {len(folder_registry)} folders verified.")
