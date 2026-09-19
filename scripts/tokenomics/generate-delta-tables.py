import json, os, glob
import pyarrow as pa
from deltalake import write_deltalake
import subprocess, urllib.request

cmd = ['az.cmd', 'account', 'get-access-token', '--resource', 'https://storage.azure.com/', '--query', 'accessToken', '-o', 'tsv']
token = subprocess.check_output(cmd, text=True, shell=True).strip()
ws_id = '1e14d1a0-d6cd-4810-a23e-094a58dae55e'
lh_id = '2963b5a6-900d-4364-b141-16913bf4548b'

print('Generating Delta Lake tables with explicit PyArrow schemas...')

def get_pyarrow_table(records):
    # Convert records with typed columns, ensuring no pa.null() types
    first = records[0]
    fields = []
    data = {}
    for k in first.keys():
        sample_vals = [r.get(k) for r in records if r.get(k) is not None]
        if not sample_vals:
            t = pa.string()
            vals = [None if r.get(k) is None else str(r.get(k)) for r in records]
        else:
            val = sample_vals[0]
            if isinstance(val, bool):
                t = pa.bool_()
                vals = [r.get(k) for r in records]
            elif isinstance(val, int):
                t = pa.int64()
                vals = [r.get(k) for r in records]
            elif isinstance(val, float):
                t = pa.float64()
                vals = [r.get(k) for r in records]
            else:
                t = pa.string()
                vals = [None if r.get(k) is None else str(r.get(k)) for r in records]
        fields.append(pa.field(k, t, nullable=True))
        data[k] = vals
    schema = pa.schema(fields)
    return pa.Table.from_pydict(data, schema=schema)

staging_root = os.path.abspath('.generated/tokenomics/staging/Tables')
os.makedirs(staging_root, exist_ok=True)

# 1. Consumption sources
for src in ['aws', 'gcp', 'oai', 'cld']:
    p = f'.generated/tokenomics/seed/consumption/{src}/token_consumption.jsonl'
    with open(p, 'r', encoding='utf-8') as f:
        records = [json.loads(line) for line in f]
    tbl = get_pyarrow_table(records)
    local_path = os.path.join(staging_root, src, 'token_consumption')
    os.makedirs(local_path, exist_ok=True)
    write_deltalake(local_path, tbl, mode='overwrite')
    print(f'Wrote Delta table: {src}.token_consumption ({len(records)} rows)')

# 2. MSFT source from Log Analytics AppGenAIContent
with open('.generated/tokenomics/seed/consumption/msft_log_analytics.json', 'r', encoding='utf-8') as f:
    msft_records = json.load(f)
msft_tbl = get_pyarrow_table(msft_records)
msft_local_path = os.path.join(staging_root, 'msft', 'token_consumption')
os.makedirs(msft_local_path, exist_ok=True)
write_deltalake(msft_local_path, msft_tbl, mode='overwrite')
print(f'Wrote Delta table: msft.token_consumption ({len(msft_records)} rows)')

# 3. Reference tables
ref_files = glob.glob('.generated/tokenomics/seed/reference/*.jsonl')
for rf in ref_files:
    name = os.path.splitext(os.path.basename(rf))[0]
    with open(rf, 'r', encoding='utf-8') as f:
        rows = [json.loads(line) for line in f]
    ref_tbl = get_pyarrow_table(rows)
    ref_local_path = os.path.join(staging_root, 'ml', name)
    os.makedirs(ref_local_path, exist_ok=True)
    write_deltalake(ref_local_path, ref_tbl, mode='overwrite')
    print(f'Wrote Delta table: ml.{name} ({len(rows)} rows)')

print('All Delta tables written successfully to staging.')
