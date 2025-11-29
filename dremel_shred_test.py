import unittest
from dremel_shred import shred_records, parse_schema, ColumnDescriptor

def mk_desc(path, r, d, is_repeated=False, children=None):
    desc = ColumnDescriptor(path, parent=None, max_repetition_level=r, max_definition_level=d)
    desc.is_repeated = is_repeated
    if children:
        for child in children:
            desc.children[child.path] = child
            child.parent = desc
    return desc

class TestDremelShred(unittest.TestCase):
    def test_basic_example(self):
        schema = ["a.b[*].c", "a.d"]
        records = [
            {"a": {"b": [{"c": 1}, {"c": 2}], "d": 1}},
            {"a": {"d": 2}}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result["a.b[*].c"], [(1, 0, 3), (2, 1, 3), (None, 0, 1)])
        self.assertEqual(result["a.d"], [(1, 0, 2), (2, 0, 2)])

    def test_paper_example(self):
        schema = ["DocId", "Links.Backward[*]", "Links.Forward[*]", "Name[*].Language[*].Code", "Name[*].Language[*].Country", "Name[*].Url"]
        records = [
            {
                "DocId": 10, 
                "Links": {
                    "Forward": [20, 40, 60]
                }, 
                "Name": [
                    {
                        "Language": [
                            {"Code": "en-us", "Country": "us"},
                            {"Code": "en"}
                        ],
                        "Url": "http://A"
                    },
                    { 
                        "Url": "http://B" 
                    },
                    { 
                        "Language": [{"Code": "en-gb", "Country": "gb"}] 
                    }
                ]
            },
            {
                "DocId": 20, 
                "Links": {
                    "Backward": [10, 30],
                    "Forward": [80]
                }, 
                "Name": [
                    {"Url": "http://C"}
                ]
            }
        ]
        result = shred_records(schema, records)
        self.assertEqual(result["DocId"], [(10, 0, 1), (20, 0, 1)])
        self.assertEqual(result["Name[*].Url"], [("http://A", 0, 2), ("http://B", 1, 2), (None, 1, 1), ("http://C", 0, 2)])
        self.assertEqual(result["Name[*].Language[*].Code"], [("en-us", 0, 3), ("en", 2, 3), (None, 1, 1), ("en-gb", 1, 3), (None, 0, 1)])

    def test_missing_root(self):
        schema = ["a.b"]
        records = [{}]
        result = shred_records(schema, records)
        # a missing (d=0)
        self.assertEqual(result["a.b"], [(None, 0, 0)])

    def test_missing_nested(self):
        schema = ["a.b"]
        records = [{"a": {}}]
        # a present (d=1), b missing (d=1)
        result = shred_records(schema, records)
        self.assertEqual(result["a.b"], [(None, 0, 1)])

    def test_empty_list(self):
        # If b is empty list, we treat it as missing b (d=1)
        schema = ["a.b[*].c"]
        records = [{"a": {"b": []}}]
        result = shred_records(schema, records)
        self.assertEqual(result["a.b[*].c"], [(None, 0, 1)])

    def test_list_with_missing_field(self):
        schema = ["a.b[*].c"]
        records = [{"a": {"b": [{"c": 1}, {}]}}]
        # Item 1: c=1, d=3
        # Item 2: c missing. a(1), b(2) present. d=2.
        result = shred_records(schema, records)
        self.assertEqual(result["a.b[*].c"], [(1, 0, 3), (None, 1, 2)])

    def test_multiple_records_mixed(self):
        schema = ["doc.links[*].forward", "doc.links[*].backward"]
        records = [
            {"doc": {"links": [{"forward": 20, "backward": 10}, {"forward": 40}]}},
            {"doc": {"links": [{"backward": 30}]}}
        ]
        # doc(1).links(2).forward(3)/backward(3)
        
        # Record 1:
        # Link 1: fwd=20 (d=3, r=0), back=10 (d=3, r=0)
        # Link 2: fwd=40 (d=3, r=1), back=missing (d=2, r=1)
        
        # Record 2:
        # Link 1: fwd=missing (d=2, r=0), back=30 (d=3, r=0)
        
        result = shred_records(schema, records)
        self.assertEqual(result["doc.links[*].forward"], [(20, 0, 3), (40, 1, 3), (None, 0, 2)])
        self.assertEqual(result["doc.links[*].backward"], [(10, 0, 3), (None, 1, 2), (30, 0, 3)])

    def test_shred_repeated_leaf_mixed(self):
        schema = ["data.values[*]", "data.meta"]
        records = [
            {"data": {"values": [1, 2], "meta": "m1"}},
            {"data": {"values": [], "meta": "m2"}},
            {"data": {}},
            {}
        ]
        # data.values[*]: r=1, d=2
        # data.meta: r=0, d=2
        
        # Record 1: values=[1, 2], meta="m1"
        # values: (1, 0, 2), (2, 1, 2)
        # meta: ("m1", 0, 2)
        
        # Record 2: values=[], meta="m2"
        # values: (None, 0, 1)  <- data present(1), values missing(1)
        # meta: ("m2", 0, 2)
        
        # Record 3: data present, empty
        # values: (None, 0, 1)
        # meta: (None, 0, 1)
        
        # Record 4: missing root
        # values: (None, 0, 0)
        # meta: (None, 0, 0)
        
        result = shred_records(schema, records)
        self.assertEqual(result["data.values[*]"], [
            (1, 0, 2), (2, 1, 2), 
            (None, 0, 1), 
            (None, 0, 1), 
            (None, 0, 0)
        ])
        self.assertEqual(result["data.meta"], [
            ("m1", 0, 2), 
            ("m2", 0, 2), 
            (None, 0, 1), 
            (None, 0, 0)
        ])

class TestParseSchema(unittest.TestCase):
    def test_simple_schema(self):
        schema = ["a", "b"]
        root = parse_schema(schema)
        
        expected = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1),
            mk_desc("b", 0, 1)
        ])
        self.assertEqual(root, expected)

    def test_nested_schema(self):
        schema = ["a.b"]
        root = parse_schema(schema)
        
        expected = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 0, 2)
            ])
        ])
        self.assertEqual(root, expected)

    def test_repeated_schema(self):
        schema = ["a[*].b"]
        root = parse_schema(schema)
        
        expected = mk_desc("$", 0, 0, children=[
            mk_desc("a", 1, 1, is_repeated=True, children=[
                mk_desc("b", 1, 2)
            ])
        ])
        self.assertEqual(root, expected)

    def test_repeated_leaf_schema(self):
        schema = ["a.b[*]"]
        root = parse_schema(schema)
        
        expected = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 1, 2, is_repeated=True)
            ])
        ])
        self.assertEqual(root, expected)

    def test_paper_schema(self):
        schema = ["DocId", "Links.Backward[*]", "Links.Forward[*]", "Name[*].Language[*].Code", "Name[*].Language[*].Country", "Name[*].Url"]
        root = parse_schema(schema)
        
        expected = mk_desc("$", 0, 0, children=[
            mk_desc("DocId", 0, 1),
            mk_desc("Links", 0, 1, children=[
                mk_desc("Backward", 1, 2, is_repeated=True),
                mk_desc("Forward", 1, 2, is_repeated=True)
            ]),
            mk_desc("Name", 1, 1, is_repeated=True, children=[
                mk_desc("Language", 2, 2, is_repeated=True, children=[
                    mk_desc("Code", 2, 3),
                    mk_desc("Country", 2, 3)
                ]),
                mk_desc("Url", 1, 2)
            ])
        ])
        self.assertEqual(root, expected)

if __name__ == "__main__":
    unittest.main()
