import unittest
from schema import parse_schema
from fsm import make_fsm, END
from test_utils import mk_desc


class TestFSM(unittest.TestCase):
    def test_paper_example(self):
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
        doc_id = mk_desc("DocId", 0, 1)
        links_backward = mk_desc("Backward", 1, 2, is_repeated=True)
        links_forward = mk_desc("Forward", 1, 2, is_repeated=True)
        links = mk_desc("Links", 0, 1, children=[
                        links_backward, links_forward])
        name_language_code = mk_desc("Code", 2, 3)
        name_language_country = mk_desc("Country", 2, 3)
        name_language = mk_desc("Language", 2, 2, is_repeated=True, children=[
                                name_language_code, name_language_country])
        name_url = mk_desc("Url", 1, 2)
        name = mk_desc("Name", 1, 1, is_repeated=True,
                       children=[name_language, name_url])

        schema = mk_desc("$", 0, 0, children=[doc_id, links, name])
        fsm = make_fsm(schema)

        self.assertEqual(fsm, {
            doc_id: {0: links_backward},
            links_backward: {0: links_forward, 1: links_backward},
            links_forward: {0: name_language_code, 1: links_forward},
            name_language_code: {0: name_language_country, 1: name_language_country, 2: name_language_country},
            name_language_country: {0: name_url, 1: name_url, 2: name_language_code},
            name_url: {0: END, 1: name_language_code}
        })


if __name__ == "__main__":
    unittest.main()
