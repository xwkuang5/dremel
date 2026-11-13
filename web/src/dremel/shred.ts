import { ColumnDescriptor } from "./schema";

export type PrimitiveValue = string | number | boolean;
export type JsonValue = PrimitiveValue | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };
export type ShreddedTriple = readonly [
  value: PrimitiveValue | null,
  r: number,
  d: number,
];
export type ShreddedColumnMap = Map<ColumnDescriptor, ShreddedTriple[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function describeType(value: unknown): string {
  if (value === null) return "NoneType";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "dict";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  return typeof value;
}

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

class FieldWriter {
  descriptor: ColumnDescriptor;
  children: Map<string, FieldWriter>;
  data: ShreddedTriple[];

  constructor(descriptor: ColumnDescriptor) {
    this.descriptor = descriptor;
    this.children = new Map<string, FieldWriter>();
    this.data = [];

    for (const [name, childDesc] of descriptor.children.entries()) {
      this.children.set(name, new FieldWriter(childDesc));
    }
  }

  get name(): string {
    return this.descriptor.path;
  }

  get isRepeated(): boolean {
    return this.descriptor.isRepeated;
  }

  get isRequired(): boolean {
    return (
      !this.isRepeated &&
      this.descriptor.parent !== null &&
      this.maxDefinitionLevel === this.descriptor.parent.maxDefinitionLevel
    );
  }

  get maxRepetitionLevel(): number {
    return this.descriptor.maxRepetitionLevel;
  }

  get maxDefinitionLevel(): number {
    return this.descriptor.maxDefinitionLevel;
  }

  getChild(name: string): FieldWriter | undefined {
    return this.children.get(name);
  }

  isLeaf(): boolean {
    return this.children.size === 0;
  }

  write(value: PrimitiveValue | null, r: number, d: number): void {
    this.data.push([value, r, d]);
  }
}

class RecordDecoder {
  record: Record<string, unknown> | null;
  definitionLevel: number;
  private entries: [string, unknown][];
  private index: number;

  constructor(record: unknown, definitionLevel: number) {
    this.record = null;
    this.definitionLevel = definitionLevel;
    this.entries = [];
    this.index = 0;

    if (record === null || record === undefined) {
      this.record = null;
      return;
    }

    if (isPlainObject(record)) {
      this.record = record;
      this.entries = Object.entries(record);
    } else {
      const valType = describeType(record);
      throw new Error(
        `Expected dict for record, found ${valType}: ${formatValue(record)}`,
      );
    }
  }

  hasNext(): boolean {
    return this.index < this.entries.length;
  }

  next(): [string, unknown] {
    const item = this.entries[this.index];
    this.index += 1;
    return item;
  }
}

/**
 * Dissects a record into a set of columns.
 *
 * Current limitations:
 * - Does not differentiate an empty sub-record `{}` from one whose sub-fields
 *   are all explicitly set to `null` (matches Protocol Buffers semantics)
 * - Eagerly writes all leaves (i.e., not sparse via writer versions)
 */
function dissectRecord(
  decoder: RecordDecoder,
  writer: FieldWriter,
  repetitionLevel: number,
): void {
  const seenFields = new Set<string>();

  while (decoder.hasNext()) {
    const [field, value] = decoder.next();

    const childWriter = writer.getChild(field);
    if (!childWriter) {
      continue;
    }

    const definitionLevel =
      decoder.definitionLevel + (childWriter.isRequired ? 0 : 1);

    if (childWriter.isRepeated) {
      if (value === null || value === undefined) {
        continue;
      }

      if (!Array.isArray(value)) {
        const valType = describeType(value);
        throw new Error(
          `Field '${field}' is repeated, expected list, found ${valType}: ${formatValue(value)}`,
        );
      }

      // If the list is empty, treat it as if the field was missing
      // (i.e. don't add to seenFields so cleanup writes the appropriate nulls).
      if (value.length > 0) {
        seenFields.add(field);
      }

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        // The first item inherits the repetition level of its parent;
        // subsequent items repeat at the repetition level of the field.
        const childRepetitionLevel =
          i === 0 ? repetitionLevel : childWriter.maxRepetitionLevel;

        if (childWriter.isLeaf()) {
          if (item === null || item === undefined) {
            throw new Error(
              `Repeated field '${field}' cannot contain None values`,
            );
          }
          if (Array.isArray(item) || isPlainObject(item)) {
            const itemType = describeType(item);
            throw new Error(
              `Repeated leaf field '${field}' expected primitive value, found ${itemType}: ${formatValue(item)}`,
            );
          }
          childWriter.write(
            item as PrimitiveValue,
            childRepetitionLevel,
            definitionLevel,
          );
        } else {
          if (!isPlainObject(item)) {
            const itemType = describeType(item);
            throw new Error(
              `Field '${field}' is a repeated group, expected dict elements, found ${itemType}: ${formatValue(item)}`,
            );
          }
          dissectRecord(
            new RecordDecoder(item, definitionLevel),
            childWriter,
            childRepetitionLevel,
          );
        }
      }
    } else {
      if (Array.isArray(value)) {
        throw new Error(
          `Field '${field}' is not repeated, expected single value, found list: ${formatValue(value)}`,
        );
      }

      // If value is null/undefined, treat as missing (unless required)
      if (value === null || value === undefined) {
        if (childWriter.isRequired) {
          throw new Error(`Required field '${field}' cannot be None`);
        }
        continue;
      }

      if (childWriter.isLeaf()) {
        if (isPlainObject(value)) {
          const valType = describeType(value);
          throw new Error(
            `Field '${field}' is a primitive leaf, expected scalar value, found ${valType}: ${formatValue(value)}`,
          );
        }
        seenFields.add(field);
        childWriter.write(
          value as PrimitiveValue,
          repetitionLevel,
          definitionLevel,
        );
      } else {
        if (!isPlainObject(value)) {
          const valType = describeType(value);
          throw new Error(
            `Field '${field}' is a nested group, expected dict, found ${valType}: ${formatValue(value)}`,
          );
        }
        seenFields.add(field);
        dissectRecord(
          new RecordDecoder(value, definitionLevel),
          childWriter,
          repetitionLevel,
        );
      }
    }
  }

  // Recursively write nulls at decoder.definitionLevel
  for (const [field, childWriter] of writer.children.entries()) {
    if (!seenFields.has(field)) {
      if (childWriter.isRequired && decoder.record !== null) {
        throw new Error(`Required field '${field}' is missing`);
      }
      if (childWriter.isLeaf()) {
        childWriter.write(null, repetitionLevel, decoder.definitionLevel);
      } else {
        const newDec = new RecordDecoder(null, decoder.definitionLevel);
        dissectRecord(newDec, childWriter, repetitionLevel);
      }
    }
  }
}

export function shredRecords(
  rootDescriptor: ColumnDescriptor | null | undefined,
  records: unknown,
): ShreddedColumnMap {
  if (!rootDescriptor || rootDescriptor.isLeaf) {
    throw new Error("Schema must contain at least one field");
  }

  if (!Array.isArray(records)) {
    const valType = describeType(records);
    throw new Error(
      `Expected list of records, found ${valType}: ${formatValue(records)}`,
    );
  }

  const root = new FieldWriter(rootDescriptor);
  for (const record of records) {
    if (!isPlainObject(record)) {
      const valType = describeType(record);
      throw new Error(
        `Expected dict for record, found ${valType}: ${formatValue(record)}`,
      );
    }
    const decoder = new RecordDecoder(record, 0);
    dissectRecord(decoder, root, 0);
  }

  const output: ShreddedColumnMap = new Map();

  function collect(node: FieldWriter): void {
    if (node.isLeaf()) {
      output.set(node.descriptor, node.data);
    }
    for (const child of node.children.values()) {
      collect(child);
    }
  }

  for (const child of root.children.values()) {
    collect(child);
  }

  return output;
}
