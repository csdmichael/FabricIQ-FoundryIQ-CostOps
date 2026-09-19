import urllib.request
import json
import subprocess
import time

cmd = ['az.cmd', 'account', 'get-access-token', '--resource', 'https://api.fabric.microsoft.com/', '--query', 'accessToken', '-o', 'tsv']
token = subprocess.check_output(cmd, text=True, shell=True).strip()
ws_id = '1e14d1a0-d6cd-4810-a23e-094a58dae55e'
url = f'https://api.fabric.microsoft.com/v1/workspaces/{ws_id}/items'

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# 1. Check semantic model
req = urllib.request.Request(f'{url}?type=SemanticModel', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req) as resp:
    models = json.loads(resp.read().decode('utf-8'))['value']

sm = next((m for m in models if m['displayName'] == 'Tokenomics FinOps Model'), None)
print(f"Semantic model found: {sm['displayName']} -> ID: {sm['id']}")
sm_id = sm['id']

# 2. Re-generate Power BI report definitions with sm_id
subprocess.check_call(['node', 'scripts/tokenomics/generate-powerbi.mjs', '--config', 'config/deployment.json', '--semantic-model-id', sm_id, '--output', '.generated/tokenomics/powerbi'])
print(f"Regenerated report definitions with semantic model id: {sm_id}")

# 3. Publish Consumption Report
with open('.generated/tokenomics/powerbi/consumption-report.definition.json', 'r', encoding='utf-8') as f:
    cr_def = json.load(f)

req_cr = urllib.request.Request(f'{url}?type=Report', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req_cr) as resp:
    existing_reports = json.loads(resp.read().decode('utf-8'))['value']

existing_cr = next((r for r in existing_reports if r['displayName'] == 'Tokenomics Consumption and Cost Analytics'), None)
if not existing_cr:
    print('Creating Report: Tokenomics Consumption and Cost Analytics...')
    body = {
        'displayName': 'Tokenomics Consumption and Cost Analytics',
        'type': 'Report',
        'description': 'Token consumption and dollars by date, team, user, project, cost center, provider, model family, model, and version.',
        'definition': cr_def
    }
    req_create = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), method='POST', headers=headers)
    with urllib.request.urlopen(req_create) as resp:
        res = json.loads(resp.read().decode('utf-8')) if resp.status == 200 else {}
        print('  Creation status:', resp.status, res.get('id'))
else:
    print('Updating Report: Tokenomics Consumption and Cost Analytics...')
    req_up = urllib.request.Request(f"{url}/{existing_cr['id']}/updateDefinition", data=json.dumps({'definition': cr_def}).encode('utf-8'), method='POST', headers=headers)
    with urllib.request.urlopen(req_up) as resp:
        print('  Update status:', resp.status)

# 4. Publish ML Report
with open('.generated/tokenomics/powerbi/ml-report.definition.json', 'r', encoding='utf-8') as f:
    ml_def = json.load(f)

existing_ml = next((r for r in existing_reports if r['displayName'] == 'Tokenomics ML Insights'), None)
if not existing_ml:
    print('Creating Report: Tokenomics ML Insights...')
    body = {
        'displayName': 'Tokenomics ML Insights',
        'type': 'Report',
        'description': 'Portfolio and detailed Power BI pages for all 12 Tokenomics ML algorithm outputs.',
        'definition': ml_def
    }
    req_create = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'), method='POST', headers=headers)
    with urllib.request.urlopen(req_create) as resp:
        res = json.loads(resp.read().decode('utf-8')) if resp.status == 200 else {}
        print('  Creation status:', resp.status, res.get('id'))
else:
    print('Updating Report: Tokenomics ML Insights...')
    req_up = urllib.request.Request(f"{url}/{existing_ml['id']}/updateDefinition", data=json.dumps({'definition': ml_def}).encode('utf-8'), method='POST', headers=headers)
    with urllib.request.urlopen(req_up) as resp:
        print('  Update status:', resp.status)

# 5. Create Dashboards via Power BI REST API
cmd_pbi = ['az.cmd', 'account', 'get-access-token', '--resource', 'https://analysis.windows.net/powerbi/api', '--query', 'accessToken', '-o', 'tsv']
token_pbi = subprocess.check_output(cmd_pbi, text=True, shell=True).strip()
pbi_headers = {
    'Authorization': f'Bearer {token_pbi}',
    'Content-Type': 'application/json'
}

pbi_dash_url = f'https://api.powerbi.com/v1.0/myorg/groups/{ws_id}/dashboards'
req_d = urllib.request.Request(pbi_dash_url, headers=pbi_headers)
with urllib.request.urlopen(req_d) as resp:
    existing_dashboards = json.loads(resp.read().decode('utf-8'))['value']

for dash_name in ['Tokenomics FinOps Executive Dashboard', 'Tokenomics ML Operations Dashboard']:
    ed = next((d for d in existing_dashboards if d['displayName'] == dash_name), None)
    if not ed:
        print(f"Creating Dashboard: {dash_name}...")
        req_cd = urllib.request.Request(pbi_dash_url, data=json.dumps({'name': dash_name}).encode('utf-8'), method='POST', headers=pbi_headers)
        with urllib.request.urlopen(req_cd) as resp:
            cd = json.loads(resp.read().decode('utf-8'))
            print(f"  Created: {cd['id']}")
    else:
        print(f"Dashboard exists: {dash_name} -> {ed['id']}")

print("All Power BI semantic models, reports, and dashboards published successfully!")
