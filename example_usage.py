from assembly import assemble_records
from schema import parse_schema
from shred import shred_records

# 1. Define Schema
# The schema is defined as a list of paths.
# [*] denotes a repeated field.
schema_strings = ["doc.title", "doc.links[*].url"]
schema = parse_schema(schema_strings)

# 2. Input Records
records = [
    {
        "doc": {
            "title": "Dremel Paper",
            "links": [{"url": "http://google.com"}, {"url": "http://cs.stanford.edu"}],
        }
    },
    {
        "doc": {
            "title": "Another Doc"
            # links is missing (optional)
        }
    },
]

# 3. Shred Records (Write to Columns)
# Returns a dict mapping ColumnDescriptor -> list of (value,
# repetition_level, definition_level)
shredded_columns = shred_records(schema, records)
for col, values in shredded_columns.items():
    print(f"Column {col.path}: {values}")


# 4. Assemble Records (Read from Columns)
# Reconstructs the records from the columnar data
assembled_records = assemble_records(schema, shredded_columns)
print(f"assembled_records: {assembled_records}")
print(f"original_records: {records}")
