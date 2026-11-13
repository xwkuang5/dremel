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
    def is_required(self):
        return (
            not self.is_repeated
            and self.descriptor.parent is not None
            and self.max_definition_level == self.descriptor.parent.max_definition_level
        )

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
            val_type = type(self.record).__name__
            raise ValueError(
                f"Expected dict for record, found {val_type}: {self.record}"
            )

    def has_next(self):
        if hasattr(self, "_next_item"):
            return True
        try:
            self._next_item = next(self.iterator)
            return True
        except StopIteration:
            return False

    def next(self):
        if hasattr(self, "_next_item"):
            item = self._next_item
            del self._next_item
            return item
        return next(self.iterator)


def dissect_record(decoder, writer, repetition_level):
    """
    Dissects a record into a set of columns.

    Current limitations:
    - Does not differentiate an empty sub-record `{}` from one whose sub-fields
      are all explicitly set to `None` (matches Protocol Buffers semantics)
    - Eagerly writes all leaves (i.e., not sparse via writer versions)
    """
    seen_fields = set()

    while decoder.has_next():
        field, value = decoder.next()

        child_writer = writer.get_child(field)
        if not child_writer:
            continue

        definition_level = decoder.definition_level + (
            0 if child_writer.is_required else 1
        )

        if child_writer.is_repeated:
            if value is None:
                continue

            if not isinstance(value, list):
                val_type = type(value).__name__
                raise ValueError(
                    f"Field '{field}' is repeated, expected list, found {val_type}: {value}"
                )

            # If the list is empty, we treat it as if the field was missing
            # (i.e. we don't add it to seen_fields, so the cleanup loop
            # will write the appropriate nulls).
            if value:
                seen_fields.add(field)

            for i, item in enumerate(value):
                # the first item inherits the repetition level of its parent;
                # the rest starts to repeat at the repetition level of the
                # field
                child_repetition_level = (
                    repetition_level if i == 0 else child_writer.max_repetition_level
                )

                if child_writer.is_leaf():
                    if item is None:
                        raise ValueError(
                            f"Repeated field '{field}' cannot contain None values"
                        )
                    if isinstance(item, (list, dict)):
                        item_type = type(item).__name__
                        raise ValueError(
                            f"Repeated leaf field '{field}' expected primitive value, "
                            f"found {item_type}: {item}"
                        )
                    child_writer.write(item, child_repetition_level, definition_level)
                else:
                    if not isinstance(item, dict):
                        item_type = type(item).__name__
                        raise ValueError(
                            f"Field '{field}' is a repeated group, expected dict "
                            f"elements, found {item_type}: {item}"
                        )
                    dissect_record(
                        RecordDecoder(item, definition_level),
                        child_writer,
                        child_repetition_level,
                    )

        else:
            if isinstance(value, list):
                raise ValueError(
                    f"Field '{field}' is not repeated, expected single value, "
                    f"found list: {value}"
                )

            # If value is None, treat as missing (unless required)
            if value is None:
                if child_writer.is_required:
                    raise ValueError(f"Required field '{field}' cannot be None")
                continue

            if child_writer.is_leaf():
                if isinstance(value, dict):
                    val_type = type(value).__name__
                    raise ValueError(
                        f"Field '{field}' is a primitive leaf, expected scalar value, "
                        f"found {val_type}: {value}"
                    )
                seen_fields.add(field)
                child_writer.write(value, repetition_level, definition_level)
            else:
                if not isinstance(value, dict):
                    val_type = type(value).__name__
                    raise ValueError(
                        f"Field '{field}' is a nested group, expected dict, found {val_type}: {value}"
                    )
                seen_fields.add(field)
                dissect_record(
                    RecordDecoder(value, definition_level),
                    child_writer,
                    repetition_level,
                )

    # recursively write nulls at decoder.definition_level
    for field, child_writer in writer.children.items():
        if field not in seen_fields:
            if child_writer.is_required and decoder.record is not None:
                raise ValueError(f"Required field '{field}' is missing")
            if child_writer.is_leaf():
                child_writer.write(None, repetition_level, decoder.definition_level)
            else:
                new_dec = RecordDecoder(None, decoder.definition_level)
                dissect_record(new_dec, child_writer, repetition_level)


def shred_records(root_descriptor, records):
    if root_descriptor is None or root_descriptor.is_leaf:
        raise ValueError("Schema must contain at least one field")

    if not isinstance(records, list):
        val_type = type(records).__name__
        raise ValueError(f"Expected list of records, found {val_type}: {records}")

    root = FieldWriter(root_descriptor)
    for record in records:
        if not isinstance(record, dict):
            val_type = type(record).__name__
            raise ValueError(f"Expected dict for record, found {val_type}: {record}")
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
