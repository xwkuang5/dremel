import collections


def get_all_nodes(root):
    yield root
    for child in root.children.values():
        yield from get_all_nodes(child)


def get_leaves(root):
    if not root.children:
        yield root
    for child in root.children.values():
        yield from get_leaves(child)


def get_ancestors(node):
    while node:
        yield node
        node = node.parent


def common_ancestor(a, b):
    a_ancestors = list(get_ancestors(a))[::-1]
    b_ancestors = list(get_ancestors(b))[::-1]

    common_ancestor = None
    for a_ancestor, b_ancestor in zip(a_ancestors, b_ancestors):
        if a_ancestor == b_ancestor:
            common_ancestor = a_ancestor
            continue
        break
    return common_ancestor


class ColumnDescriptor:
    def __init__(
            self,
            path,
            parent=None,
            max_repetition_level=0,
            max_definition_level=0):
        self.path = path
        self.parent = parent
        self.max_repetition_level = max_repetition_level
        self.max_definition_level = max_definition_level
        self.children = collections.OrderedDict()
        self.is_repeated = False

    @property
    def is_leaf(self):
        return len(self.children) == 0

    def full_repetition_level(self, repetition_level):
        """
        Returns the definition level of the field @repetition_level from root to this.

        This is the level that we need to return to when finishing a record and repeating to a previous field.
        """
        for ancestor in reversed(list(v for v in get_ancestors(self))):
            if ancestor.max_repetition_level == repetition_level:
                return ancestor.max_definition_level
        raise ValueError(f"Repetition level {
            repetition_level} not found in ancestors of {self}")

    def add_child(self, path, is_repeated=False):
        if path not in self.children:
            child = ColumnDescriptor(path, parent=self)
            child.is_repeated = is_repeated
            self.children[path] = child
        return self.children[path]

    def compute_levels(self, current_rep_level=0, current_def_level=0):
        new_def_level = current_def_level + \
            (1 if self.parent is not None else 0)
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
        # NOTE we ignore the parent pointer intentionally
        return (self.path == other.path and
                self.max_repetition_level == other.max_repetition_level and
                self.max_definition_level == other.max_definition_level and
                self.is_repeated == other.is_repeated and
                self.children == other.children)

    def __hash__(self):
        # NOTE we ignore the parent pointer intentionally
        return hash((self.path,
                     self.max_repetition_level,
                     self.max_definition_level,
                     self.is_repeated,
                     tuple(self.children.items())))

    def __repr__(self):
        return (f"ColumnDescriptor(path='{self.path}', "
                f"r={self.max_repetition_level}, "
                f"d={self.max_definition_level}, "
                f"is_repeated={self.is_repeated}, "
                f"children={list(self.children.values())})")


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
