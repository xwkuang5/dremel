import unittest

from fsm import END, make_fsm
from paper_schema import PaperSchema
from schema import ColumnDescriptor, parse_schema
from test_utils import get_desc


class TestFSM(unittest.TestCase):
    def test_paper_example(self):
        s = PaperSchema()
        fsm = make_fsm(s.root)

        self.assertEqual(
            fsm,
            {
                s.doc_id: {0: s.links_backward},
                s.links_backward: {0: s.links_forward, 1: s.links_backward},
                s.links_forward: {0: s.name_language_code, 1: s.links_forward},
                s.name_language_code: {
                    0: s.name_language_country,
                    1: s.name_language_country,
                    2: s.name_language_country,
                },
                s.name_language_country: {
                    0: s.name_url,
                    1: s.name_url,
                    2: s.name_language_code,
                },
                s.name_url: {0: END, 1: s.name_language_code},
            },
        )

    def test_gap_filling(self):
        schema = parse_schema(["a", "b[*].c", "b[*].d[*].e[*]", "b[*].f"])

        fsm = make_fsm(schema)

        a = get_desc(schema, "a")
        b_c = get_desc(schema, "b[*].c")
        b_d_e = get_desc(schema, "b[*].d[*].e[*]")
        b_f = get_desc(schema, "b[*].f")

        self.assertEqual(
            fsm,
            {
                a: {0: b_c},
                b_c: {0: b_d_e, 1: b_d_e},
                b_d_e: {0: b_f, 1: b_f, 2: b_d_e, 3: b_d_e},
                b_f: {0: END, 1: b_c},
            },
        )

    def test_column_selection(self):
        s = PaperSchema()

        # Select DocId and Country (even if passed in reverse order, schema DFS order applies)
        selection = [s.name_language_country, s.doc_id]
        fsm = make_fsm(s.root, selection=selection)

        self.assertEqual(
            fsm,
            {
                s.doc_id: {0: s.name_language_country},
                s.name_language_country: {
                    0: END,
                    1: s.name_language_country,
                    2: s.name_language_country,
                },
            },
        )

    def test_same_leaf_name_under_different_parents(self):
        schema = parse_schema(["billing.name", "shipping.name"])
        billing_name = get_desc(schema, "billing.name")
        shipping_name = get_desc(schema, "shipping.name")

        fsm = make_fsm(schema)
        self.assertEqual(
            fsm,
            {
                billing_name: {0: shipping_name},
                shipping_name: {0: END},
            },
        )

        fsm_projected = make_fsm(schema, selection=[billing_name])
        self.assertEqual(fsm_projected, {billing_name: {0: END}})

    def test_validation_errors(self):
        with self.assertRaises(ValueError):
            make_fsm(ColumnDescriptor("$"))

        s = PaperSchema()
        with self.assertRaises(ValueError):
            make_fsm(s.root, selection=[])

        other_schema = parse_schema(["other"])
        other_leaf = get_desc(other_schema, "other")
        with self.assertRaises(ValueError):
            make_fsm(s.root, selection=[other_leaf])

        with self.assertRaises(ValueError):
            make_fsm(s.root, selection=[s.root.children["Links"]])


if __name__ == "__main__":
    unittest.main()
