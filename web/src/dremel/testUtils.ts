import { ColumnDescriptor } from "./schema";

function updateTreeLevels(desc: ColumnDescriptor, level = 0): void {
  desc.treeLevel = level;
  for (const child of desc.children.values()) {
    updateTreeLevels(child, level + 1);
  }
}

export function mkDesc(
  path: string,
  r: number,
  d: number,
  options?: { isRepeated?: boolean; children?: ColumnDescriptor[] },
): ColumnDescriptor {
  const desc = new ColumnDescriptor(path, null, r, d);
  desc.isRepeated = options?.isRepeated ?? false;
  if (options?.children) {
    for (const child of options.children) {
      desc.children.set(child.path, child);
      child.parent = desc;
    }
  }
  updateTreeLevels(desc, desc.parent === null ? 0 : desc.parent.treeLevel + 1);
  return desc;
}

export function getDesc(
  schema: ColumnDescriptor,
  path: string,
): ColumnDescriptor {
  let curr = schema;
  const parts = path.split(".");
  for (let part of parts) {
    if (part.endsWith("[*]")) {
      part = part.slice(0, -3);
    }
    const child = curr.children.get(part);
    if (!child) {
      throw new Error(`Path segment '${part}' not found under '${curr.fullPath}'`);
    }
    curr = child;
  }
  return curr;
}
