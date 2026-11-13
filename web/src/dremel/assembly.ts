import { END, FsmGraph, FsmNode, FsmTransitions, makeFsm } from "./fsm";
import {
  ColumnDescriptor,
  commonAncestor,
  findDescriptorInMap,
  getAllNodes,
  getAncestors,
  getLeaves,
  hasDescriptor,
} from "./schema";
import { JsonObject, PrimitiveValue, ShreddedColumnMap, ShreddedTriple } from "./shred";

export class ColumnReader {
  descriptor: ColumnDescriptor;
  data: ShreddedTriple[];
  pos: number;

  constructor(descriptor: ColumnDescriptor, data: ShreddedTriple[]) {
    this.descriptor = descriptor;
    this.data = data;
    this.pos = 0;
  }

  hasNext(): boolean {
    return this.pos < this.data.length;
  }

  peek(): ShreddedTriple | null {
    if (this.hasNext()) {
      return this.data[this.pos];
    }
    return null;
  }

  next(): ShreddedTriple {
    if (!this.hasNext()) {
      throw new Error(
        `ColumnReader exhausted for '${this.descriptor.fullPath}'`,
      );
    }
    const result = this.data[this.pos];
    this.pos += 1;
    return result;
  }
}

export class StringBuilder {
  private _lines: string[] = [];

  append(text: string): void {
    this._lines.push(text);
  }

  toString(): string {
    return this._lines.join("\n");
  }
}

export abstract class ColumnAssembler {
  columnDescriptor: ColumnDescriptor;
  columnName: string;

  constructor(columnDescriptor: ColumnDescriptor) {
    this.columnDescriptor = columnDescriptor;
    this.columnName = columnDescriptor.path;
  }

  abstract begin(assembler: Assembler): void;
  abstract add(value: PrimitiveValue, assembler: Assembler): void;
  abstract end(assembler: Assembler): void;
}

export class JsonColumnAssembler extends ColumnAssembler {
  isLeaf: boolean;
  isRepeated: boolean;

  constructor(columnDescriptor: ColumnDescriptor) {
    super(columnDescriptor);
    this.isLeaf = columnDescriptor.isLeaf;
    this.isRepeated = columnDescriptor.isRepeated;
  }

  begin(assembler: Assembler): void {
    const top = assembler.stack[assembler.stack.length - 1];
    if (this.isLeaf) {
      if (this.isRepeated) {
        if (!(this.columnName in top)) {
          top[this.columnName] = [];
        }
      }
    } else {
      if (this.isRepeated) {
        if (!(this.columnName in top)) {
          top[this.columnName] = [];
        }
        const lst = top[this.columnName] as JsonObject[];
        const elem: JsonObject = {};
        lst.push(elem);
        assembler.stack.push(elem);
      } else {
        const group: JsonObject = {};
        top[this.columnName] = group;
        assembler.stack.push(group);
      }
    }
  }

  add(value: PrimitiveValue, assembler: Assembler): void {
    if (!this.isLeaf) {
      throw new Error(`Cannot add scalar to non-leaf '${this.columnName}'`);
    }
    const top = assembler.stack[assembler.stack.length - 1];
    if (this.isRepeated) {
      (top[this.columnName] as PrimitiveValue[]).push(value);
    } else {
      top[this.columnName] = value;
    }
  }

  end(assembler: Assembler): void {
    if (!this.isLeaf) {
      assembler.stack.pop();
    }
  }
}

export class TextColumnAssembler extends ColumnAssembler {
  stringBuilder: StringBuilder;
  fullPath: string;
  indentWidth: number;

  constructor(
    columnDescriptor: ColumnDescriptor,
    stringBuilder: StringBuilder,
  ) {
    super(columnDescriptor);
    this.stringBuilder = stringBuilder;
    this.fullPath = columnDescriptor.fullPath;
    this.indentWidth = columnDescriptor.treeLevel * 2;
  }

  private pad(width: number): string {
    return " ".repeat(width);
  }

  begin(_assembler: Assembler): void {
    this.stringBuilder.append(
      `${this.pad(this.indentWidth)}<begin ${this.fullPath}>`,
    );
  }

  add(value: PrimitiveValue, _assembler: Assembler): void {
    this.stringBuilder.append(
      `${this.pad(this.indentWidth + 2)}${this.fullPath}=${String(value)}`,
    );
  }

  end(_assembler: Assembler): void {
    this.stringBuilder.append(
      `${this.pad(this.indentWidth)}<end ${this.fullPath}>`,
    );
  }
}

export class Assembler {
  rootDescriptor: ColumnDescriptor;
  currentDescriptor: ColumnDescriptor;
  descriptorToAssembler: Map<ColumnDescriptor, ColumnAssembler>;
  buffer: JsonObject;
  stack: JsonObject[];
  descriptorOrders: Map<ColumnDescriptor, number>;

  constructor(
    rootDescriptor: ColumnDescriptor,
    descriptorToAssembler: Map<ColumnDescriptor, ColumnAssembler>,
  ) {
    this.rootDescriptor = rootDescriptor;
    this.currentDescriptor = rootDescriptor;
    this.descriptorToAssembler = descriptorToAssembler;

    this.buffer = {};
    this.stack = [this.buffer];

    this.descriptorOrders = new Map();
    getAllNodes(rootDescriptor).forEach((desc, i) => {
      this.descriptorOrders.set(desc, i);
    });
  }

  moveToLevel(newLevel: number, nextDescriptor: ColumnDescriptor): void {
    const ancestor = commonAncestor(this.currentDescriptor, nextDescriptor);
    const ancestorTreeLevel = ancestor ? ancestor.treeLevel : 0;

    this.returnToLevel(Math.min(ancestorTreeLevel, newLevel));

    const pathToRoot = getAncestors(nextDescriptor).reverse();

    while (this.currentDescriptor.treeLevel < newLevel) {
      this.currentDescriptor =
        pathToRoot[this.currentDescriptor.treeLevel + 1];
      const assembler = findDescriptorInMap(
        this.descriptorToAssembler,
        this.currentDescriptor,
      )!;
      assembler.begin(this);
    }
  }

  returnToLevel(newLevel: number): void {
    while (this.currentDescriptor.treeLevel > newLevel) {
      const assembler = findDescriptorInMap(
        this.descriptorToAssembler,
        this.currentDescriptor,
      )!;
      assembler.end(this);
      this.currentDescriptor = this.currentDescriptor.parent!;
    }
  }

  isRepeating(
    fromDesc: ColumnDescriptor,
    toDesc: ColumnDescriptor,
  ): boolean {
    const fromOrder = findDescriptorInMap(this.descriptorOrders, fromDesc)!;
    const toOrder = findDescriptorInMap(this.descriptorOrders, toDesc)!;
    return fromOrder >= toOrder;
  }
}

export type AssemblerFactory = (desc: ColumnDescriptor) => ColumnAssembler;

function assembleSingleRecord(
  fsm: FsmGraph,
  rootDescriptor: ColumnDescriptor,
  descriptors: ColumnDescriptor[],
  descriptorToReader: Map<ColumnDescriptor, ColumnReader>,
  descriptorToAssembler: Map<ColumnDescriptor, ColumnAssembler>,
): JsonObject {
  let descriptor: FsmNode = descriptors[0];
  const assembler = new Assembler(rootDescriptor, descriptorToAssembler);

  while (descriptor !== END) {
    const reader: ColumnReader = findDescriptorInMap(descriptorToReader, descriptor)!;
    const [value, _r, d] = reader.next();

    const hasNonNullValue =
      d === descriptor.maxDefinitionLevel && value !== null;

    if (hasNonNullValue) {
      assembler.moveToLevel(descriptor.treeLevel, descriptor);
      const columnAssembler = findDescriptorInMap(
        descriptorToAssembler,
        descriptor,
      )!;
      columnAssembler.add(value, assembler);
    } else {
      assembler.moveToLevel(descriptor.fullDefinitionLevel(d), descriptor);
    }

    const nextRepetitionLevel: number = reader.hasNext() ? reader.peek()![1] : 0;
    const transitions: FsmTransitions = findDescriptorInMap(fsm, descriptor)!;
    const nextDescriptor: FsmNode = transitions.get(nextRepetitionLevel)!;

    if (
      nextDescriptor !== END &&
      assembler.isRepeating(descriptor, nextDescriptor)
    ) {
      assembler.returnToLevel(
        descriptor.fullRepetitionLevel(nextRepetitionLevel),
      );
    }

    descriptor = nextDescriptor;
  }

  assembler.returnToLevel(0);

  return assembler.buffer;
}

export function assembleRecords(
  rootDescriptor: ColumnDescriptor,
  columnData: ShreddedColumnMap,
  options?: {
    assemblerFactory?: AssemblerFactory;
    selection?: Iterable<ColumnDescriptor> | null;
  },
): JsonObject[] {
  if (rootDescriptor.isLeaf) {
    throw new Error("Schema must contain at least one field");
  }

  const assemblerFactory: AssemblerFactory =
    options?.assemblerFactory ?? ((desc) => new JsonColumnAssembler(desc));
  const selection = options?.selection ?? null;

  const allDescriptors = getAllNodes(rootDescriptor);
  const allLeaves = getLeaves(rootDescriptor);

  let fsm: FsmGraph;
  let leafDescriptors: ColumnDescriptor[];

  if (selection !== null) {
    const selectionList = Array.from(selection);
    fsm = makeFsm(rootDescriptor, selectionList);
    leafDescriptors = allLeaves.filter((d) => hasDescriptor(selectionList, d));
  } else {
    fsm = makeFsm(rootDescriptor);
    leafDescriptors = allLeaves;
  }

  const descriptorToReader = new Map<ColumnDescriptor, ColumnReader>();
  for (const desc of leafDescriptors) {
    const data = findDescriptorInMap(columnData, desc);
    if (data === undefined) {
      throw new Error(`Missing column data for '${desc.fullPath}'`);
    }
    descriptorToReader.set(desc, new ColumnReader(desc, data));
  }

  const descriptorToAssembler = new Map<ColumnDescriptor, ColumnAssembler>();
  for (const desc of allDescriptors) {
    descriptorToAssembler.set(desc, assemblerFactory(desc));
  }

  const firstReader = descriptorToReader.get(leafDescriptors[0])!;
  const records: JsonObject[] = [];

  while (firstReader.hasNext()) {
    const record = assembleSingleRecord(
      fsm,
      rootDescriptor,
      leafDescriptors,
      descriptorToReader,
      descriptorToAssembler,
    );
    records.push(record);
  }

  for (const [desc, reader] of descriptorToReader.entries()) {
    if (reader.hasNext()) {
      throw new Error(
        `Unconsumed data remaining in column '${desc.fullPath}'`,
      );
    }
  }

  return records;
}

export interface AssemblyTraceStep {
  stepIndex: number;
  recordIndex: number;
  columnPath: string;
  rowIndexInColumn: number;
  triple: ShreddedTriple;
  isNonNullValue: boolean;
  nextRepetitionLevel: number;
  nextColumnPath: string | "END";
  events: string[];
  recordSnapshot: JsonObject;
}

export interface AssemblyTrace {
  steps: AssemblyTraceStep[];
  records: JsonObject[];
}

class RecordingColumnAssembler extends ColumnAssembler {
  private jsonAssembler: JsonColumnAssembler;
  private fullPath: string;
  private eventLog: string[];

  constructor(desc: ColumnDescriptor, eventLog: string[]) {
    super(desc);
    this.jsonAssembler = new JsonColumnAssembler(desc);
    this.fullPath = desc.fullPath;
    this.eventLog = eventLog;
  }

  begin(assembler: Assembler): void {
    this.eventLog.push(`<begin ${this.fullPath}>`);
    this.jsonAssembler.begin(assembler);
  }

  add(value: PrimitiveValue, assembler: Assembler): void {
    this.eventLog.push(`${this.fullPath}=${JSON.stringify(value)}`);
    this.jsonAssembler.add(value, assembler);
  }

  end(assembler: Assembler): void {
    this.eventLog.push(`<end ${this.fullPath}>`);
    this.jsonAssembler.end(assembler);
  }
}

export function traceAssembly(
  rootDescriptor: ColumnDescriptor,
  columnData: ShreddedColumnMap,
  selection?: Iterable<ColumnDescriptor> | null,
): AssemblyTrace {
  if (rootDescriptor.isLeaf) {
    throw new Error("Schema must contain at least one field");
  }

  const allDescriptors = getAllNodes(rootDescriptor);
  const allLeaves = getLeaves(rootDescriptor);
  const selectionList = selection ? Array.from(selection) : null;
  const fsm = selectionList
    ? makeFsm(rootDescriptor, selectionList)
    : makeFsm(rootDescriptor);
  const leafDescriptors = selectionList
    ? allLeaves.filter((d) => hasDescriptor(selectionList, d))
    : allLeaves;

  const descriptorToReader = new Map<ColumnDescriptor, ColumnReader>();
  for (const desc of leafDescriptors) {
    const data = findDescriptorInMap(columnData, desc);
    if (data === undefined) {
      throw new Error(`Missing column data for '${desc.fullPath}'`);
    }
    descriptorToReader.set(desc, new ColumnReader(desc, data));
  }

  const eventLog: string[] = [];
  const descriptorToAssembler = new Map<ColumnDescriptor, ColumnAssembler>();
  for (const desc of allDescriptors) {
    descriptorToAssembler.set(
      desc,
      new RecordingColumnAssembler(desc, eventLog),
    );
  }

  const firstReader = descriptorToReader.get(leafDescriptors[0])!;
  const steps: AssemblyTraceStep[] = [];
  const records: JsonObject[] = [];
  let recordIndex = 0;

  while (firstReader.hasNext()) {
    let descriptor: FsmNode = leafDescriptors[0];
    const assembler = new Assembler(rootDescriptor, descriptorToAssembler);

    while (descriptor !== END) {
      const reader: ColumnReader = findDescriptorInMap(descriptorToReader, descriptor)!;
      const rowIndexInColumn = reader.pos;
      const triple = reader.next();
      const [value, _r, d] = triple;

      eventLog.length = 0;
      const isNonNullValue =
        d === descriptor.maxDefinitionLevel && value !== null;

      if (isNonNullValue) {
        assembler.moveToLevel(descriptor.treeLevel, descriptor);
        const colAssembler = findDescriptorInMap(
          descriptorToAssembler,
          descriptor,
        )!;
        colAssembler.add(value, assembler);
      } else {
        assembler.moveToLevel(descriptor.fullDefinitionLevel(d), descriptor);
      }

      const nextRepetitionLevel: number = reader.hasNext() ? reader.peek()![1] : 0;
      const transitions: FsmTransitions = findDescriptorInMap(fsm, descriptor)!;
      const nextDescriptor: FsmNode = transitions.get(nextRepetitionLevel)!;

      if (
        nextDescriptor !== END &&
        assembler.isRepeating(descriptor, nextDescriptor)
      ) {
        assembler.returnToLevel(
          descriptor.fullRepetitionLevel(nextRepetitionLevel),
        );
      }

      if (nextDescriptor === END) {
        assembler.returnToLevel(0);
      }

      steps.push({
        stepIndex: steps.length,
        recordIndex,
        columnPath: descriptor.fullPath,
        rowIndexInColumn,
        triple,
        isNonNullValue,
        nextRepetitionLevel,
        nextColumnPath:
          nextDescriptor === END ? "END" : nextDescriptor.fullPath,
        events: [...eventLog],
        recordSnapshot: structuredClone(assembler.buffer),
      });

      descriptor = nextDescriptor;
    }

    records.push(assembler.buffer);
    recordIndex += 1;
  }

  for (const [desc, reader] of descriptorToReader.entries()) {
    if (reader.hasNext()) {
      throw new Error(
        `Unconsumed data remaining in column '${desc.fullPath}'`,
      );
    }
  }

  return { steps, records };
}
