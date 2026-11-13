import { describe, expect, it } from "vitest";
import { END, FsmGraph, FsmNode, makeFsm } from "../fsm";
import { PaperSchema } from "../paperSchema";
import { ColumnDescriptor, parseSchema } from "../schema";
import { getDesc } from "../testUtils";

function serializeFsm(
  fsm: FsmGraph,
): Record<string, Record<number, string>> {
  const out: Record<string, Record<number, string>> = {};
  for (const [node, transitions] of fsm.entries()) {
    const inner: Record<number, string> = {};
    for (const [level, target] of transitions.entries()) {
      inner[level] = target === END ? END : target.fullPath;
    }
    out[node.fullPath] = inner;
  }
  return out;
}

function assertFsmEquals(
  actual: FsmGraph,
  expected: Array<[ColumnDescriptor, Record<number, FsmNode>]>,
): void {
  const expectedObj: Record<string, Record<number, string>> = {};
  for (const [node, transitions] of expected) {
    const inner: Record<number, string> = {};
    for (const [levelStr, target] of Object.entries(transitions)) {
      const level = Number(levelStr);
      inner[level] = target === END ? END : target.fullPath;
    }
    expectedObj[node.fullPath] = inner;
  }
  expect(serializeFsm(actual)).toEqual(expectedObj);
}

describe("makeFsm", () => {
  it("builds the FSM for PaperSchema", () => {
    const s = new PaperSchema();
    const fsm = makeFsm(s.root);

    assertFsmEquals(fsm, [
      [s.docId, { 0: s.linksBackward }],
      [s.linksBackward, { 0: s.linksForward, 1: s.linksBackward }],
      [s.linksForward, { 0: s.nameLanguageCode, 1: s.linksForward }],
      [
        s.nameLanguageCode,
        {
          0: s.nameLanguageCountry,
          1: s.nameLanguageCountry,
          2: s.nameLanguageCountry,
        },
      ],
      [
        s.nameLanguageCountry,
        {
          0: s.nameUrl,
          1: s.nameUrl,
          2: s.nameLanguageCode,
        },
      ],
      [s.nameUrl, { 0: END, 1: s.nameLanguageCode }],
    ]);
  });

  it("handles gap filling", () => {
    const schema = parseSchema(["a", "b[*].c", "b[*].d[*].e[*]", "b[*].f"]);
    const fsm = makeFsm(schema);

    const a = getDesc(schema, "a");
    const bC = getDesc(schema, "b[*].c");
    const bDE = getDesc(schema, "b[*].d[*].e[*]");
    const bF = getDesc(schema, "b[*].f");

    assertFsmEquals(fsm, [
      [a, { 0: bC }],
      [bC, { 0: bDE, 1: bDE }],
      [bDE, { 0: bF, 1: bF, 2: bDE, 3: bDE }],
      [bF, { 0: END, 1: bC }],
    ]);
  });

  it("supports column selection in schema DFS order", () => {
    const s = new PaperSchema();
    const selection = [s.nameLanguageCountry, s.docId];
    const fsm = makeFsm(s.root, selection);

    assertFsmEquals(fsm, [
      [s.docId, { 0: s.nameLanguageCountry }],
      [
        s.nameLanguageCountry,
        {
          0: END,
          1: s.nameLanguageCountry,
          2: s.nameLanguageCountry,
        },
      ],
    ]);
  });

  it("keeps same leaf name under different parents distinct in FSM", () => {
    const schema = parseSchema(["billing.name", "shipping.name"]);
    const billingName = getDesc(schema, "billing.name");
    const shippingName = getDesc(schema, "shipping.name");

    const fsm = makeFsm(schema);
    assertFsmEquals(fsm, [
      [billingName, { 0: shippingName }],
      [shippingName, { 0: END }],
    ]);

    const fsmProjected = makeFsm(schema, [billingName]);
    assertFsmEquals(fsmProjected, [[billingName, { 0: END }]]);
  });

  it("rejects invalid schemas and selections", () => {
    expect(() => makeFsm(new ColumnDescriptor("$"))).toThrow();

    const s = new PaperSchema();
    expect(() => makeFsm(s.root, [])).toThrow();

    const otherSchema = parseSchema(["other"]);
    const otherLeaf = getDesc(otherSchema, "other");
    expect(() => makeFsm(s.root, [otherLeaf])).toThrow();

    expect(() => makeFsm(s.root, [s.root.children.get("Links")!])).toThrow();
  });
});
