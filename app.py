import json

import graphviz
import pandas as pd
import streamlit as st
from streamlit_ace import st_ace

from assembly import assemble_records
from fsm import END, make_fsm
from paper_schema import PaperSchema
from schema import parse_schema
from shred import shred_records

st.set_page_config(layout="wide", page_title="Dremel Visualization")

st.title("Dremel Record Shredding & Assembly")


st.sidebar.markdown("""
**Table of Contents**
- [Input Records](#input-records)
- [Shredded Columns](#shredded-columns)
- [Assembly FSM](#assembly-fsm)
- [Reconstructed Records](#reconstructed-records)
---
""")

# Sidebar for inputs
st.sidebar.header("Input Data")

# Default values from PaperSchema
paper_schema = PaperSchema()
default_schema = """DocId
Links.Backward[*]
Links.Forward[*]
Name[*].Language[*].Code
Name[*].Language[*].Country
Name[*].Url"""

default_records = json.dumps(paper_schema.records, indent=2)

# Initialize Session State
if "schema_area" not in st.session_state:
    st.session_state.schema_area = default_schema


def load_example_schema():
    st.session_state.schema_area = default_schema


st.sidebar.button("Load Example Schema", on_click=load_example_schema)

schema_text = st.sidebar.text_area(
    "Schema (one path per line)", height=200, key="schema_area"
)

st.subheader("Input Records")
records_text = st_ace(
    value=default_records,
    language="json",
    theme="chrome",
    height=400,
    key="records_area",
    auto_update=True,
)

# Update session state (optional, as widgets update it automatically

try:
    # Parse Schema
    schema_paths = [line.strip() for line in schema_text.splitlines() if line.strip()]
    root_descriptor = parse_schema(schema_paths)

    # Parse Records
    records = json.loads(records_text)

    # Shred Records
    shredded_data = shred_records(root_descriptor, records)

    # 1. Shredding Visualization
    st.header("Shredded Columns")

    cols = st.columns(len(shredded_data))

    # Sort by path for consistent display
    sorted_descriptors = sorted(shredded_data.keys(), key=lambda d: d.full_path)

    shredded_df_data = []

    for desc in sorted_descriptors:
        data = shredded_data[desc]
        # data is list of (value, r, d)

        # Create a nice dataframe for display
        df = pd.DataFrame(data, columns=["Value", "R", "D"])
        shredded_df_data.append({"Descriptor": desc, "Data": df})

    # Display in a grid or tabs
    tabs = st.tabs([d.full_path for d in sorted_descriptors])
    for i, tab in enumerate(tabs):
        with tab:
            st.subheader(f"Column: {sorted_descriptors[i].full_path}")
            st.dataframe(shredded_df_data[i]["Data"], width="stretch")

    # 2. FSM Visualization
    st.header("Assembly FSM")
    fsm = make_fsm(root_descriptor)

    dot = graphviz.Digraph()
    dot.attr(rankdir="LR")

    # Add nodes
    # We need to map descriptors to unique IDs for graphviz
    desc_to_id = {desc: str(i) for i, desc in enumerate(sorted_descriptors)}
    desc_to_id[END] = "END"

    for desc in sorted_descriptors:
        label = f"{desc.full_path}\n(Max R={desc.max_repetition_level})"
        dot.node(desc_to_id[desc], label=label, shape="box")

    dot.node("END", label="END", shape="doublecircle")

    # Add edges
    for start_node, transitions in fsm.items():
        if start_node not in desc_to_id:
            continue  # Should be in sorted_descriptors

        start_id = desc_to_id[start_node]

        # Group transitions by target to simplify graph
        target_to_levels = {}
        for level, target_node in transitions.items():
            target_id = desc_to_id.get(target_node, "END")
            if target_id not in target_to_levels:
                target_to_levels[target_id] = []
            target_to_levels[target_id].append(level)

        for target_id, levels in target_to_levels.items():
            levels_str = ",".join(map(str, sorted(levels)))
            dot.edge(start_id, target_id, label=f"r={levels_str}")

    st.graphviz_chart(dot)

    # 3. Assembly Visualization
    st.header("Reconstructed Records")

    st.info(
        """Note: Reconstructed records may differ from input records because:
- The schema only specifies a subset of fields in the input record.
- The current implementation does not differentiate between unset (sub) records and empty (sub) records."""
    )

    assembled_records = assemble_records(root_descriptor, shredded_data)

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Input Records")
        st.json(records)

    with col2:
        st.subheader("Assembled Records")
        st.json(assembled_records)

except Exception as e:
    st.error(f"Error: {e}")
    st.exception(e)
