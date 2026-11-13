from pathlib import Path

from streamlit.testing.v1 import AppTest

APP_PATH = str(Path(__file__).resolve().parent / "app.py")


def test_streamlit_app_default_load():
    at = AppTest.from_file(APP_PATH).run()
    assert len(at.exception) == 0
    headers = [h.value for h in at.header]
    assert "Shredded Columns" in headers
    assert "Assembly FSM" in headers
    assert "Reconstructed Records" in headers


def test_streamlit_app_column_projection_and_empty_selection():
    at = AppTest.from_file(APP_PATH).run()
    assert len(at.exception) == 0

    at.multiselect[0].set_value(["DocId", "Name.Language.Country"]).run()
    assert len(at.exception) == 0
    assert len(at.warning) == 0

    at.multiselect[0].set_value([]).run()
    assert len(at.exception) == 0
    assert len(at.warning) == 1
