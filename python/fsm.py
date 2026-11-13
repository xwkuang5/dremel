from collections import defaultdict

from schema import ColumnDescriptor, common_ancestor, get_leaves

END = "MAGIC"


def make_fsm(schema, selection=None):
    if not isinstance(schema, ColumnDescriptor) or schema.path != "$":
        raise ValueError("Schema root must be a ColumnDescriptor with path '$'")
    if schema.is_leaf:
        raise ValueError("Schema must contain at least one field")

    # Get the list of leaf descriptors in schema DFS order
    all_leaves = list(get_leaves(schema))
    if selection is not None:
        selection_list = list(selection)
        if not selection_list:
            raise ValueError("Selection must contain at least one column")
        all_leaves_set = set(all_leaves)
        unknown = [d for d in selection_list if d not in all_leaves_set]
        if unknown:
            raise ValueError(
                f"Selection contains unknown or non-leaf descriptors: {unknown}"
            )
        selection_set = set(selection_list)
        fields = [f for f in all_leaves if f in selection_set]
    else:
        fields = all_leaves

    fsm = defaultdict(dict)

    for index, field in enumerate(fields):
        max_level = field.max_repetition_level
        barrier = fields[index + 1] if index < len(fields) - 1 else END
        barrier_level = (
            common_ancestor(field, barrier).max_repetition_level
            if barrier != END
            else 0
        )

        # Step 1: Add back edges
        # For fields that are at the end of a repeated message, we may need to
        # jump back to the start of the message, super-message, etc depending
        # on the repetition level we read
        for pre_field in reversed(fields[:index]):
            # For levels that are at most the barrier level, we have no choice
            # but to jump to the barrier
            if pre_field.max_repetition_level <= barrier_level:
                continue
            # Find jump point based on the common ancestor
            back_level = common_ancestor(pre_field, field).max_repetition_level
            fsm[field][back_level] = pre_field

        # Step 2: Fill gaps
        # Consider the following example with common repetition levels
        # annotated w.r.t. D
        # A B C D E
        # 0 1 1 3 1
        # On repetition level 2 and 3 from D, we need to go back to D
        for level in reversed(range(barrier_level + 1, max_level + 1)):
            if level not in fsm[field]:
                fsm[field][level] = (
                    field if level == max_level else fsm[field][level + 1]
                )

        # Step 3: Add barrier edges
        for level in range(barrier_level + 1):
            fsm[field][level] = barrier

    return fsm
