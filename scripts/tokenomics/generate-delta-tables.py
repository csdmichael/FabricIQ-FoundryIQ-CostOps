import argparse
import glob
import json
import os
import shutil
from pathlib import Path

from deltalake import write_deltalake

from delta_schema import to_arrow_table

repo_root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--config', default=str(repo_root / 'config' / 'deployment.json'))
parser.add_argument('--seed', default=str(repo_root / '.generated' / 'tokenomics' / 'seed'))
parser.add_argument('--staging', default=str(repo_root / '.generated' / 'tokenomics' / 'staging' / 'Tables'))
args = parser.parse_args()

with open(args.config, 'r', encoding='utf-8-sig') as f:
    config = json.load(f)
seed_root = os.path.abspath(args.seed)
staging_root = os.path.abspath(args.staging)

print('Generating Delta Lake tables with explicit PyArrow schemas...')

os.makedirs(staging_root, exist_ok=True)

# 1. Consumption sources
consumption_schema_records = None
for src in config['tokenomicsPlatform']['syntheticData']['sourceCodes']:
    p = os.path.join(seed_root, 'consumption', src, 'token_consumption.jsonl')
    with open(p, 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f]
    if consumption_schema_records is None:
        consumption_schema_records = records
    tbl = to_arrow_table(records)
    local_path = os.path.join(staging_root, src, 'token_consumption')
    shutil.rmtree(local_path, ignore_errors=True)
    os.makedirs(local_path, exist_ok=True)
    write_deltalake(local_path, tbl, mode='overwrite')
    print(f'Wrote Delta table: {src}.token_consumption ({len(records)} rows)')

# 2. Optional MSFT source from Log Analytics AppGenAIContent
msft_seed_path = os.path.join(seed_root, 'consumption', 'msft_log_analytics.json')
if os.path.isfile(msft_seed_path):
    with open(msft_seed_path, 'r', encoding='utf-8') as f:
        msft_records = json.load(f)
    msft_tbl = to_arrow_table(msft_records, consumption_schema_records)
    msft_local_path = os.path.join(staging_root, 'msft', 'token_consumption')
    shutil.rmtree(msft_local_path, ignore_errors=True)
    os.makedirs(msft_local_path, exist_ok=True)
    write_deltalake(msft_local_path, msft_tbl, mode='overwrite')
    print(f'Wrote Delta table: msft.token_consumption ({len(msft_records)} rows)')
else:
    print('Skipped optional msft.token_consumption because no Log Analytics seed was supplied.')

# 3. Reference tables
ref_files = glob.glob(os.path.join(seed_root, 'reference', '*.jsonl'))
for rf in ref_files:
    name = os.path.splitext(os.path.basename(rf))[0]
    with open(rf, 'r', encoding='utf-8') as f:
        rows = [json.loads(line) for line in f]
    ref_tbl = to_arrow_table(rows)
    ref_local_path = os.path.join(staging_root, 'ml', name)
    shutil.rmtree(ref_local_path, ignore_errors=True)
    os.makedirs(ref_local_path, exist_ok=True)
    write_deltalake(ref_local_path, ref_tbl, mode='overwrite')
    print(f'Wrote Delta table: ml.{name} ({len(rows)} rows)')

    # The governed pricing source of truth lives in its own `prices` schema.
    # Seed prices.token_price_history from the model price history so the API's
    # pricing endpoints work day 1 (the pricing Azure Function keeps it fresh).
    if name == 'model_price_history':
        prices_path = os.path.join(staging_root, 'prices', 'token_price_history')
        shutil.rmtree(prices_path, ignore_errors=True)
        os.makedirs(prices_path, exist_ok=True)
        write_deltalake(prices_path, to_arrow_table(rows), mode='overwrite')
        print(f'Wrote Delta table: prices.token_price_history ({len(rows)} rows)')

print('All Delta tables written successfully to staging.')
