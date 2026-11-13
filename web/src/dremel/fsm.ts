import {
  ColumnDescriptor,
  commonAncestor,
  getLeaves,
  hasDescriptor,
} from "./schema";

export const END = "MAGIC" as const;

export type FsmNode = ColumnDescriptor | typeof END;
export type FsmTransitions = Map<number, FsmNode>;
export type FsmGraph = Map<ColumnDescriptor, FsmTransitions>;

export function makeFsm(
  schema: ColumnDescriptor,
  selection?: Iterable<ColumnDescriptor> | null,
): FsmGraph {
  if (!(schema instanceof ColumnDescriptor) || schema.path !== "$") {
    throw new Error("Schema root must be a ColumnDescriptor with path '$'");
  }
  if (schema.isLeaf) {
    throw new Error("Schema must contain at least one field");
  }

  const allLeaves = getLeaves(schema);
  let fields: ColumnDescriptor[];

  if (selection !== undefined && selection !== null) {
    const selectionList = Array.from(selection);
    if (selectionList.length === 0) {
      throw new Error("Selection must contain at least one column");
    }
    const unknown = selectionList.filter((d) => !hasDescriptor(allLeaves, d));
    if (unknown.length > 0) {
      throw new Error(
        `Selection contains unknown or non-leaf descriptors: ${unknown.map((u) => u.fullPath).join(", ")}`,
      );
    }
    fields = allLeaves.filter((f) => hasDescriptor(selectionList, f));
  } else {
    fields = allLeaves;
  }

  const fsm: FsmGraph = new Map();

  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const transitions: FsmTransitions = new Map();
    fsm.set(field, transitions);

    const maxLevel = field.maxRepetitionLevel;
    const barrier: FsmNode =
      index < fields.length - 1 ? fields[index + 1] : END;
    const barrierLevel =
      barrier !== END
        ? (commonAncestor(field, barrier)?.maxRepetitionLevel ?? 0)
        : 0;

    // Step 1: Add back edges
    for (let preIdx = index - 1; preIdx >= 0; preIdx--) {
      const preField = fields[preIdx];
      if (preField.maxRepetitionLevel <= barrierLevel) {
        continue;
      }
      const backLevel =
        commonAncestor(preField, field)?.maxRepetitionLevel ?? 0;
      transitions.set(backLevel, preField);
    }

    // Step 2: Fill gaps
    for (let level = maxLevel; level > barrierLevel; level--) {
      if (!transitions.has(level)) {
        transitions.set(
          level,
          level === maxLevel ? field : transitions.get(level + 1)!,
        );
      }
    }

    // Step 3: Add barrier edges
    for (let level = 0; level <= barrierLevel; level++) {
      transitions.set(level, barrier);
    }
  }

  return fsm;
}
