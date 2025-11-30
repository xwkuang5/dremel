import unittest
from shred import shred_records
from test_utils import mk_desc


class TestDremelShred(unittest.TestCase):
    def _get_desc(self, schema, path):
        curr = schema
        parts = path.split('.')
        for part in parts:
            if part.endswith("[*]"):
                part = part[:-3]
            curr = curr.children[part]
        return curr

    def test_basic_example(self):
        # schema = ["a.b[*].c", "a.d"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 1, 2, is_repeated=True, children=[
                    mk_desc("c", 1, 3)
                ]),
                mk_desc("d", 0, 2)
            ])
        ])
        records = [
            {"a": {"b": [{"c": 1}, {"c": 2}], "d": 1}},
            {"a": {"d": 2}}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result[self._get_desc(schema, "a.b[*].c")],
                         [(1, 0, 3), (2, 1, 3), (None, 0, 1)])
        self.assertEqual(result[self._get_desc(schema, "a.d")],
                         [(1, 0, 2), (2, 0, 2)])

    def test_paper_example(self):
        # schema = ["DocId", "Links.Backward[*]", "Links.Forward[*]",
        #           "Name[*].Language[*].Code", "Name[*].Language[*].Country", "Name[*].Url"]
        schema = mk_desc("$", 0, 0, children=[
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

        self.assertEqual(result[self._get_desc(schema, "DocId")],
                         [(10, 0, 1), (20, 0, 1)])
        self.assertEqual(result[self._get_desc(schema, "Name[*].Url")],
                         [("http://A", 0, 2), ("http://B", 1, 2),
                          (None, 1, 1), ("http://C", 0, 2)])
        self.assertEqual(result[self._get_desc(schema, "Name[*].Language[*].Code")],
                         [("en-us", 0, 3), ("en", 2, 3), (None, 1, 1),
                          ("en-gb", 1, 3), (None, 0, 1)])

    def test_missing_root(self):
        # schema = ["a.b"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 0, 2)
            ])
        ])
        records = [{}]
        result = shred_records(schema, records)

        self.assertEqual(result[self._get_desc(schema, "a.b")], [(None, 0, 0)])

    def test_missing_nested(self):
        # schema = ["a.b"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 0, 2)
            ])
        ])
        records = [{"a": {}}]
        result = shred_records(schema, records)

        self.assertEqual(result[self._get_desc(schema, "a.b")], [(None, 0, 1)])

    def test_empty_list(self):
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 1, 2, is_repeated=True, children=[
                    mk_desc("c", 1, 3)
                ])
            ])
        ])
        records = [{"a": {"b": []}}]
        result = shred_records(schema, records)
        self.assertEqual(result[self._get_desc(
            schema, "a.b[*].c")], [(None, 0, 1)])

    def test_list_with_missing_field(self):
        # schema = ["a.b[*].c"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("a", 0, 1, children=[
                mk_desc("b", 1, 2, is_repeated=True, children=[
                    mk_desc("c", 1, 3)
                ])
            ])
        ])
        records = [{"a": {"b": [{"c": 1}, {}]}}]
        result = shred_records(schema, records)

        self.assertEqual(result[self._get_desc(schema, "a.b[*].c")],
                         [(1, 0, 3), (None, 1, 2)])

    def test_multiple_records_mixed(self):
        # schema = ["doc.links[*].forward", "doc.links[*].backward"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("doc", 0, 1, children=[
                mk_desc("links", 1, 2, is_repeated=True, children=[
                    mk_desc("forward", 1, 3),
                    mk_desc("backward", 1, 3)
                ])
            ])
        ])
        records = [
            {"doc": {
                "links": [{"forward": 20, "backward": 10}, {"forward": 40}]}},
            {"doc": {"links": [{"backward": 30}]}}
        ]

        result = shred_records(schema, records)
        self.assertEqual(result[self._get_desc(schema, "doc.links[*].forward")],
                         [(20, 0, 3), (40, 1, 3), (None, 0, 2)])
        self.assertEqual(result[self._get_desc(schema, "doc.links[*].backward")],
                         [(10, 0, 3), (None, 1, 2), (30, 0, 3)])

    def test_shred_repeated_leaf_topLevel(self):
        # schema = ["values[*]"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("values", 1, 1, is_repeated=True)
        ])
        records = [
            {"values": [1, 2]},
            {"values": []},
            {}
        ]
        result = shred_records(schema, records)
        self.assertEqual(result[self._get_desc(schema, "values[*]")], [
            (1, 0, 1), (2, 1, 1),
            (None, 0, 0),
            (None, 0, 0)
        ])

    def test_shred_repeated_leaf_mixed(self):
        # schema = ["data.values[*]", "data.meta"]
        schema = mk_desc("$", 0, 0, children=[
            mk_desc("data", 0, 1, children=[
                mk_desc("values", 1, 2, is_repeated=True),
                mk_desc("meta", 0, 2)
            ])
        ])
        records = [
            {"data": {"values": [1, 2], "meta": "m1"}},
            {"data": {"values": [], "meta": "m2"}},
            {"data": {}},
            {}
        ]

        result = shred_records(schema, records)
        self.assertEqual(result[self._get_desc(schema, "data.values[*]")], [
            (1, 0, 2), (2, 1, 2),
            (None, 0, 1),
            (None, 0, 1),
            (None, 0, 0)
        ])
        self.assertEqual(result[self._get_desc(schema, "data.meta")], [
            ("m1", 0, 2),
            ("m2", 0, 2),
            (None, 0, 1),
            (None, 0, 0)
        ])


if __name__ == "__main__":
    unittest.main()
