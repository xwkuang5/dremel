import collections


class FieldWriter:
    def __init__(self, descriptor):
        self.descriptor = descriptor
        self.children = collections.OrderedDict()
        self.data = []  # List of (value, r, d)

        for name, child_desc in descriptor.children.items():
            self.children[name] = FieldWriter(child_desc)

    @property
    def name(self):
        return self.descriptor.path

    @property
    def is_repeated(self):
        return self.descriptor.is_repeated

    @property
    def max_repetition_level(self):
        return self.descriptor.max_repetition_level

    @property
    def max_definition_level(self):
        return self.descriptor.max_definition_level

    def get_child(self, name):
        return self.children.get(name)

    def is_leaf(self):
        return len(self.children) == 0

    def write(self, value, r, d):
        self.data.append((value, r, d))


class RecordDecoder:
    def __init__(self, record, definition_level):
        self.record = record
        self.definition_level = definition_level
        self.iterator = None
        self._prepare_iterator()

    def _prepare_iterator(self):
        if self.record is None:
            self.iterator = iter([])
            return

        if isinstance(self.record, dict):
            # Generator to yield (key, value)
            self.iterator = iter(self.record.items())
        else:
            self.iterator = iter([])

    def has_next(self):
        if hasattr(self, '_next_item'):
            return True
        try:
            self._next_item = next(self.iterator)
            return True
        except StopIteration:
            return False

    def next(self):
        if hasattr(self, '_next_item'):
            item = self._next_item
            del self._next_item
            return item
        return next(self.iterator)


def dissect_record(decoder, writer, repetition_level):
    """
    Dissects a record into a set of columns.

    Current limitations:
    - Does not differentiate between null and missing, i.e., can not
      differentiate an empty sub-record from one which has all its sub-fields
      set to null
    - Eagerly writes all leaves (i.e., not sparse)
    """
    seen_fields = set()

    while decoder.has_next():
        field, value = decoder.next()

        child_writer = writer.get_child(field)
        if not child_writer:
            continue

        definition_level = decoder.definition_level + 1

        if child_writer.is_repeated:
            if not isinstance(value, list):
                raise ValueError(
                    f"Field '{field}' is repeated, expected list, found {
                        type(value).__name__}: {value}")

            # If the list is empty, we treat it as if the field was missing
            # (i.e. we don't add it to seen_fields, so the cleanup loop
            # will write the appropriate nulls).
            if value:
                seen_fields.add(field)

            for i, item in enumerate(value):
                # the first item inherits the repetition level of its parent;
                # the rest starts to repeat at the repetition level of the
                # field
                child_repetition_level = repetition_level if i == 0 else child_writer.max_repetition_level

                if child_writer.is_leaf():
                    child_writer.write(item, child_repetition_level,
                                       definition_level)
                else:
                    dissect_record(
                        RecordDecoder(
                            item,
                            definition_level),
                        child_writer,
                        child_repetition_level)

        else:
            if isinstance(value, list):
                raise ValueError(
                    f"Field '{field}' is not repeated, expected single value, found list: {value}")

            # If value is None, treat as missing
            if value is None:
                continue

            if not child_writer.is_leaf() and not isinstance(value, dict):
                raise ValueError(
                    f"Field '{field}' is a nested group, expected dict, found {
                        type(value).__name__}: {value}")

            seen_fields.add(field)
            if child_writer.is_leaf():
                child_writer.write(value, repetition_level,
                                   definition_level)
            else:
                dissect_record(
                    RecordDecoder(
                        value,
                        definition_level),
                    child_writer,
                    repetition_level)

    # recursively write nulls at decoder.definition_level
    for field, child_writer in writer.children.items():
        if field not in seen_fields:
            if child_writer.is_leaf():
                child_writer.write(None, repetition_level,
                                   decoder.definition_level)
            else:
                new_dec = RecordDecoder(None, decoder.definition_level)
                dissect_record(new_dec, child_writer, repetition_level)


def shred_records(root_descriptor, records):
    root = FieldWriter(root_descriptor)
    for record in records:
        decoder = RecordDecoder(record, definition_level=0)
        dissect_record(decoder, root, repetition_level=0)

    output = {}

    def collect(node):
        if node.is_leaf():
            output[node.descriptor] = node.data

        for child in node.children.values():
            collect(child)

    for child in root.children.values():
        collect(child)

    return output
