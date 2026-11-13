import unittest

from paper_schema import PaperSchema
from schema import common_ancestor, parse_schema
from test_utils import get_desc, mk_desc


class TestParseSchema(unittest.TestCase):
    def test_simple_schema(self):
        schema = ["a", "b"]
        root = parse_schema(schema)

        expected = mk_desc("$", 0, 0, children=[mk_desc("a", 0, 1), mk_desc("b", 0, 1)])
        self.assertEqual(root, expected)

    def test_nested_schema(self):
        schema = ["a.b"]
        root = parse_schema(schema)

        expected = mk_desc(
            "$", 0, 0, children=[mk_desc("a", 0, 1, children=[mk_desc("b", 0, 2)])]
        )
        self.assertEqual(root, expected)

    def test_repeated_schema(self):
        schema = ["a[*].b"]
        root = parse_schema(schema)

        expected = mk_desc(
            "$",
            0,
            0,
            children=[
                mk_desc("a", 1, 1, is_repeated=True, children=[mk_desc("b", 1, 2)])
            ],
        )
        self.assertEqual(root, expected)

    def test_repeated_leaf_schema(self):
        schema = ["a.b[*]"]
        root = parse_schema(schema)

        expected = mk_desc(
            "$",
            0,
            0,
            children=[
                mk_desc("a", 0, 1, children=[mk_desc("b", 1, 2, is_repeated=True)])
            ],
        )
        self.assertEqual(root, expected)

    def test_paper_schema(self):
        schema = [
            "DocId",
            "Links.Backward[*]",
            "Links.Forward[*]",
            "Name[*].Language[*].Code",
            "Name[*].Language[*].Country",
            "Name[*].Url",
        ]
        root = parse_schema(schema)

        expected = mk_desc(
            "$",
            0,
            0,
            children=[
                mk_desc("DocId", 0, 1),
                mk_desc(
                    "Links",
                    0,
                    1,
                    children=[
                        mk_desc("Backward", 1, 2, is_repeated=True),
                        mk_desc("Forward", 1, 2, is_repeated=True),
                    ],
                ),
                mk_desc(
                    "Name",
                    1,
                    1,
                    is_repeated=True,
                    children=[
                        mk_desc(
                            "Language",
                            2,
                            2,
                            is_repeated=True,
                            children=[mk_desc("Code", 2, 3), mk_desc("Country", 2, 3)],
                        ),
                        mk_desc("Url", 1, 2),
                    ],
                ),
            ],
        )
        self.assertEqual(root, expected)
        self.assertEqual(root, PaperSchema().root)

    def test_same_leaf_name_different_parents_do_not_collide(self):
        root = parse_schema(["billing.name", "shipping.name"])
        billing_name = get_desc(root, "billing.name")
        shipping_name = get_desc(root, "shipping.name")

        self.assertNotEqual(billing_name, shipping_name)
        self.assertEqual(len({billing_name, shipping_name}), 2)
        self.assertEqual(common_ancestor(billing_name, shipping_name), root)

        deep = parse_schema(["user.address.city", "company.address.city"])
        u_city = get_desc(deep, "user.address.city")
        c_city = get_desc(deep, "company.address.city")
        self.assertNotEqual(u_city, c_city)
        self.assertEqual(len({u_city, c_city}), 2)

    def test_tree_levels_and_full_levels(self):
        s = PaperSchema()
        self.assertEqual(s.root.tree_level, 0)
        self.assertEqual(s.doc_id.tree_level, 1)
        self.assertEqual(s.links_forward.tree_level, 2)
        self.assertEqual(s.name_language_country.tree_level, 3)

        # full_repetition_level returns parent tree_level of the repeating ancestor
        self.assertEqual(s.name_url.full_repetition_level(0), 0)
        self.assertEqual(s.name_url.full_repetition_level(1), 0)
        self.assertEqual(s.name_language_country.full_repetition_level(1), 0)
        self.assertEqual(s.name_language_country.full_repetition_level(2), 1)
        self.assertEqual(s.links_forward.full_repetition_level(1), 1)

        with self.assertRaises(ValueError):
            s.name_url.full_repetition_level(2)
        with self.assertRaises(ValueError):
            s.name_url.full_repetition_level(-1)

        # full_definition_level with optional fields
        for d in range(4):
            self.assertEqual(s.name_language_country.full_definition_level(d), d)
        with self.assertRaises(ValueError):
            s.name_language_country.full_definition_level(4)

    def test_full_definition_level_with_required_fields(self):
        # Name (optional/repeated, d=1, tree=1) -> Meta (required, d=1, tree=2)
        # -> Tag (optional, d=2, tree=3)
        tag = mk_desc("Tag", 1, 2)
        meta = mk_desc("Meta", 1, 1, children=[tag])
        name = mk_desc("Name", 1, 1, is_repeated=True, children=[meta])
        root = mk_desc("$", 0, 0, children=[name])

        self.assertEqual(root.tree_level, 0)
        self.assertEqual(tag.tree_level, 3)
        self.assertEqual(tag.full_definition_level(0), 0)
        # Deepest ancestor at d=1 is Meta (tree_level=2), not Name (tree_level=1)
        self.assertEqual(tag.full_definition_level(1), 2)
        self.assertEqual(tag.full_definition_level(2), 3)

    def test_schema_validation_errors(self):
        invalid_schemas = [
            [],
            [""],
            ["   "],
            [".a"],
            ["a."],
            ["a..b"],
            ["[*]"],
            ["a.[*]"],
            ["a[0].b"],
            ["$"],
            ["a.b", "a[*].c"],
            ["a[*].b", "a.c"],
            ["a", "a.b"],
            ["a.b", "a"],
            ["a.b", "a.b"],
            ["a.b", "a.b[*]"],
        ]
        for bad in invalid_schemas:
            with self.subTest(schema=bad):
                with self.assertRaises(ValueError):
                    parse_schema(bad)


if __name__ == "__main__":
    unittest.main()
