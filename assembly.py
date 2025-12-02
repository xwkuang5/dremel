import collections
from fsm import make_fsm, END
from schema import get_all_nodes, get_leaves, get_ancestors, common_ancestor


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


def _calculate_is_first_in_repetition(column_descriptor):
    if column_descriptor.parent is None:
        return False
    if not column_descriptor.parent.is_repeated:
        return False
    first_child = next(iter(column_descriptor.parent.children.values()))
    return column_descriptor == first_child


def _calculate_is_last_in_repetition(column_descriptor):
    if column_descriptor.parent is None:
        return False
    if not column_descriptor.parent.is_repeated:
        return False
    last_child = next(reversed(column_descriptor.parent.children.values()))
    return column_descriptor == last_child


class ColumnAssembler:
    def __init__(self, column_descriptor):
        self.column_descriptor = column_descriptor
        self.is_leaf = column_descriptor.is_leaf
        self.is_repeated = column_descriptor.is_repeated
        self.column_name = column_descriptor.path
        self.is_first_in_repetition = _calculate_is_first_in_repetition(
            column_descriptor)
        self.is_last_in_repetition = _calculate_is_last_in_repetition(
            column_descriptor)

        self.last_buffer = None
        self.last_repeated_buffer = None

    def begin(self, assembler):
        # Remember the current buffer so that we can backtrack on end()
        self.last_repeated_buffer = assembler.repeated_buffer

        if self.is_first_in_repetition:
            buffer = {}
            assembler.buffer.append(buffer)
            assembler.buffer = buffer

        self.last_buffer = assembler.buffer

        if self.is_leaf:
            if self.is_repeated:
                assembler.buffer[self.column_name] = []
                assembler.buffer = assembler.buffer[self.column_name]
        else:
            if self.is_repeated:
                buffer = []
                assembler.buffer[self.column_name] = buffer
                assembler.buffer = buffer
                assembler.repeated_buffer = buffer
            else:
                assembler.buffer[self.column_name] = {}
                assembler.buffer = assembler.buffer[self.column_name]

    def add(self, value, assembler):
        assert self.is_leaf
        if self.is_repeated:
            assembler.buffer.append(value)
        else:
            assembler.buffer[self.column_name] = value

    def end(self, assembler):
        if self.is_last_in_repetition:
            # If the buffer is empty, we know that it was created when setting
            # up scopes for NULL values. So we can remove them from the built
            # record.
            if isinstance(
                    assembler.buffer, dict) and len(
                    assembler.buffer) == 0:
                assembler.repeated_buffer.pop()
            assembler.buffer = assembler.repeated_buffer
        else:
            assembler.buffer = self.last_buffer

        assembler.repeated_buffer = self.last_repeated_buffer


class Assembler:
    def __init__(self, root_descriptor, descriptor_to_assembler):
        self.root_descriptor = root_descriptor
        self.current_descriptor = root_descriptor
        self.descriptor_to_assembler = descriptor_to_assembler

        self.buffer = {}
        # Buffer set up by a repeated non-leaf field for its last child to
        # resume from
        self.repeated_buffer = None

        self.descriptor_orders = {
            desc: i for i, desc in enumerate(
                get_all_nodes(root_descriptor))}

    def move_to_level(self, new_level, next_descriptor):

        ancestor = common_ancestor(self.current_descriptor, next_descriptor)

        self.return_to_level(ancestor.max_definition_level)

        path_to_root = list(get_ancestors(next_descriptor))[::-1]

        while self.current_descriptor.max_definition_level < new_level:
            self.current_descriptor = path_to_root[self.current_descriptor.max_definition_level + 1]
            assembler = self.descriptor_to_assembler[self.current_descriptor]
            assembler.begin(self)

    def return_to_level(self, new_level):
        while self.current_descriptor.max_definition_level > new_level:
            assembler = self.descriptor_to_assembler[self.current_descriptor]
            assembler.end(self)
            self.current_descriptor = self.current_descriptor.parent

    def is_repeating(self, from_desc, to_desc):
        return self.descriptor_orders[from_desc] >= self.descriptor_orders[to_desc]


def _assemble_record(
        fsm,
        root_descriptor,
        descriptors,
        descriptor_to_reader,
        descriptor_to_assembler):

    descriptor = descriptors[0]
    assembler = Assembler(root_descriptor, descriptor_to_assembler)

    while descriptor != END:
        # NOTE: we can not simply move this line to within the null guard below
        # otherwise we may pack unrelated values into the same record.
        assembler.move_to_level(descriptor.max_definition_level, descriptor)

        reader = descriptor_to_reader[descriptor]
        (value, r, d) = reader.next()

        has_non_null_value = d == descriptor.max_definition_level

        if has_non_null_value:
            column_assembler = descriptor_to_assembler[descriptor]
            column_assembler.add(value, assembler)

        next_repetition_level = reader.peek()[1] if reader.has_next() else 0

        next_descriptor = fsm[descriptor][next_repetition_level]

        if next_descriptor is not END and assembler.is_repeating(
                descriptor, next_descriptor):
            assembler.return_to_level(
                descriptor.full_repetition_level(next_repetition_level))

        descriptor = next_descriptor

    assembler.return_to_level(0)

    return assembler.buffer


def assemble_records(root_descriptor, column_data):
    """
    Assembles records from columnar data using the Dremel assembly algorithm.

    Args:
        root_descriptor: The root ColumnDescriptor of the schema.
        column_data: A dictionary mapping ColumnDescriptor objects to lists of (value, r, d) tuples.

    Returns:
        A list of assembled records (dicts).
    """
    fsm = make_fsm(root_descriptor)

    all_descriptors = list(get_all_nodes(root_descriptor))

    leaf_descriptors = list(get_leaves(root_descriptor))

    descriptor_to_reader = {desc: ColumnReader(
        desc, column_data[desc]) for desc in leaf_descriptors}

    descriptor_to_assembler = {desc: ColumnAssembler(
        desc) for desc in all_descriptors}

    first_reader = descriptor_to_reader[leaf_descriptors[0]]

    records = []
    while first_reader.has_next():
        record = _assemble_record(
            fsm,
            root_descriptor,
            leaf_descriptors,
            descriptor_to_reader,
            descriptor_to_assembler)
        records.append(record)

    return records
