from schema import ColumnDescriptor
from collections import defaultdict

END = "MAGIC"


def make_fsm(schema, selection=None):
    assert isinstance(schema, ColumnDescriptor)
    assert schema.path == "$"

    # Get the list of leaf descriptors
    fields = list(get_leaves(schema))
    if selection is not None:
        selection_set = set(selection)
        fields = [f for f in fields if f in selection_set]

    fsm = defaultdict(dict)

    for index, field in enumerate(fields):

        max_level = field.max_repetition_level
        barrier = fields[index + 1] if index < len(fields) - 1 else END
        barrier_level = common_ancestor(
            field, barrier).max_repetition_level if barrier != END else 0

        # Step 1: Add back edges
        # For fields that are at the end of a repeated message, we may need to
        # jump back to the start of the message, super-message, etc depending
        # of the repetition level we read
        for pre_field in reversed(fields[:index]):
            # For levels that are at most the barrier level, we have no choice
            # but to jump to the barrier
            if pre_field.max_repetition_level <= barrier_level:
                continue
            # Find jump point based on the common ancestor
            back_level = common_ancestor(pre_field, field).max_repetition_level
            fsm[field][back_level] = pre_field

        # Step 2: Fill gaps
        # Consider the following example with common repetition levels annotated w.r.t. D
        # A B C D E
        # 0 1 1 3 1
        # On repetition level 2 and 3 from D, we need to go back to D
        for level in reversed(range(barrier_level + 1, max_level + 1)):
            if level not in fsm[field]:
                fsm[field][level] = field if level == max_level else fsm[field][level + 1]

        # Step 3: Add barrier edges
        for level in range(barrier_level + 1):
            fsm[field][level] = barrier

    return fsm


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
