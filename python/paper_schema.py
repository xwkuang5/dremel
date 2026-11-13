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
        links = mk_desc(
            "Links", 0, 1, children=[self.links_backward, self.links_forward]
        )
        name_language = mk_desc(
            "Language",
            2,
            2,
            is_repeated=True,
            children=[self.name_language_code, self.name_language_country],
        )
        name = mk_desc(
            "Name", 1, 1, is_repeated=True, children=[name_language, self.name_url]
        )

        # Root
        self.root = mk_desc("$", 0, 0, children=[self.doc_id, links, name])

        self.records = [
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
        ]
