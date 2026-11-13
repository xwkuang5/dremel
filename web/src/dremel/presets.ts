import { PaperSchema } from "./paperSchema";
import { JsonObject } from "./shred";

export interface DremelPreset {
  id: string;
  name: string;
  description: string;
  schemaPaths: string[];
  records: JsonObject[];
  selectedPaths?: string[];
}

export const DEFAULT_SCHEMA_TEXT = [
  "DocId",
  "Links.Backward[*]",
  "Links.Forward[*]",
  "Name[*].Language[*].Code",
  "Name[*].Language[*].Country",
  "Name[*].Url",
].join("\n");

const paper = new PaperSchema();

export const PRESETS: DremelPreset[] = [
  {
    id: "paper-full",
    name: "Dremel Paper (Fig. 2 & 3)",
    description:
      "Classic Google Dremel paper document schema with nested repeated Name and Language groups.",
    schemaPaths: DEFAULT_SCHEMA_TEXT.split("\n"),
    records: paper.records,
  },
  {
    id: "paper-fig7",
    name: "Column Projection (Fig. 7)",
    description:
      "Projects only DocId and Name.Language.Country, preserving empty shells up to definition level d.",
    schemaPaths: DEFAULT_SCHEMA_TEXT.split("\n"),
    records: paper.records,
    selectedPaths: ["DocId", "Name.Language.Country"],
  },
  {
    id: "readme-example",
    name: "Document Links (README)",
    description:
      "Simple schema demonstrating optional repeated fields (one doc has links, one omits them).",
    schemaPaths: ["doc.title", "doc.links[*].url"],
    records: [
      {
        doc: {
          title: "Dremel Paper",
          links: [
            { url: "http://google.com" },
            { url: "http://cs.stanford.edu" },
          ],
        },
      },
      {
        doc: {
          title: "Another Doc",
        },
      },
    ],
  },
  {
    id: "deep-fsm",
    name: "Deep Repetition (FSM Gap-Filling)",
    description:
      "Three nested repeated levels (r=0..3) showcasing FSM gap-filling self-loops and multi-level back-edges.",
    schemaPaths: ["a", "b[*].c", "b[*].d[*].e[*]", "b[*].f"],
    records: [
      {
        a: "root-1",
        b: [
          {
            c: 10,
            d: [{ e: ["x", "y"] }, { e: ["z"] }],
            f: "end-1",
          },
          {
            c: 20,
            d: [],
            f: "end-2",
          },
        ],
      },
      {
        a: "root-2",
      },
    ],
  },
];
