import base64
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

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
config_path = os.path.join(repo_root, 'config', 'deployment.json')
with open(config_path, 'r', encoding='utf-8') as f:
    config = json.load(f)

fabric_config = config['tokenomicsPlatform']['fabric']
use_cases = fabric_config['mlUseCases']

folders_file = os.path.join(repo_root, '.generated', 'tokenomics', 'fabric-folders.json')
with open(folders_file, 'r', encoding='utf-8') as f:
    folder_registry = json.load(f)

def api_call(method, url, data=None):
    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    if data:
        req.data = json.dumps(data).encode('utf-8')
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 204:
                    return None
                if resp.status == 201:
                    location = resp.headers.get('Location')
                    body_text = resp.read().decode('utf-8')
                    if body_text:
                        return json.loads(body_text)
                    return {'location': location}
                body_text = resp.read().decode('utf-8')
                return json.loads(body_text) if body_text else {}
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry = int(e.headers.get('Retry-After', 5))
                time.sleep(retry)
                continue
            err_msg = e.read().decode('utf-8')
            raise RuntimeError(f"HTTP {e.code}: {err_msg}")

print("Listing existing items in Fabric workspace...")
items_resp = api_call('GET', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items?type=Notebook')
existing_items = {item['displayName']: item for item in items_resp.get('value', [])}
print(f"Found {len(existing_items)} existing Notebooks.")

published = {}

for uc in use_cases:
    fn = uc['folderName']
    folder_id = folder_registry.get(fn)
    nb_dir = os.path.join(repo_root, 'fabric', 'notebooks', fn)

    for nb_name in [uc['trainingNotebookName'], uc['inferenceNotebookName']]:
        nb_path = os.path.join(nb_dir, f"{nb_name}.ipynb")
        with open(nb_path, 'r', encoding='utf-8') as f:
            nb_json = json.load(f)

        encoded_content = base64.b64encode(json.dumps(nb_json, indent=2).encode('utf-8')).decode('utf-8')
        definition = {
            "format": "ipynb",
            "parts": [
                {
                    "path": "notebook-content.ipynb",
                    "payload": encoded_content,
                    "payloadType": "InlineBase64"
                }
            ]
        }

        # Refresh existing_items check
        items_resp = api_call('GET', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items?type=Notebook')
        existing_items = {item['displayName']: item for item in items_resp.get('value', [])}
        existing = existing_items.get(nb_name)

        if not existing:
            print(f"Creating Notebook '{nb_name}' in folder '{fn}'...")
            payload = {
                "displayName": nb_name,
                "type": "Notebook",
                "description": f"Fabric ML notebook for {uc['displayName']}",
                "definition": definition
            }
            if folder_id:
                payload["folderId"] = folder_id

            created = api_call('POST', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items', payload)
            if created and 'id' in created:
                nb_id = created['id']
            else:
                time.sleep(2)
                refreshed = api_call('GET', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items?type=Notebook')
                match = next((it for it in refreshed.get('value', []) if it['displayName'] == nb_name), None)
                nb_id = match['id'] if match else 'unknown'
            published[nb_name] = nb_id
            print(f"  Created: {nb_id}")
        else:
            nb_id = existing['id']
            print(f"Updating Notebook definition for '{nb_name}' ({nb_id})...")
            api_call('POST', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items/{nb_id}/updateDefinition', {
                "definition": definition
            })
            if folder_id and existing.get('folderId') != folder_id:
                api_call('POST', f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items/{nb_id}/move', {'targetFolderId': folder_id})
            published[nb_name] = nb_id
            print(f"  Updated: {nb_id}")

        time.sleep(1)

out_file = os.path.join(repo_root, '.generated', 'tokenomics', 'fabric-notebooks.json')
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(published, f, indent=2)

print(f"Provisioned all {len(published)} Fabric notebooks successfully.")
