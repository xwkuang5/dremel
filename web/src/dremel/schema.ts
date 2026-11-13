export function getAllNodes(root: ColumnDescriptor): ColumnDescriptor[] {
  const result: ColumnDescriptor[] = [root];
  for (const child of root.children.values()) {
    result.push(...getAllNodes(child));
  }
  return result;
}

export function getLeaves(root: ColumnDescriptor): ColumnDescriptor[] {
  if (root.children.size === 0) {
    return [root];
  }
  const result: ColumnDescriptor[] = [];
  for (const child of root.children.values()) {
    result.push(...getLeaves(child));
  }
  return result;
}

export function getAncestors(node: ColumnDescriptor | null): ColumnDescriptor[] {
  const result: ColumnDescriptor[] = [];
  let current = node;
  while (current !== null) {
    result.push(current);
    current = current.parent;
  }
  return result;
}

export function commonAncestor(
  a: ColumnDescriptor,
  b: ColumnDescriptor,
): ColumnDescriptor | null {
  const aAncestors = getAncestors(a).reverse();
  const bAncestors = getAncestors(b).reverse();

  let ancestor: ColumnDescriptor | null = null;
  const len = Math.min(aAncestors.length, bAncestors.length);
  for (let i = 0; i < len; i++) {
    if (aAncestors[i].equals(bAncestors[i])) {
      ancestor = aAncestors[i];
      continue;
    }
    break;
  }
  return ancestor;
}

export class ColumnDescriptor {
  path: string;
  parent: ColumnDescriptor | null;
  maxRepetitionLevel: number;
  maxDefinitionLevel: number;
  treeLevel: number;
  children: Map<string, ColumnDescriptor>;
  isRepeated: boolean;

  constructor(
    path: string,
    parent: ColumnDescriptor | null = null,
    maxRepetitionLevel = 0,
    maxDefinitionLevel = 0,
    treeLevel: number | null = null,
  ) {
    this.path = path;
    this.parent = parent;
    this.maxRepetitionLevel = maxRepetitionLevel;
    this.maxDefinitionLevel = maxDefinitionLevel;
    this.treeLevel =
      treeLevel !== null
        ? treeLevel
        : parent === null
          ? 0
          : parent.treeLevel + 1;
    this.children = new Map<string, ColumnDescriptor>();
    this.isRepeated = false;
  }

  get isLeaf(): boolean {
    return this.children.size === 0;
  }

  get fullPath(): string {
    const parts: string[] = [];
    let curr: ColumnDescriptor | null = this;
    while (curr.parent) {
      parts.push(curr.path);
      curr = curr.parent;
    }
    if (curr.path !== "$") {
      parts.push(curr.path);
    }
    return parts.reverse().join(".");
  }

  get isRequired(): boolean {
    return (
      !this.isRepeated &&
      this.parent !== null &&
      this.maxDefinitionLevel === this.parent.maxDefinitionLevel
    );
  }

  /**
   * Returns the treeLevel of the deepest ancestor from root to self whose
   * maxDefinitionLevel equals definitionLevel (Appendix B of Dremel paper).
   */
  fullDefinitionLevel(definitionLevel: number): number {
    for (const ancestor of getAncestors(this)) {
      if (ancestor.maxDefinitionLevel === definitionLevel) {
        return ancestor.treeLevel;
      }
    }
    throw new Error(
      `Definition level ${definitionLevel} not found in ancestors of ${this.toString()}`,
    );
  }

  /**
   * Returns the treeLevel to return to when repeating at repetitionLevel.
   *
   * For repetitionLevel === 0, returns 0. For repetitionLevel > 0, finds the
   * repeated ancestor that introduced repetitionLevel and returns its parent's
   * treeLevel so the repeating scope itself is closed before the next element.
   */
  fullRepetitionLevel(repetitionLevel: number): number {
    if (repetitionLevel === 0) {
      return 0;
    }
    if (repetitionLevel > 0) {
      for (const ancestor of getAncestors(this).reverse()) {
        if (ancestor.maxRepetitionLevel === repetitionLevel) {
          return ancestor.parent ? ancestor.parent.treeLevel : 0;
        }
      }
    }
    throw new Error(
      `Repetition level ${repetitionLevel} not found in ancestors of ${this.toString()}`,
    );
  }

  addChild(path: string, isRepeated = false): ColumnDescriptor {
    const existing = this.children.get(path);
    if (existing !== undefined) {
      if (existing.isRepeated !== isRepeated) {
        throw new Error(
          `Conflicting repetition for field '${existing.fullPath}': ` +
            `previously is_repeated=${existing.isRepeated}, ` +
            `got is_repeated=${isRepeated}`,
        );
      }
      return existing;
    }
    const child = new ColumnDescriptor(path, this);
    child.isRepeated = isRepeated;
    this.children.set(path, child);
    return child;
  }

  computeLevels(
    currentRepLevel = 0,
    currentDefLevel = 0,
    currentTreeLevel = 0,
  ): void {
    const newDefLevel = currentDefLevel + (this.parent !== null ? 1 : 0);
    let newRepLevel = currentRepLevel;
    if (this.isRepeated) {
      newRepLevel += 1;
    }

    this.maxRepetitionLevel = newRepLevel;
    this.maxDefinitionLevel = newDefLevel;
    this.treeLevel = currentTreeLevel;

    for (const child of this.children.values()) {
      child.computeLevels(newRepLevel, newDefLevel, currentTreeLevel + 1);
    }
  }

  equals(other: unknown): boolean {
    if (!(other instanceof ColumnDescriptor)) {
      return false;
    }
    if (
      this.path !== other.path ||
      this.fullPath !== other.fullPath ||
      this.maxRepetitionLevel !== other.maxRepetitionLevel ||
      this.maxDefinitionLevel !== other.maxDefinitionLevel ||
      this.treeLevel !== other.treeLevel ||
      this.isRepeated !== other.isRepeated ||
      this.children.size !== other.children.size
    ) {
      return false;
    }
    const thisEntries = Array.from(this.children.entries());
    const otherEntries = Array.from(other.children.entries());
    for (let i = 0; i < thisEntries.length; i++) {
      if (
        thisEntries[i][0] !== otherEntries[i][0] ||
        !thisEntries[i][1].equals(otherEntries[i][1])
      ) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    const childrenStr = Array.from(this.children.values())
      .map((c) => c.toString())
      .join(", ");
    return (
      `ColumnDescriptor(path='${this.path}', ` +
      `r=${this.maxRepetitionLevel}, ` +
      `d=${this.maxDefinitionLevel}, ` +
      `is_repeated=${this.isRepeated}, ` +
      `children=[${childrenStr}])`
    );
  }
}

/**
 * Looks up a ColumnDescriptor in a Map by reference identity first, then falls
 * back to structural equality (.equals) to match Python's __hash__/__eq__.
 */
export function findDescriptorEntry<V>(
  map: Map<ColumnDescriptor, V>,
  target: ColumnDescriptor,
): [ColumnDescriptor, V] | undefined {
  if (map.has(target)) {
    return [target, map.get(target)!];
  }
  for (const [key, val] of map.entries()) {
    if (key.equals(target)) {
      return [key, val];
    }
  }
  return undefined;
}

export function findDescriptorInMap<V>(
  map: Map<ColumnDescriptor, V>,
  target: ColumnDescriptor,
): V | undefined {
  return findDescriptorEntry(map, target)?.[1];
}

export function hasDescriptor(
  list: readonly ColumnDescriptor[],
  target: ColumnDescriptor,
): boolean {
  return list.some((d) => d === target || d.equals(target));
}

export function parseSchema(schemaPaths: string[]): ColumnDescriptor {
  if (!schemaPaths || schemaPaths.length === 0) {
    throw new Error("Schema must contain at least one path");
  }

  const root = new ColumnDescriptor("$");
  const definedLeaves = new Set<ColumnDescriptor>();

  for (const path of schemaPaths) {
    if (typeof path !== "string" || !path.trim()) {
      throw new Error(`Invalid empty schema path: ${JSON.stringify(path)}`);
    }

    const parts = path.split(".");
    let current = root;
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      if (!part) {
        throw new Error(`Empty field segment in schema path: '${path}'`);
      }

      let isRepeated = false;
      let name = part;
      if (part.endsWith("[*]")) {
        isRepeated = true;
        name = part.slice(0, -3);
      }

      if (!name || name.includes("[") || name.includes("]") || name === "$") {
        throw new Error(
          `Invalid field name '${part}' in schema path: '${path}'`,
        );
      }

      current = current.addChild(name, isRepeated);
      const isLast = idx === parts.length - 1;
      if (isLast) {
        if (current.children.size > 0 || definedLeaves.has(current)) {
          if (current.children.size > 0) {
            throw new Error(
              `Field '${current.fullPath}' cannot be both a leaf and a nested group`,
            );
          }
          throw new Error(`Duplicate schema path: '${path}'`);
        }
        definedLeaves.add(current);
      } else {
        if (definedLeaves.has(current)) {
          throw new Error(
            `Field '${current.fullPath}' cannot be both a leaf and a nested group`,
          );
        }
      }
    }
  }

  root.computeLevels();
  return root;
}
