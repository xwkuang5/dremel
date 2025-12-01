# Dremel Demo

## 1. Overview
This project provides a Python reference implementation of the Dremel columnar storage algorithm, as described in the original Google paper ("Dremel: Interactive Analysis of Web-Scale Datasets").

It demonstrates the core concepts of:
- **Record Shredding**: Decomposing nested and repeated records (JSON-like) into columnar data with Repetition and Definition levels.
- **Record Assembly**: Reconstructing original records from columnar data using Finite State Machines (FSMs).

The implementation includes:
- `shred.py`: Logic for shredding records into columns.
- `assembly.py`: Logic for assembling records from columns.
- `fsm.py`: Construction of the FSM used for efficient record assembly.
- `schema.py`: Schema definition and parsing helpers.

## 2. Example Usage

```python
from schema import parse_schema
from shred import shred_records
from assembly import assemble_records

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
            "links": [{"url": "http://google.com"}, {"url": "http://cs.stanford.edu"}]
        }
    },
    {
        "doc": {
            "title": "Another Doc"
            # links is missing (optional)
        }
    }
]

# 3. Shred Records (Write to Columns)
# Returns a dict mapping ColumnDescriptor -> list of (value, repetition_level, definition_level)
shredded_columns = shred_records(schema, records)

# 4. Assemble Records (Read from Columns)
# Reconstructs the records from the columnar data
assembled_records = assemble_records(schema, shredded_columns)
print(assembled_records)
```

## 3. Assumptions / Limitations
- **In-Memory**: This is a demonstration implementation and operates entirely in memory. It is not intended for production-scale data processing.
- **Schema Support**: Supports nested and repeated fields (groups) and primitive types (integers, strings). All fields are optional.
- **Validation**: Assumes input records strictly conform to the provided schema.
- **Performance**: Optimized for clarity and correctness over raw speed.

## 4. TODO
- [ ] Support lossless encoding and decoding of empty sub-messages.
- [ ] Support lazy shredding of sparse records via writer versions (optimization for sparse data).
