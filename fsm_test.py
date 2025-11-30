import unittest
from schema import parse_schema
from fsm import make_fsm, END
from test_utils import mk_desc, get_desc


from paper_schema import PaperSchema


class TestFSM(unittest.TestCase):
    def test_paper_example(self):
        s = PaperSchema()
        fsm = make_fsm(s.root)

        self.assertEqual(fsm, {
            s.doc_id: {0: s.links_backward},
            s.links_backward: {0: s.links_forward, 1: s.links_backward},
            s.links_forward: {0: s.name_language_code, 1: s.links_forward},
            s.name_language_code: {0: s.name_language_country, 1: s.name_language_country, 2: s.name_language_country},
            s.name_language_country: {0: s.name_url, 1: s.name_url, 2: s.name_language_code},
            s.name_url: {0: END, 1: s.name_language_code}
        })

    def test_gap_filling(self):
        schema = parse_schema(["a", "b[*].c", "b[*].d[*].e[*]", "b[*].f"])

        fsm = make_fsm(schema)

        a = get_desc(schema, "a")
        b_c = get_desc(schema, "b[*].c")
        b_d_e = get_desc(schema, "b[*].d[*].e[*]")
        b_f = get_desc(schema, "b[*].f")

        self.assertEqual(fsm, {
            a: {0: b_c},
            b_c: {0: b_d_e, 1: b_d_e},
            b_d_e: {0: b_f, 1: b_f, 2: b_d_e, 3: b_d_e},
            b_f: {0: END, 1: b_c}
        })

    def test_column_selection(self):
        s = PaperSchema()

        # Select DocId and Country
        selection = [s.doc_id, s.name_language_country]
        fsm = make_fsm(s.root, selection=selection)

        self.assertEqual(fsm, {
            s.doc_id: {0: s.name_language_country},
            s.name_language_country: {
                0: END, 1: s.name_language_country, 2: s.name_language_country}
        })


if __name__ == "__main__":
    unittest.main()
