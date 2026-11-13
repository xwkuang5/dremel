import { describe, expect, it } from "vitest";
import { PaperSchema } from "../paperSchema";
import { commonAncestor, parseSchema } from "../schema";
import { getDesc, mkDesc } from "../testUtils";

describe("parseSchema and ColumnDescriptor", () => {
  it("parses a simple schema", () => {
    const root = parseSchema(["a", "b"]);
    const expected = mkDesc("$", 0, 0, {
      children: [mkDesc("a", 0, 1), mkDesc("b", 0, 1)],
    });
    expect(root.equals(expected)).toBe(true);
  });

  it("parses a nested schema", () => {
    const root = parseSchema(["a.b"]);
    const expected = mkDesc("$", 0, 0, {
      children: [mkDesc("a", 0, 1, { children: [mkDesc("b", 0, 2)] })],
    });
    expect(root.equals(expected)).toBe(true);
  });

  it("parses a repeated group schema", () => {
    const root = parseSchema(["a[*].b"]);
    const expected = mkDesc("$", 0, 0, {
      children: [
        mkDesc("a", 1, 1, { isRepeated: true, children: [mkDesc("b", 1, 2)] }),
      ],
    });
    expect(root.equals(expected)).toBe(true);
  });

  it("parses a repeated leaf schema", () => {
    const root = parseSchema(["a.b[*]"]);
    const expected = mkDesc("$", 0, 0, {
      children: [
        mkDesc("a", 0, 1, { children: [mkDesc("b", 1, 2, { isRepeated: true })] }),
      ],
    });
    expect(root.equals(expected)).toBe(true);
  });

  it("parses the PaperSchema", () => {
    const schema = [
      "DocId",
      "Links.Backward[*]",
      "Links.Forward[*]",
      "Name[*].Language[*].Code",
      "Name[*].Language[*].Country",
      "Name[*].Url",
    ];
    const root = parseSchema(schema);

    const expected = mkDesc("$", 0, 0, {
      children: [
        mkDesc("DocId", 0, 1),
        mkDesc("Links", 0, 1, {
          children: [
            mkDesc("Backward", 1, 2, { isRepeated: true }),
            mkDesc("Forward", 1, 2, { isRepeated: true }),
          ],
        }),
        mkDesc("Name", 1, 1, {
          isRepeated: true,
          children: [
            mkDesc("Language", 2, 2, {
              isRepeated: true,
              children: [mkDesc("Code", 2, 3), mkDesc("Country", 2, 3)],
            }),
            mkDesc("Url", 1, 2),
          ],
        }),
      ],
    });
    expect(root.equals(expected)).toBe(true);
    expect(root.equals(new PaperSchema().root)).toBe(true);
  });

  it("does not collide same leaf name under different parents", () => {
    const root = parseSchema(["billing.name", "shipping.name"]);
    const billingName = getDesc(root, "billing.name");
    const shippingName = getDesc(root, "shipping.name");

    expect(billingName.equals(shippingName)).toBe(false);
    expect(commonAncestor(billingName, shippingName)?.equals(root)).toBe(true);

    const deep = parseSchema(["user.address.city", "company.address.city"]);
    const uCity = getDesc(deep, "user.address.city");
    const cCity = getDesc(deep, "company.address.city");
    expect(uCity.equals(cCity)).toBe(false);
  });

  it("computes tree levels, fullRepetitionLevel, and fullDefinitionLevel", () => {
    const s = new PaperSchema();
    expect(s.root.treeLevel).toBe(0);
    expect(s.docId.treeLevel).toBe(1);
    expect(s.linksForward.treeLevel).toBe(2);
    expect(s.nameLanguageCountry.treeLevel).toBe(3);

    expect(s.nameUrl.fullRepetitionLevel(0)).toBe(0);
    expect(s.nameUrl.fullRepetitionLevel(1)).toBe(0);
    expect(s.nameLanguageCountry.fullRepetitionLevel(1)).toBe(0);
    expect(s.nameLanguageCountry.fullRepetitionLevel(2)).toBe(1);
    expect(s.linksForward.fullRepetitionLevel(1)).toBe(1);

    expect(() => s.nameUrl.fullRepetitionLevel(2)).toThrow();
    expect(() => s.nameUrl.fullRepetitionLevel(-1)).toThrow();

    for (let d = 0; d < 4; d++) {
      expect(s.nameLanguageCountry.fullDefinitionLevel(d)).toBe(d);
    }
    expect(() => s.nameLanguageCountry.fullDefinitionLevel(4)).toThrow();
  });

  it("computes fullDefinitionLevel correctly with required fields", () => {
    // Name (optional/repeated, d=1, tree=1) -> Meta (required, d=1, tree=2)
    // -> Tag (optional, d=2, tree=3)
    const tag = mkDesc("Tag", 1, 2);
    const meta = mkDesc("Meta", 1, 1, { children: [tag] });
    const name = mkDesc("Name", 1, 1, { isRepeated: true, children: [meta] });
    const root = mkDesc("$", 0, 0, { children: [name] });

    expect(root.treeLevel).toBe(0);
    expect(tag.treeLevel).toBe(3);
    expect(tag.fullDefinitionLevel(0)).toBe(0);
    expect(tag.fullDefinitionLevel(1)).toBe(2);
    expect(tag.fullDefinitionLevel(2)).toBe(3);
  });

  it("rejects all invalid schema definitions", () => {
    const invalidSchemas: string[][] = [
      [],
      [""],
      ["   "],
      [".a"],
      ["a."],
      ["a..b"],
      ["[*]"],
      ["a.[*]"],
      ["a[0].b"],
      ["$"],
      ["a.b", "a[*].c"],
      ["a[*].b", "a.c"],
      ["a", "a.b"],
      ["a.b", "a"],
      ["a.b", "a.b"],
      ["a.b", "a.b[*]"],
    ];

    for (const bad of invalidSchemas) {
      expect(() => parseSchema(bad)).toThrow();
    }
  });
});
