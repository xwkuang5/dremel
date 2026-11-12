from schema import ColumnDescriptor


def _update_tree_levels(desc, level=0):
    desc.tree_level = level
    for child in desc.children.values():
        _update_tree_levels(child, level + 1)


def mk_desc(path, r, d, is_repeated=False, children=None):
    desc = ColumnDescriptor(
        path, parent=None, max_repetition_level=r, max_definition_level=d
    )
    desc.is_repeated = is_repeated
    if children:
        for child in children:
            desc.children[child.path] = child
            child.parent = desc
    _update_tree_levels(desc, 0 if desc.parent is None else desc.parent.tree_level + 1)
    return desc


def get_desc(schema, path):
    curr = schema
    parts = path.split(".")
    for part in parts:
        if part.endswith("[*]"):
            part = part[:-3]
        assert part in curr.children
        curr = curr.children[part]
    return curr
