import collections

class ColumnDescriptor:
    def __init__(self, path, parent=None, max_repetition_level=0, max_definition_level=0):
        self.path = path
        self.parent = parent
        self.max_repetition_level = max_repetition_level
        self.max_definition_level = max_definition_level
        self.children = collections.OrderedDict()
        self.is_repeated = False

    def add_child(self, path, is_repeated=False):
        if path not in self.children:
            child = ColumnDescriptor(path, parent=self)
            child.is_repeated = is_repeated
            self.children[path] = child
        return self.children[path]

    def compute_levels(self, current_rep_level=0, current_def_level=0):
        new_def_level = current_def_level + (1 if self.parent is not None else 0)
        new_rep_level = current_rep_level
        if self.is_repeated:
            new_rep_level += 1
            
        self.max_repetition_level = new_rep_level
        self.max_definition_level = new_def_level
        
        for child in self.children.values():
            child.compute_levels(new_rep_level, new_def_level)

    def __eq__(self, other):
        if not isinstance(other, ColumnDescriptor):
            return False
        return (self.path == other.path and
                self.max_repetition_level == other.max_repetition_level and
                self.max_definition_level == other.max_definition_level and
                self.is_repeated == other.is_repeated and
                self.children == other.children)

    def __repr__(self):
        return (f"ColumnDescriptor(path='{self.path}', "
                f"r={self.max_repetition_level}, "
                f"d={self.max_definition_level}, "
                f"is_repeated={self.is_repeated}, "
                f"children={list(self.children.values())})")

class FieldWriter:
    def __init__(self, descriptor):
        self.descriptor = descriptor
        self.children = collections.OrderedDict()
        self.data = [] # List of (value, r, d)
        
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
            # If value is list, yield (key, item) for each item
            def generator():
                for k, v in self.record.items():
                    if isinstance(v, list):
                        for item in v:
                            yield (k, item)
                    else:
                        yield (k, v)
            self.iterator = generator()
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
    - Does not differentiate between null and missing, i.e., can not differentiate an empty sub-record from one which has all its sub-fields set to null
    - Eagerly writes all leaves (i.e., not sparse)
    """
    seen_fields = set()
    
    while decoder.has_next():
        field, value = decoder.next()
        
        child_writer = writer.get_child(field)
        if not child_writer:
            continue

        child_repetition_level = repetition_level
        if field in seen_fields:
            child_repetition_level = child_writer.max_repetition_level
        else:
            seen_fields.add(field)
            
        if child_writer.is_leaf():
            child_writer.write(value, child_repetition_level, decoder.definition_level + 1)
        else:
            new_dec = RecordDecoder(value, decoder.definition_level + 1)
            dissect_record(new_dec, child_writer, child_repetition_level)

    for field, child_writer in writer.children.items():
        if field not in seen_fields:
            if child_writer.is_leaf():
                child_writer.write(None, repetition_level, decoder.definition_level)
            else:
                new_dec = RecordDecoder(None, decoder.definition_level)
                dissect_record(new_dec, child_writer, repetition_level)

def parse_schema(schema_paths):
    root = ColumnDescriptor("$")
    for path in schema_paths:
        parts = path.split('.')
        current = root
        for part in parts:
            is_repeated = False
            name = part
            if part.endswith("[*]"):
                is_repeated = True
                name = part[:-3]
            current = current.add_child(name, is_repeated)
    root.compute_levels()
    return root

def shred_records(schema_paths, records):
    root_descriptor = parse_schema(schema_paths)
    root = FieldWriter(root_descriptor)
    for record in records:
        decoder = RecordDecoder(record, definition_level=0)
        dissect_record(decoder, root, repetition_level=0)
        
    output = {}
    def collect(node, path_prefix):
        path = node.name
        if node.is_repeated:
            path += "[*]"
        full_path = f"{path_prefix}.{path}" if path_prefix else path
        
        if node.is_leaf():
            clean_path = full_path.replace("$.", "")
            output[clean_path] = node.data
        
        for child in node.children.values():
            collect(child, full_path)
            
    for child in root.children.values():
        collect(child, "")
        
    return output
