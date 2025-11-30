import unittest
from schema import parse_schema
from fsm import make_fsm, END
from test_utils import mk_desc


class PaperSchema:
    def __init__(self):
        """
        // Modified schema from Figure 2 of Dremel paper

        message Document {
            optional int64 DocId;
            optional group Links {
                repeated int64 Backward;
                repeated int64 Forward;
            }
            repeated group Name {
                repeated group Language {
                    optional string Code;
                    optional string Country;
                }
                optional string Url;
            }
        }
        """
        # Leaf nodes
        self.doc_id = mk_desc("DocId", 0, 1)
        self.links_backward = mk_desc("Backward", 1, 2, is_repeated=True)
        self.links_forward = mk_desc("Forward", 1, 2, is_repeated=True)
        self.name_language_code = mk_desc("Code", 2, 3)
        self.name_language_country = mk_desc("Country", 2, 3)
        self.name_url = mk_desc("Url", 1, 2)

        # Intermediate nodes
        links = mk_desc("Links", 0, 1, children=[
                        self.links_backward, self.links_forward])
        name_language = mk_desc(
            "Language", 2, 2, is_repeated=True, children=[
                self.name_language_code, self.name_language_country])
        name = mk_desc("Name", 1, 1, is_repeated=True,
                       children=[name_language, self.name_url])

        # Root
        self.root = mk_desc("$", 0, 0, children=[self.doc_id, links, name])


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
