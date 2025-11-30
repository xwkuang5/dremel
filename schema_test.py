import unittest
from schema import parse_schema, ColumnDescriptor


from test_utils import mk_desc


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
        schema = [
            "DocId",
            "Links.Backward[*]",
            "Links.Forward[*]",
            "Name[*].Language[*].Code",
            "Name[*].Language[*].Country",
            "Name[*].Url"]
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
