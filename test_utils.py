from schema import ColumnDescriptor


def mk_desc(path, r, d, is_repeated=False, children=None):
    desc = ColumnDescriptor(
        path, parent=None, max_repetition_level=r, max_definition_level=d)
    desc.is_repeated = is_repeated
    if children:
        for child in children:
            desc.children[child.path] = child
            child.parent = desc
    return desc
