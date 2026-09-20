import pyarrow as pa


def to_arrow_table(records, schema_records=None):
    reference_records = schema_records if schema_records is not None else records
    if not reference_records:
        raise RuntimeError('Cannot infer a Delta schema without source records.')

    fields = []
    data = {}
    for name in reference_records[0].keys():
        sample_values = [record.get(name) for record in reference_records if record.get(name) is not None]
        sample = sample_values[0] if sample_values else None
        if isinstance(sample, bool):
            data_type = pa.bool_()
            values = [record.get(name) for record in records]
        elif isinstance(sample, int):
            data_type = pa.int64()
            values = [record.get(name) for record in records]
        elif isinstance(sample, float):
            data_type = pa.float64()
            values = [record.get(name) for record in records]
        else:
            data_type = pa.string()
            values = [None if record.get(name) is None else str(record.get(name)) for record in records]
        fields.append(pa.field(name, data_type, nullable=True))
        data[name] = values
    return pa.Table.from_pydict(data, schema=pa.schema(fields))