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

    ancestor = None
    for a_ancestor, b_ancestor in zip(a_ancestors, b_ancestors):
        if a_ancestor == b_ancestor:
            ancestor = a_ancestor
            continue
        break
    return ancestor


class ColumnDescriptor:
    def __init__(
        self,
        path,
        parent=None,
        max_repetition_level=0,
        max_definition_level=0,
        tree_level=None,
    ):
        self.path = path
        self.parent = parent
        self.max_repetition_level = max_repetition_level
        self.max_definition_level = max_definition_level
        self.tree_level = (
            tree_level
            if tree_level is not None
            else (0 if parent is None else parent.tree_level + 1)
        )
        self.children = collections.OrderedDict()
        self.is_repeated = False

    @property
    def is_leaf(self):
        return len(self.children) == 0

    @property
    def full_path(self):
        path = []
        curr = self
        while curr.parent:
            path.append(curr.path)
            curr = curr.parent
        if curr.path != "$":
            path.append(curr.path)
        return ".".join(reversed(path))

    def full_definition_level(self, definition_level):
        """
        Returns the tree_level of the deepest ancestor from root to self whose
        max_definition_level equals @definition_level (Appendix B of Dremel paper).
        """
        for ancestor in get_ancestors(self):
            if ancestor.max_definition_level == definition_level:
                return ancestor.tree_level
        raise ValueError(
            f"Definition level {definition_level} not found in ancestors of {self}"
        )

    def full_repetition_level(self, repetition_level):
        """
        Returns the tree_level to return to when repeating at @repetition_level.

        For repetition_level == 0, returns 0. For repetition_level > 0, finds the
        repeated ancestor that introduced @repetition_level and returns its parent's
        tree_level so the repeating scope itself is closed before the next element.
        """
        if repetition_level == 0:
            return 0
        if repetition_level > 0:
            for ancestor in reversed(list(get_ancestors(self))):
                if ancestor.max_repetition_level == repetition_level:
                    return ancestor.parent.tree_level if ancestor.parent else 0
        raise ValueError(
            f"Repetition level {repetition_level} not found in ancestors of {self}"
        )

    def add_child(self, path, is_repeated=False):
        if path in self.children:
            existing = self.children[path]
            if existing.is_repeated != is_repeated:
                raise ValueError(
                    f"Conflicting repetition for field '{existing.full_path}': "
                    f"previously is_repeated={existing.is_repeated}, "
                    f"got is_repeated={is_repeated}"
                )
            return existing
        child = ColumnDescriptor(path, parent=self)
        child.is_repeated = is_repeated
        self.children[path] = child
        return child

    def compute_levels(
        self, current_rep_level=0, current_def_level=0, current_tree_level=0
    ):
        new_def_level = current_def_level + (1 if self.parent is not None else 0)
        new_rep_level = current_rep_level
        if self.is_repeated:
            new_rep_level += 1

        self.max_repetition_level = new_rep_level
        self.max_definition_level = new_def_level
        self.tree_level = current_tree_level

        for child in self.children.values():
            child.compute_levels(new_rep_level, new_def_level, current_tree_level + 1)

    def __eq__(self, other):
        if not isinstance(other, ColumnDescriptor):
            return False
        return (
            self.path == other.path
            and self.full_path == other.full_path
            and self.max_repetition_level == other.max_repetition_level
            and self.max_definition_level == other.max_definition_level
            and self.tree_level == other.tree_level
            and self.is_repeated == other.is_repeated
            and self.children == other.children
        )

    def __hash__(self):
        return hash(
            (
                self.path,
                self.full_path,
                self.max_repetition_level,
                self.max_definition_level,
                self.tree_level,
                self.is_repeated,
                tuple(self.children.items()),
            )
        )

    def __repr__(self):
        return (
            f"ColumnDescriptor(path='{self.path}', "
            f"r={self.max_repetition_level}, "
            f"d={self.max_definition_level}, "
            f"is_repeated={self.is_repeated}, "
            f"children={list(self.children.values())})"
        )


def parse_schema(schema_paths):
    if not schema_paths:
        raise ValueError("Schema must contain at least one path")

    root = ColumnDescriptor("$")
    defined_leaves = set()

    for path in schema_paths:
        if not isinstance(path, str) or not path.strip():
            raise ValueError(f"Invalid empty schema path: {path!r}")

        parts = path.split(".")
        current = root
        for idx, part in enumerate(parts):
            if not part:
                raise ValueError(f"Empty field segment in schema path: '{path}'")

            is_repeated = False
            name = part
            if part.endswith("[*]"):
                is_repeated = True
                name = part[:-3]

            if not name or "[" in name or "]" in name or name == "$":
                raise ValueError(
                    f"Invalid field name '{part}' in schema path: '{path}'"
                )

            current = current.add_child(name, is_repeated)
            is_last = idx == len(parts) - 1
            if is_last:
                if current.children or id(current) in defined_leaves:
                    if current.children:
                        raise ValueError(
                            f"Field '{current.full_path}' cannot be both a leaf "
                            f"and a nested group"
                        )
                    raise ValueError(f"Duplicate schema path: '{path}'")
                defined_leaves.add(id(current))
            else:
                if id(current) in defined_leaves:
                    raise ValueError(
                        f"Field '{current.full_path}' cannot be both a leaf "
                        f"and a nested group"
                    )

    root.compute_levels()
    return root
