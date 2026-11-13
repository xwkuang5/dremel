import { describe, expect, it } from "vitest";
import {
  assembleRecords,
  StringBuilder,
  TextColumnAssembler,
  traceAssembly,
} from "../assembly";
import { PaperSchema } from "../paperSchema";
import { ColumnDescriptor, findDescriptorInMap, parseSchema } from "../schema";
import { JsonObject, ShreddedColumnMap, shredRecords } from "../shred";
import { getDesc, mkDesc } from "../testUtils";

describe("Dremel record assembly", () => {
  it("losslessly round-trips the Dremel paper example", () => {
    const s = new PaperSchema();
    const records: JsonObject[] = [
      {
        DocId: 10,
        Links: { Forward: [20, 40, 60] },
        Name: [
          {
            Language: [{ Code: "en-us", Country: "us" }, { Code: "en" }],
            Url: "http://A",
          },
          { Url: "http://B" },
          { Language: [{ Code: "en-gb", Country: "gb" }] },
        ],
      },
      {
        DocId: 20,
        Links: { Backward: [10, 30], Forward: [80] },
        Name: [{ Url: "http://C" }],
      },
      {},
    ];

    const shredded = shredRecords(s.root, records);
    const assembled = assembleRecords(s.root, shredded);
    expect(assembled).toEqual(records);
  });

  it("handles repeated fields and missing optional repeated groups", () => {
    const schema = parseSchema(["doc.title", "doc.links[*].url"]);
    const records: JsonObject[] = [
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
    ];

    const shredded = shredRecords(schema, records);
    const assembled = assembleRecords(schema, shredded);
    expect(assembled).toEqual(records);
  });

  it("matches TextColumnAssembler debugging output", () => {
    const s = new PaperSchema();
    const records: JsonObject[] = [{ DocId: 10, Links: { Forward: [20] } }];
    const shredded = shredRecords(s.root, records);

    const sb = new StringBuilder();
    assembleRecords(s.root, shredded, {
      assemblerFactory: (desc) => new TextColumnAssembler(desc, sb),
    });

    const expectedOutput = [
      "  <begin DocId>",
      "    DocId=10",
      "  <end DocId>",
      "  <begin Links>",
      "    <begin Links.Forward>",
      "      Links.Forward=20",
      "    <end Links.Forward>",
      "  <end Links>",
    ].join("\n");
    expect(sb.toString()).toBe(expectedOutput);
  });

  it("matches TextColumnAssembler repeated group boundaries", () => {
    const s = new PaperSchema();
    const records: JsonObject[] = [
      { DocId: 10, Name: [{ Url: "http://A" }, { Url: "http://B" }] },
    ];
    const shredded = shredRecords(s.root, records);

    const sb = new StringBuilder();
    assembleRecords(s.root, shredded, {
      assemblerFactory: (desc) => new TextColumnAssembler(desc, sb),
    });

    const expectedOutput = [
      "  <begin DocId>",
      "    DocId=10",
      "  <end DocId>",
      "  <begin Name>",
      "    <begin Name.Url>",
      "      Name.Url=http://A",
      "    <end Name.Url>",
      "  <end Name>",
      "  <begin Name>",
      "    <begin Name.Url>",
      "      Name.Url=http://B",
      "    <end Name.Url>",
      "  <end Name>",
    ].join("\n");
    expect(sb.toString()).toBe(expectedOutput);
  });

  it("projects Figure 7 columns while preserving empty shells", () => {
    const s = new PaperSchema();
    const shredded = shredRecords(s.root, s.records);
    const projected = assembleRecords(s.root, shredded, {
      selection: [s.docId, s.nameLanguageCountry],
    });

    expect(projected).toEqual([
      {
        DocId: 10,
        Name: [
          { Language: [{ Country: "us" }, {}] },
          {},
          { Language: [{ Country: "gb" }] },
        ],
      },
      {
        DocId: 20,
        Name: [{}],
      },
    ]);
  });

  it("handles nested repeated groups as last child", () => {
    const cases: Array<[string[], JsonObject[]]> = [
      [
        ["a[*].b[*].x"],
        [{ a: [{ b: [{ x: 1 }] }, { b: [{ x: 2 }] }] }],
      ],
      [
        ["a[*].b[*].x", "a[*].b[*].y"],
        [{ a: [{ b: [{ x: 1, y: 2 }, { x: 3 }] }, { b: [{ y: 4 }] }] }],
      ],
      [
        ["a[*].id", "a[*].tags[*].name"],
        [{ a: [{ id: 1, tags: [{ name: "t1" }] }, { id: 2 }] }],
      ],
      [
        ["a[*].b[*].c[*].x"],
        [
          {
            a: [
              { b: [{ c: [{ x: 1 }] }, { c: [{ x: 2 }] }] },
              { b: [{ c: [{ x: 3 }] }] },
            ],
          },
        ],
      ],
      [
        [
          "DocId",
          "Links.Backward[*]",
          "Links.Forward[*]",
          "Name[*].Url",
          "Name[*].Language[*].Code",
          "Name[*].Language[*].Country",
        ],
        new PaperSchema().records,
      ],
    ];

    for (const [schemaPaths, records] of cases) {
      const schema = parseSchema(schemaPaths);
      const shredded = shredRecords(schema, records);
      expect(assembleRecords(schema, shredded)).toEqual(records);
    }
  });

  it("preserves siblings when last nested group is missing", () => {
    const schema = parseSchema(["a[*].b", "a[*].c.d"]);
    const records: JsonObject[] = [
      { a: [{ b: 1 }] },
      { a: [{ b: 1, c: { d: 10 } }, { b: 2 }] },
    ];
    const shredded = shredRecords(schema, records);
    expect(assembleRecords(schema, shredded)).toEqual(records);
  });

  it("preserves empty sub-messages and empty dicts in repeated groups", () => {
    const schemaOpt = parseSchema(["Links.Forward[*]"]);
    const recordsOpt: JsonObject[] = [
      {},
      { Links: {} },
      { Links: { Forward: [10, 20] } },
    ];
    const shreddedOpt = shredRecords(schemaOpt, recordsOpt);
    expect(assembleRecords(schemaOpt, shreddedOpt)).toEqual(recordsOpt);

    const schemaRep = parseSchema(["a[*].b", "a[*].c"]);
    const recordsRep: JsonObject[] = [{ a: [{ b: 1 }, {}, { c: 2 }] }];
    const shreddedRep = shredRecords(schemaRep, recordsRep);
    expect(assembleRecords(schemaRep, shreddedRep)).toEqual(recordsRep);
  });

  it("handles same leaf names under different parents and projections", () => {
    const schema = parseSchema([
      "billing.name",
      "shipping.name",
      "user.address.city",
      "company.address.city",
    ]);
    const records: JsonObject[] = [
      {
        billing: { name: "Alice" },
        shipping: { name: "Bob" },
        user: { address: { city: "NYC" } },
        company: { address: { city: "SF" } },
      },
    ];
    const shredded = shredRecords(schema, records);
    expect(assembleRecords(schema, shredded)).toEqual(records);

    const shippingName = getDesc(schema, "shipping.name");
    const projected = assembleRecords(schema, shredded, {
      selection: [shippingName],
    });
    expect(projected).toEqual([{ shipping: { name: "Bob" } }]);
  });

  it("assembles required descriptors created via mkDesc", () => {
    const docId = mkDesc("DocId", 0, 0);
    const code = mkDesc("Code", 2, 2);
    const country = mkDesc("Country", 2, 3);
    const note = mkDesc("Note", 1, 2);
    const meta = mkDesc("Meta", 1, 1, { children: [note] });
    const language = mkDesc("Language", 2, 2, {
      isRepeated: true,
      children: [code, country],
    });
    const name = mkDesc("Name", 1, 1, {
      isRepeated: true,
      children: [language, meta],
    });
    const root = mkDesc("$", 0, 0, { children: [docId, name] });

    const columnData: ShreddedColumnMap = new Map([
      [docId, [[10, 0, 0]]],
      [
        code,
        [
          ["en-us", 0, 2],
          ["en", 2, 2],
          [null, 1, 1],
        ],
      ],
      [
        country,
        [
          ["us", 0, 3],
          [null, 2, 2],
          [null, 1, 1],
        ],
      ],
      [
        note,
        [
          [null, 0, 1],
          ["second", 1, 2],
        ],
      ],
    ]);

    const assembled = assembleRecords(root, columnData);
    expect(assembled).toEqual([
      {
        DocId: 10,
        Name: [
          {
            Language: [{ Code: "en-us", Country: "us" }, { Code: "en" }],
            Meta: {},
          },
          { Meta: { Note: "second" } },
        ],
      },
    ]);
  });

  it("rejects invalid inputs and corrupted column data", () => {
    expect(() => assembleRecords(new ColumnDescriptor("$"), new Map())).toThrow();

    const s = new PaperSchema();
    const shredded = shredRecords(s.root, s.records);

    const partial: ShreddedColumnMap = new Map([
      [s.docId, findDescriptorInMap(shredded, s.docId)!],
    ]);
    expect(() => assembleRecords(s.root, partial)).toThrow();

    const corrupted: ShreddedColumnMap = new Map(shredded);
    const existingForward = findDescriptorInMap(shredded, s.linksForward)!;
    corrupted.set(s.linksForward, [...existingForward, [99, 0, 2]]);
    expect(() => assembleRecords(s.root, corrupted)).toThrow();
  });

  it("traces assembly step-by-step and matches assembleRecords output", () => {
    const s = new PaperSchema();
    const shredded = shredRecords(s.root, s.records);
    const trace = traceAssembly(s.root, shredded);

    expect(trace.records).toEqual(s.records);
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(trace.steps[0].columnPath).toBe("DocId");
    expect(trace.steps[0].recordIndex).toBe(0);

    const projectedTrace = traceAssembly(s.root, shredded, [
      s.docId,
      s.nameLanguageCountry,
    ]);
    expect(projectedTrace.records).toEqual(
      assembleRecords(s.root, shredded, {
        selection: [s.docId, s.nameLanguageCountry],
      }),
    );
  });
});
