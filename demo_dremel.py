import json
from dremel import shred_records

def main():
    schema = ["a.b[*].c", "a.d"]
    records = [
        {"a": {"b": [{"c": 1}, {"c": 2}], "d": 1}},
        {"a": {"d": 2}}
    ]
    
    print("Schema:", schema)
    print("Records:", json.dumps(records, indent=2))
    
    result = shred_records(schema, records)
    
    print("\nShredded Output:")
    for path, columns in result.items():
        print(f"{path}: {columns}")

if __name__ == "__main__":
    main()
