import unittest
from schema import parse_schema
from shred import shred_records
from assembly import assemble_records
from paper_schema import PaperSchema


class TestAssembly(unittest.TestCase):
    def test_dremel_paper_example_one_record(self):
        s = PaperSchema()
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

        shredded = shred_records(s.root, records)
        assembled = assemble_records(s.root, shredded)

        # NOTE: the encoding and decoding is not lossless at the moment. Note
        # how Name.Language is `[]` in the assembled record but is absent in
        # the original record.
        self.assertEqual(assembled, [
            {
                "DocId": 10,
                "Links": {
                    "Backward": [],
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
                        "Language": [],
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
                    {"Language": [],
                     "Url": "http://C"}
                ]
            }
        ])


if __name__ == '__main__':
    unittest.main()
