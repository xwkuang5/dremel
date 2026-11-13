import { describe, expect, it } from "vitest";
import { assembleRecords } from "../assembly";
import { PaperSchema } from "../paperSchema";
import { ColumnDescriptor, findDescriptorInMap, parseSchema } from "../schema";
import { shredRecords } from "../shred";
import { getDesc, mkDesc } from "../testUtils";

describe("Dremel record shredding", () => {
  it("shreds a basic example", () => {
    const schema = parseSchema(["a.b[*].c", "a.d"]);
    const records = [{ a: { b: [{ c: 1 }, { c: 2 }], d: 1 } }, { a: { d: 2 } }];
    const result = shredRecords(schema, records);

    expect(findDescriptorInMap(result, getDesc(schema, "a.b[*].c"))).toEqual([
      [1, 0, 3],
      [2, 1, 3],
      [null, 0, 1],
    ]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.d"))).toEqual([
      [1, 0, 2],
      [2, 0, 2],
    ]);
  });

  it("shreds the PaperSchema example", () => {
    const s = new PaperSchema();
    const result = shredRecords(s.root, s.records);

    expect(findDescriptorInMap(result, s.docId)).toEqual([
      [10, 0, 1],
      [20, 0, 1],
    ]);
    expect(findDescriptorInMap(result, s.linksBackward)).toEqual([
      [null, 0, 1],
      [10, 0, 2],
      [30, 1, 2],
    ]);
    expect(findDescriptorInMap(result, s.linksForward)).toEqual([
      [20, 0, 2],
      [40, 1, 2],
      [60, 1, 2],
      [80, 0, 2],
    ]);
    expect(findDescriptorInMap(result, s.nameUrl)).toEqual([
      ["http://A", 0, 2],
      ["http://B", 1, 2],
      [null, 1, 1],
      ["http://C", 0, 2],
    ]);
    expect(findDescriptorInMap(result, s.nameLanguageCode)).toEqual([
      ["en-us", 0, 3],
      ["en", 2, 3],
      [null, 1, 1],
      ["en-gb", 1, 3],
      [null, 0, 1],
    ]);
  });

  it("handles missing root fields", () => {
    const schema = parseSchema(["a.b"]);
    const result = shredRecords(schema, [{}]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.b"))).toEqual([
      [null, 0, 0],
    ]);
  });

  it("handles missing nested fields", () => {
    const schema = parseSchema(["a.b"]);
    const result = shredRecords(schema, [{ a: {} }]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.b"))).toEqual([
      [null, 0, 1],
    ]);
  });

  it("handles empty repeated lists", () => {
    const schema = parseSchema(["a.b[*].c"]);
    const result = shredRecords(schema, [{ a: { b: [] } }]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.b[*].c"))).toEqual([
      [null, 0, 1],
    ]);
  });

  it("treats null repeated field as missing", () => {
    const schema = parseSchema(["a.b[*]"]);
    const result = shredRecords(schema, [{ a: { b: null } }]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.b[*]"))).toEqual([
      [null, 0, 1],
    ]);
  });

  it("handles repeated group elements with missing fields", () => {
    const schema = parseSchema(["a.b[*].c"]);
    const result = shredRecords(schema, [{ a: { b: [{ c: 1 }, {}] } }]);
    expect(findDescriptorInMap(result, getDesc(schema, "a.b[*].c"))).toEqual([
      [1, 0, 3],
      [null, 1, 2],
    ]);
  });

  it("handles multiple records with mixed repeated subfields", () => {
    const schema = parseSchema(["doc.links[*].forward", "doc.links[*].backward"]);
    const records = [
      { doc: { links: [{ forward: 20, backward: 10 }, { forward: 40 }] } },
      { doc: { links: [{ backward: 30 }] } },
    ];
    const result = shredRecords(schema, records);
    expect(
      findDescriptorInMap(result, getDesc(schema, "doc.links[*].forward")),
    ).toEqual([
      [20, 0, 3],
      [40, 1, 3],
      [null, 0, 2],
    ]);
    expect(
      findDescriptorInMap(result, getDesc(schema, "doc.links[*].backward")),
    ).toEqual([
      [10, 0, 3],
      [null, 1, 2],
      [30, 0, 3],
    ]);
  });

  it("keeps same leaf name under different parents distinct", () => {
    const schema = parseSchema(["billing.name", "shipping.name"]);
    const records = [{ billing: { name: "Alice" }, shipping: { name: "Bob" } }];
    const result = shredRecords(schema, records);
    expect(result.size).toBe(2);
    expect(findDescriptorInMap(result, getDesc(schema, "billing.name"))).toEqual([
      ["Alice", 0, 2],
    ]);
    expect(findDescriptorInMap(result, getDesc(schema, "shipping.name"))).toEqual([
      ["Bob", 0, 2],
    ]);
  });

  it("shreds top-level repeated leaf", () => {
    const schema = parseSchema(["values[*]"]);
    const records = [{ values: [1, 2] }, { values: [] }, {}];
    const result = shredRecords(schema, records);
    expect(findDescriptorInMap(result, getDesc(schema, "values[*]"))).toEqual([
      [1, 0, 1],
      [2, 1, 1],
      [null, 0, 0],
      [null, 0, 0],
    ]);
  });

  it("shreds mixed repeated leaf and sibling", () => {
    const schema = parseSchema(["data.values[*]", "data.meta"]);
    const records = [
      { data: { values: [1, 2], meta: "m1" } },
      { data: { values: [], meta: "m2" } },
      { data: {} },
      {},
    ];
    const result = shredRecords(schema, records);
    expect(
      findDescriptorInMap(result, getDesc(schema, "data.values[*]")),
    ).toEqual([
      [1, 0, 2],
      [2, 1, 2],
      [null, 0, 1],
      [null, 0, 1],
      [null, 0, 0],
    ]);
    expect(findDescriptorInMap(result, getDesc(schema, "data.meta"))).toEqual([
      ["m1", 0, 2],
      ["m2", 0, 2],
      [null, 0, 1],
      [null, 0, 0],
    ]);
  });

  it("rejects empty schema", () => {
    const emptyRoot = new ColumnDescriptor("$");
    expect(() => shredRecords(emptyRoot, [{}])).toThrow();
  });

  it("rejects non-list records", () => {
    const schema = parseSchema(["a"]);
    expect(() => shredRecords(schema, { a: 1 })).toThrow(
      /Expected list of records/,
    );
  });

  it("rejects non-object top-level record", () => {
    const schema = parseSchema(["a"]);
    expect(() => shredRecords(schema, [123])).toThrow(
      /Expected dict for record/,
    );
  });

  it("rejects non-list value for repeated field", () => {
    const schema = parseSchema(["r[*]"]);
    expect(() => shredRecords(schema, [{ r: 1 }])).toThrow(
      "Field 'r' is repeated, expected list, found int: 1",
    );
  });

  it("rejects null inside repeated primitive field", () => {
    const schema = parseSchema(["r[*]"]);
    expect(() => shredRecords(schema, [{ r: [1, null, 2] }])).toThrow(
      "Repeated field 'r' cannot contain None values",
    );
  });

  it("rejects containers inside repeated primitive field", () => {
    const schema = parseSchema(["r[*]"]);
    expect(() => shredRecords(schema, [{ r: [[1]] }])).toThrow();
    expect(() => shredRecords(schema, [{ r: [{ x: 1 }] }])).toThrow();
  });

  it("rejects non-object elements in repeated group", () => {
    const schema = parseSchema(["a[*].b"]);
    expect(() => shredRecords(schema, [{ a: [123] }])).toThrow(
      "Field 'a' is a repeated group, expected dict elements, found int: 123",
    );
  });

  it("rejects list for non-repeated field", () => {
    const schema = parseSchema(["nr"]);
    expect(() => shredRecords(schema, [{ nr: [1] }])).toThrow(
      "Field 'nr' is not repeated, expected single value, found list: [1]",
    );
  });

  it("rejects object for primitive leaf", () => {
    const schema = parseSchema(["nr"]);
    expect(() => shredRecords(schema, [{ nr: { x: 1 } }])).toThrow(
      /Field 'nr' is a primitive leaf, expected scalar value, found dict/,
    );
  });

  it("rejects scalar for nested group", () => {
    const schema = parseSchema(["g.f"]);
    expect(() => shredRecords(schema, [{ g: 1 }])).toThrow(
      "Field 'g' is a nested group, expected dict, found int: 1",
    );
  });

  it("rejects dict for nested repeated group", () => {
    const schema = parseSchema(["r[*].a"]);
    expect(() => shredRecords(schema, [{ r: { a: 1 } }])).toThrow(
      /Field 'r' is repeated, expected list, found dict/,
    );
  });

  it("rejects list for nested non-repeated leaf", () => {
    const schema = parseSchema(["r[*].a"]);
    expect(() => shredRecords(schema, [{ r: [{ a: [1] }] }])).toThrow(
      "Field 'a' is not repeated, expected single value, found list: [1]",
    );
  });

  it("matches exact Figure 2 & 3 paper schema with required fields", () => {
    const docId = mkDesc("DocId", 0, 0);
    const linksBackward = mkDesc("Backward", 1, 2, { isRepeated: true });
    const linksForward = mkDesc("Forward", 1, 2, { isRepeated: true });
    const code = mkDesc("Code", 2, 2);
    const country = mkDesc("Country", 2, 3);
    const url = mkDesc("Url", 1, 2);

    const links = mkDesc("Links", 0, 1, {
      children: [linksBackward, linksForward],
    });
    const language = mkDesc("Language", 2, 2, {
      isRepeated: true,
      children: [code, country],
    });
    const name = mkDesc("Name", 1, 1, {
      isRepeated: true,
      children: [language, url],
    });
    const root = mkDesc("$", 0, 0, { children: [docId, links, name] });

    const records = new PaperSchema().records;
    const result = shredRecords(root, records);

    expect(findDescriptorInMap(result, docId)).toEqual([
      [10, 0, 0],
      [20, 0, 0],
    ]);
    expect(findDescriptorInMap(result, linksBackward)).toEqual([
      [null, 0, 1],
      [10, 0, 2],
      [30, 1, 2],
    ]);
    expect(findDescriptorInMap(result, linksForward)).toEqual([
      [20, 0, 2],
      [40, 1, 2],
      [60, 1, 2],
      [80, 0, 2],
    ]);
    expect(findDescriptorInMap(result, code)).toEqual([
      ["en-us", 0, 2],
      ["en", 2, 2],
      [null, 1, 1],
      ["en-gb", 1, 2],
      [null, 0, 1],
    ]);
    expect(findDescriptorInMap(result, country)).toEqual([
      ["us", 0, 3],
      [null, 2, 2],
      [null, 1, 1],
      ["gb", 1, 3],
      [null, 0, 1],
    ]);
    expect(findDescriptorInMap(result, url)).toEqual([
      ["http://A", 0, 2],
      ["http://B", 1, 2],
      [null, 1, 1],
      ["http://C", 0, 2],
    ]);

    expect(assembleRecords(root, result)).toEqual(records);

    expect(() => shredRecords(root, [{}])).toThrow();
    expect(() => shredRecords(root, [{ DocId: null }])).toThrow();
    expect(() =>
      shredRecords(root, [{ DocId: 10, Name: [{ Language: [{}] }] }]),
    ).toThrow();
  });
});
