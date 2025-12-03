import unittest
from shred import shred_records
from test_utils import get_desc
from schema import parse_schema


from paper_schema import PaperSchema


class TestDremelShred(unittest.TestCase):
    def test_basic_example(self):
        schema = parse_schema(["a.b[*].c", "a.d"])
        records = [
            {"a": {"b": [{"c": 1}, {"c": 2}], "d": 1}},
            {"a": {"d": 2}}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result[get_desc(schema, "a.b[*].c")],
                         [(1, 0, 3), (2, 1, 3), (None, 0, 1)])
        self.assertEqual(result[get_desc(schema, "a.d")],
                         [(1, 0, 2), (2, 0, 2)])

    def test_paper_example(self):
        s = PaperSchema()
        schema = s.root
        records = s.records
        result = shred_records(schema, records)

        self.assertEqual(result[s.doc_id],
                         [(10, 0, 1), (20, 0, 1)])
        self.assertEqual(result[s.links_backward],
                         [(None, 0, 1), (10, 0, 2), (30, 1, 2)])
        self.assertEqual(result[s.links_forward],
                         [(20, 0, 2), (40, 1, 2), (60, 1, 2), (80, 0, 2)])
        self.assertEqual(result[s.name_url],
                         [("http://A", 0, 2), ("http://B", 1, 2),
                          (None, 1, 1), ("http://C", 0, 2)])
        self.assertEqual(result[s.name_language_code],
                         [("en-us", 0, 3), ("en", 2, 3), (None, 1, 1),
                          ("en-gb", 1, 3), (None, 0, 1)])

    def test_missing_root(self):
        schema = parse_schema(["a.b"])
        records = [{}]
        result = shred_records(schema, records)

        self.assertEqual(result[get_desc(schema, "a.b")], [(None, 0, 0)])

    def test_missing_nested(self):
        schema = parse_schema(["a.b"])
        records = [{"a": {}}]
        result = shred_records(schema, records)

        self.assertEqual(result[get_desc(schema, "a.b")], [(None, 0, 1)])

    def test_empty_list(self):
        schema = parse_schema(["a.b[*].c"])
        records = [{"a": {"b": []}}]
        result = shred_records(schema, records)
        self.assertEqual(result[get_desc(
            schema, "a.b[*].c")], [(None, 0, 1)])

    def test_list_with_missing_field(self):
        schema = parse_schema(["a.b[*].c"])
        records = [{"a": {"b": [{"c": 1}, {}]}}]
        result = shred_records(schema, records)

        self.assertEqual(result[get_desc(schema, "a.b[*].c")],
                         [(1, 0, 3), (None, 1, 2)])

    def test_multiple_records_mixed(self):
        schema = parse_schema(
            ["doc.links[*].forward", "doc.links[*].backward"])
        records = [
            {"doc": {
                "links": [{"forward": 20, "backward": 10}, {"forward": 40}]}},
            {"doc": {"links": [{"backward": 30}]}}
        ]

        result = shred_records(schema, records)
        self.assertEqual(result[get_desc(schema, "doc.links[*].forward")],
                         [(20, 0, 3), (40, 1, 3), (None, 0, 2)])
        self.assertEqual(result[get_desc(schema, "doc.links[*].backward")],
                         [(10, 0, 3), (None, 1, 2), (30, 0, 3)])

    def test_shred_repeated_leaf_topLevel(self):
        schema = parse_schema(["values[*]"])
        records = [
            {"values": [1, 2]},
            {"values": []},
            {}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result[get_desc(schema, "values[*]")], [
            (1, 0, 1), (2, 1, 1),
            (None, 0, 0),
            (None, 0, 0)
        ])

    def test_shred_repeated_leaf_mixed(self):
        schema = parse_schema(["data.values[*]", "data.meta"])
        records = [
            {"data": {"values": [1, 2], "meta": "m1"}},
            {"data": {"values": [], "meta": "m2"}},
            {"data": {}},
            {}
        ]

        result = shred_records(schema, records)
        self.assertEqual(result[get_desc(schema, "data.values[*]")], [
            (1, 0, 2), (2, 1, 2),
            (None, 0, 1),
            (None, 0, 1),
            (None, 0, 0)
        ])
        self.assertEqual(result[get_desc(schema, "data.meta")], [
            ("m1", 0, 2),
            ("m2", 0, 2),
            (None, 0, 1),
            (None, 0, 0)
        ])

    def test_validation_repeated_field_must_be_list(self):
        schema = parse_schema(["r[*]"])
        records = [{"r": 1}]
        with self.assertRaises(ValueError) as cm:
            shred_records(schema, records)
        self.assertEqual(
            str(cm.exception),
            "Field 'r' is repeated, expected list, found int: 1")

    def test_validation_non_repeated_field_must_not_be_list(self):
        schema = parse_schema(["nr"])
        records = [{"nr": [1]}]
        with self.assertRaises(ValueError) as cm:
            shred_records(schema, records)
        self.assertEqual(
            str(cm.exception),
            "Field 'nr' is not repeated, expected single value, found list: [1]")

    def test_validation_non_leaf_must_be_dict(self):
        schema = parse_schema(["g.f"])
        records = [{"g": 1}]
        with self.assertRaises(ValueError) as cm:
            shred_records(schema, records)
        self.assertEqual(
            str(cm.exception),
            "Field 'g' is a nested group, expected dict, found int: 1")

    def test_validation_nested_repeated_must_be_list(self):
        schema = parse_schema(["r[*].a"])
        records = [{"r": {"a": 1}}]
        with self.assertRaises(ValueError) as cm:
            shred_records(schema, records)
        self.assertEqual(
            str(cm.exception),
            "Field 'r' is repeated, expected list, found dict: {'a': 1}")

    def test_validation_nested_leaf_must_not_be_list(self):
        schema = parse_schema(["r[*].a"])
        records = [{"r": [{"a": [1]}]}]
        with self.assertRaises(ValueError) as cm:
            shred_records(schema, records)
        self.assertEqual(
            str(cm.exception),
            "Field 'a' is not repeated, expected single value, found list: [1]")


if __name__ == "__main__":
    unittest.main()
