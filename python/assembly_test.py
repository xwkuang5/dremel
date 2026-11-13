import unittest

from assembly import StringBuilder, TextColumnAssembler, assemble_records
from paper_schema import PaperSchema
from schema import ColumnDescriptor, parse_schema
from shred import shred_records
from test_utils import get_desc, mk_desc


class TestAssembly(unittest.TestCase):
    def test_dremel_paper_example_lossless(self):
        s = PaperSchema()
        records = [
            {
                "DocId": 10,
                "Links": {"Forward": [20, 40, 60]},
                "Name": [
                    {
                        "Language": [
                            {"Code": "en-us", "Country": "us"},
                            {"Code": "en"},
                        ],
                        "Url": "http://A",
                    },
                    {"Url": "http://B"},
                    {"Language": [{"Code": "en-gb", "Country": "gb"}]},
                ],
            },
            {
                "DocId": 20,
                "Links": {"Backward": [10, 30], "Forward": [80]},
                "Name": [{"Url": "http://C"}],
            },
            {},
        ]

        shredded = shred_records(s.root, records)
        assembled = assemble_records(s.root, shredded)
        self.assertEqual(assembled, records)

    def test_repeated_fields_overwrite(self):
        # Regression test for repeated fields and missing optional repeated groups.
        schema = parse_schema(["doc.title", "doc.links[*].url"])
        records = [
            {
                "doc": {
                    "title": "Dremel Paper",
                    "links": [
                        {"url": "http://google.com"},
                        {"url": "http://cs.stanford.edu"},
                    ],
                }
            },
            {
                "doc": {
                    "title": "Another Doc"
                    # links is missing (optional)
                }
            },
        ]

        shredded = shred_records(schema, records)
        assembled = assemble_records(schema, shredded)
        self.assertEqual(assembled, records)

    def test_debugging_assembler(self):
        s = PaperSchema()
        records = [{"DocId": 10, "Links": {"Forward": [20]}}]
        shredded = shred_records(s.root, records)

        sb = StringBuilder()
        assemble_records(
            s.root,
            shredded,
            assembler_factory=lambda desc: TextColumnAssembler(desc, sb),
        )

        expected_output = """\
  <begin DocId>
    DocId=10
  <end DocId>
  <begin Links>
    <begin Links.Forward>
      Links.Forward=20
    <end Links.Forward>
  <end Links>"""
        self.assertEqual(str(sb), expected_output)

    def test_debugging_assembler_repeated_group_boundaries(self):
        s = PaperSchema()
        records = [{"DocId": 10, "Name": [{"Url": "http://A"}, {"Url": "http://B"}]}]
        shredded = shred_records(s.root, records)

        sb = StringBuilder()
        assemble_records(
            s.root,
            shredded,
            assembler_factory=lambda desc: TextColumnAssembler(desc, sb),
        )

        expected_output = """\
  <begin DocId>
    DocId=10
  <end DocId>
  <begin Name>
    <begin Name.Url>
      Name.Url=http://A
    <end Name.Url>
  <end Name>
  <begin Name>
    <begin Name.Url>
      Name.Url=http://B
    <end Name.Url>
  <end Name>"""
        self.assertEqual(str(sb), expected_output)

    def test_figure_7_column_projection(self):
        # Section 4.2 / Figure 7 of the Dremel paper: projecting DocId and
        # Name.Language.Country preserves empty Language {} and Name {} shells
        # up to definition level d so array element indices remain intact.
        s = PaperSchema()
        shredded = shred_records(s.root, s.records)
        projected = assemble_records(
            s.root, shredded, selection=[s.doc_id, s.name_language_country]
        )

        self.assertEqual(
            projected,
            [
                {
                    "DocId": 10,
                    "Name": [
                        {"Language": [{"Country": "us"}, {}]},
                        {},
                        {"Language": [{"Country": "gb"}]},
                    ],
                },
                {
                    "DocId": 20,
                    "Name": [{}],
                },
            ],
        )

    def test_nested_repeated_groups_as_last_child(self):
        cases = [
            (
                ["a[*].b[*].x"],
                [{"a": [{"b": [{"x": 1}]}, {"b": [{"x": 2}]}]}],
            ),
            (
                ["a[*].b[*].x", "a[*].b[*].y"],
                [{"a": [{"b": [{"x": 1, "y": 2}, {"x": 3}]}, {"b": [{"y": 4}]}]}],
            ),
            (
                ["a[*].id", "a[*].tags[*].name"],
                [{"a": [{"id": 1, "tags": [{"name": "t1"}]}, {"id": 2}]}],
            ),
            (
                ["a[*].b[*].c[*].x"],
                [
                    {
                        "a": [
                            {"b": [{"c": [{"x": 1}]}, {"c": [{"x": 2}]}]},
                            {"b": [{"c": [{"x": 3}]}]},
                        ]
                    }
                ],
            ),
            (
                [
                    "DocId",
                    "Links.Backward[*]",
                    "Links.Forward[*]",
                    "Name[*].Url",
                    "Name[*].Language[*].Code",
                    "Name[*].Language[*].Country",
                ],
                PaperSchema().records,
            ),
        ]

        for schema_paths, records in cases:
            with self.subTest(schema_paths=schema_paths):
                schema = parse_schema(schema_paths)
                shredded = shred_records(schema, records)
                self.assertEqual(assemble_records(schema, shredded), records)

    def test_missing_last_nested_group_preserves_siblings(self):
        schema = parse_schema(["a[*].b", "a[*].c.d"])
        records = [
            {"a": [{"b": 1}]},
            {"a": [{"b": 1, "c": {"d": 10}}, {"b": 2}]},
        ]
        shredded = shred_records(schema, records)
        self.assertEqual(assemble_records(schema, shredded), records)

    def test_empty_sub_messages_and_empty_dicts_in_repeated_group(self):
        schema_opt = parse_schema(["Links.Forward[*]"])
        records_opt = [{}, {"Links": {}}, {"Links": {"Forward": [10, 20]}}]
        shredded_opt = shred_records(schema_opt, records_opt)
        self.assertEqual(assemble_records(schema_opt, shredded_opt), records_opt)

        schema_rep = parse_schema(["a[*].b", "a[*].c"])
        records_rep = [{"a": [{"b": 1}, {}, {"c": 2}]}]
        shredded_rep = shred_records(schema_rep, records_rep)
        self.assertEqual(assemble_records(schema_rep, shredded_rep), records_rep)

    def test_same_leaf_names_under_different_parents(self):
        schema = parse_schema(
            [
                "billing.name",
                "shipping.name",
                "user.address.city",
                "company.address.city",
            ]
        )
        records = [
            {
                "billing": {"name": "Alice"},
                "shipping": {"name": "Bob"},
                "user": {"address": {"city": "NYC"}},
                "company": {"address": {"city": "SF"}},
            }
        ]
        shredded = shred_records(schema, records)
        self.assertEqual(assemble_records(schema, shredded), records)

        shipping_name = get_desc(schema, "shipping.name")
        projected = assemble_records(schema, shredded, selection=[shipping_name])
        self.assertEqual(projected, [{"shipping": {"name": "Bob"}}])

    def test_required_descriptors_via_mk_desc(self):
        # Figure 2 of Dremel paper: DocId (required, d=0, tree_level=1) and
        # Name.Language.Code (required inside Language, d=2, tree_level=3), plus
        # a required group Meta (d=1, tree_level=2) with optional Note (d=2, tree_level=3).
        doc_id = mk_desc("DocId", 0, 0)
        code = mk_desc("Code", 2, 2)
        country = mk_desc("Country", 2, 3)
        note = mk_desc("Note", 1, 2)
        meta = mk_desc("Meta", 1, 1, children=[note])
        language = mk_desc("Language", 2, 2, is_repeated=True, children=[code, country])
        name = mk_desc("Name", 1, 1, is_repeated=True, children=[language, meta])
        root = mk_desc("$", 0, 0, children=[doc_id, name])

        column_data = {
            doc_id: [(10, 0, 0)],
            code: [("en-us", 0, 2), ("en", 2, 2), (None, 1, 1)],
            country: [("us", 0, 3), (None, 2, 2), (None, 1, 1)],
            note: [(None, 0, 1), ("second", 1, 2)],
        }
        assembled = assemble_records(root, column_data)
        self.assertEqual(
            assembled,
            [
                {
                    "DocId": 10,
                    "Name": [
                        {
                            "Language": [
                                {"Code": "en-us", "Country": "us"},
                                {"Code": "en"},
                            ],
                            "Meta": {},
                        },
                        {"Meta": {"Note": "second"}},
                    ],
                }
            ],
        )

    def test_validation_errors(self):
        with self.assertRaises(ValueError):
            assemble_records(ColumnDescriptor("$"), {})

        s = PaperSchema()
        shredded = shred_records(s.root, s.records)

        with self.assertRaises(ValueError):
            assemble_records(s.root, {s.doc_id: shredded[s.doc_id]})

        corrupted = dict(shredded)
        corrupted[s.links_forward] = shredded[s.links_forward] + [(99, 0, 2)]
        with self.assertRaises(ValueError):
            assemble_records(s.root, corrupted)


if __name__ == "__main__":
    unittest.main()
