# Dremel Demo

Interactive reference implementation and visualization of Google's Dremel columnar storage algorithm (*"Dremel: Interactive Analysis of Web-Scale Datasets"*), covering **Record Shredding** (Repetition & Definition levels) and **Record Assembly** via Finite State Machines (FSMs).

## Repository Structure

- **`web/`** — Interactive React + TypeScript + Vite web app built for instant zero-latency execution in the browser and deployment on **Vercel**.
- **`python/`** — Original Python reference implementation (`schema.py`, `shred.py`, `fsm.py`, `assembly.py`), Streamlit app (`app.py`), and `pytest` suite.

## 1. Web App (`web/`) — Local Development & Vercel Deployment

### Run Locally
```bash
cd web
npm install
npm run dev
```

### Run Typecheck, Unit & UI Tests, and Production Build
```bash
cd web
npm run typecheck
npm test
npm run build
```

### Deploy to Vercel
This repository includes root [`vercel.json`](vercel.json) and [`web/vercel.json`](web/vercel.json) configurations:
- **Vercel Git Integration**: Import this repository on Vercel with the default root directory (`.`) or set Root Directory to `web/` — both are preconfigured to build `web/dist` cleanly.
- **Vercel CLI**:
  ```bash
  vercel
  ```

## 2. Python Reference Implementation (`python/`)

### Run Tests & Linter
```bash
pytest
ruff check python
```

### Run the Streamlit App
```bash
streamlit run python/app.py
```

### Python Example Usage
```python
from schema import parse_schema
from shred import shred_records
from assembly import assemble_records

schema = parse_schema(["doc.title", "doc.links[*].url"])
records = [
    {
        "doc": {
            "title": "Dremel Paper",
            "links": [{"url": "http://google.com"}, {"url": "http://cs.stanford.edu"}],
        }
    },
    {"doc": {"title": "Another Doc"}},
]

shredded_columns = shred_records(schema, records)
assembled_records = assemble_records(schema, shredded_columns)
```
