import unittest
from dremel import shred_records

class TestDremel(unittest.TestCase):
    def test_basic_example(self):
        schema = ["a.b[*].c", "a.d"]
        records = [
            {"a": {"b": [{"c": 1}, {"c": 2}], "d": 1}},
            {"a": {"d": 2}}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result["a.b[*].c"], [(1, 0, 3), (2, 1, 3), (None, 0, 1)])
        self.assertEqual(result["a.d"], [(1, 0, 2), (2, 0, 2)])

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

if __name__ == "__main__":
    unittest.main()
