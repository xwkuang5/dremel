import abc

from fsm import END, make_fsm
from schema import common_ancestor, get_all_nodes, get_ancestors, get_leaves


class ColumnReader:
    def __init__(self, descriptor, data):
        self.descriptor = descriptor
        self.data = data
        self.pos = 0

    def has_next(self):
        return self.pos < len(self.data)

    def peek(self):
        if self.has_next():
            return self.data[self.pos]
        return None

    def next(self):
        assert self.has_next()
        result = self.data[self.pos]
        self.pos += 1
        return result


class StringBuilder:
    def __init__(self):
        self._lines = []

    def append(self, text):
        self._lines.append(text)

    def __str__(self):
        return "\n".join(self._lines)


class ColumnAssembler(abc.ABC):
    def __init__(self, column_descriptor):
        self.column_descriptor = column_descriptor
        self.column_name = column_descriptor.path

    @abc.abstractmethod
    def begin(self, assembler):
        pass

    @abc.abstractmethod
    def add(self, value, assembler):
        pass

    @abc.abstractmethod
    def end(self, assembler):
        pass


class JsonColumnAssembler(ColumnAssembler):
    def __init__(self, column_descriptor):
        super().__init__(column_descriptor)
        self.is_leaf = column_descriptor.is_leaf
        self.is_repeated = column_descriptor.is_repeated

    def begin(self, assembler):
        if self.is_leaf:
            if self.is_repeated:
                assembler.stack[-1].setdefault(self.column_name, [])
        else:
            if self.is_repeated:
                lst = assembler.stack[-1].setdefault(self.column_name, [])
                elem = {}
                lst.append(elem)
                assembler.stack.append(elem)
            else:
                group = {}
                assembler.stack[-1][self.column_name] = group
                assembler.stack.append(group)

    def add(self, value, assembler):
        assert self.is_leaf
        if self.is_repeated:
            assembler.stack[-1][self.column_name].append(value)
        else:
            assembler.stack[-1][self.column_name] = value

    def end(self, assembler):
        if not self.is_leaf:
            assembler.stack.pop()


class TextColumnAssembler(ColumnAssembler):
    def __init__(self, column_descriptor, string_builder):
        super().__init__(column_descriptor)
        self.string_builder = string_builder
        self.full_path = column_descriptor.full_path
        self.indent_width = column_descriptor.tree_level * 2

    def begin(self, assembler):
        self.string_builder.append(f"{'':>{self.indent_width}}<begin {self.full_path}>")

    def add(self, value, assembler):
        self.string_builder.append(
            f"{'':>{self.indent_width + 2}}{self.full_path}={value}"
        )

    def end(self, assembler):
        self.string_builder.append(f"{'':>{self.indent_width}}<end {self.full_path}>")


class Assembler:
    def __init__(self, root_descriptor, descriptor_to_assembler):
        self.root_descriptor = root_descriptor
        self.current_descriptor = root_descriptor
        self.descriptor_to_assembler = descriptor_to_assembler

        self.buffer = {}
        self.stack = [self.buffer]

        self.descriptor_orders = {
            desc: i for i, desc in enumerate(get_all_nodes(root_descriptor))
        }

    def move_to_level(self, new_level, next_descriptor):
        ancestor = common_ancestor(self.current_descriptor, next_descriptor)

        self.return_to_level(min(ancestor.tree_level, new_level))

        path_to_root = list(get_ancestors(next_descriptor))[::-1]

        while self.current_descriptor.tree_level < new_level:
            self.current_descriptor = path_to_root[
                self.current_descriptor.tree_level + 1
            ]
            assembler = self.descriptor_to_assembler[self.current_descriptor]
            assembler.begin(self)

    def return_to_level(self, new_level):
        while self.current_descriptor.tree_level > new_level:
            assembler = self.descriptor_to_assembler[self.current_descriptor]
            assembler.end(self)
            self.current_descriptor = self.current_descriptor.parent

    def is_repeating(self, from_desc, to_desc):
        return self.descriptor_orders[from_desc] >= self.descriptor_orders[to_desc]


def _assemble_record(
    fsm, root_descriptor, descriptors, descriptor_to_reader, descriptor_to_assembler
):
    descriptor = descriptors[0]
    assembler = Assembler(root_descriptor, descriptor_to_assembler)

    while descriptor != END:
        reader = descriptor_to_reader[descriptor]
        (value, r, d) = reader.next()

        has_non_null_value = d == descriptor.max_definition_level and value is not None

        if has_non_null_value:
            assembler.move_to_level(descriptor.tree_level, descriptor)
            column_assembler = descriptor_to_assembler[descriptor]
            column_assembler.add(value, assembler)
        else:
            assembler.move_to_level(descriptor.full_definition_level(d), descriptor)

        next_repetition_level = reader.peek()[1] if reader.has_next() else 0

        next_descriptor = fsm[descriptor][next_repetition_level]

        if next_descriptor != END and assembler.is_repeating(
            descriptor, next_descriptor
        ):
            assembler.return_to_level(
                descriptor.full_repetition_level(next_repetition_level)
            )

        descriptor = next_descriptor

    assembler.return_to_level(0)

    return assembler.buffer


def assemble_records(
    root_descriptor,
    column_data,
    assembler_factory=JsonColumnAssembler,
    selection=None,
):
    """
    Assembles records from columnar data using the Dremel assembly algorithm.

    Args:
        root_descriptor: The root ColumnDescriptor of the schema.
        column_data: A dictionary mapping ColumnDescriptor objects to lists of
            (value, r, d) tuples.
        assembler_factory: A callable that takes a ColumnDescriptor and returns
            a ColumnAssembler.
        selection: Optional iterable of leaf ColumnDescriptor objects to project.
            Defaults to all leaves in the schema.

    Returns:
        A list of assembled records (dicts).
    """
    if root_descriptor.is_leaf:
        raise ValueError("Schema must contain at least one field")

    all_descriptors = list(get_all_nodes(root_descriptor))
    all_leaves = list(get_leaves(root_descriptor))

    if selection is not None:
        fsm = make_fsm(root_descriptor, selection=selection)
        selection_set = set(selection)
        leaf_descriptors = [d for d in all_leaves if d in selection_set]
    else:
        fsm = make_fsm(root_descriptor)
        leaf_descriptors = all_leaves

    for desc in leaf_descriptors:
        if desc not in column_data:
            raise ValueError(f"Missing column data for '{desc.full_path}'")

    descriptor_to_reader = {
        desc: ColumnReader(desc, column_data[desc]) for desc in leaf_descriptors
    }

    descriptor_to_assembler = {
        desc: assembler_factory(desc) for desc in all_descriptors
    }

    first_reader = descriptor_to_reader[leaf_descriptors[0]]

    records = []
    while first_reader.has_next():
        record = _assemble_record(
            fsm,
            root_descriptor,
            leaf_descriptors,
            descriptor_to_reader,
            descriptor_to_assembler,
        )
        records.append(record)

    for desc, reader in descriptor_to_reader.items():
        if reader.has_next():
            raise ValueError(f"Unconsumed data remaining in column '{desc.full_path}'")

    return records
