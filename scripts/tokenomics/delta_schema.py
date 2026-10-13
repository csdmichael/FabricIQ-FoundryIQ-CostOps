import pyarrow as pa

# Credit quantities and USD rates are always doubles. Token rows store 0 for them, so inferring the type from
# the first value alone would lock the column to int64 and truncate fractional Copilot Studio credits.
DOUBLE_COLUMNS = frozenset({'ai_credits', 'credit_unit_price_usd'})


def _infer_type(name, samples):
    if name in DOUBLE_COLUMNS:
        return pa.float64()
    if not samples:
        return pa.string()
    if all(isinstance(value, bool) for value in samples):
        return pa.bool_()
    if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in samples):
        return pa.float64() if any(isinstance(value, float) for value in samples) else pa.int64()
    return pa.string()


def to_arrow_table(records, schema_records=None):
    reference_records = schema_records if schema_records is not None else records
    if not reference_records:
        raise RuntimeError('Cannot infer a Delta schema without source records.')

    fields = []
    data = {}
    for name in reference_records[0].keys():
        samples = [record.get(name) for record in reference_records if record.get(name) is not None]
        data_type = _infer_type(name, samples)
        if data_type == pa.string():
            values = [None if record.get(name) is None else str(record.get(name)) for record in records]
        else:
            values = [record.get(name) for record in records]
        fields.append(pa.field(name, data_type, nullable=True))
        data[name] = values
    return pa.Table.from_pydict(data, schema=pa.schema(fields))
