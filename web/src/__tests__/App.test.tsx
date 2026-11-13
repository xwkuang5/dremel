import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../App";

describe("Dremel Explorer App", () => {
  beforeEach(() => {
    window.location.hash = "";
    window.localStorage.clear();
  });

  it("renders default PaperSchema columns, FSM diagram, and assembled records", () => {
    render(<App />);

    expect(screen.getByText("Dremel Explorer")).toBeInTheDocument();
    expect(screen.getByText("Shredded Columns")).toBeInTheDocument();
    expect(screen.getByText("Assembly FSM")).toBeInTheDocument();
    expect(screen.getByText("Reconstructed Records")).toBeInTheDocument();

    const shreddedSection = document.getElementById("shredded-section")!;
    for (const col of [
      "DocId",
      "Links.Backward",
      "Links.Forward",
      "Name.Language.Code",
      "Name.Language.Country",
      "Name.Url",
    ]) {
      expect(within(shreddedSection).getByText(col)).toBeInTheDocument();
    }

    const fsmSvg = screen.getByRole("img", {
      name: "Dremel Assembly Finite State Machine",
    });
    expect(within(fsmSvg).getByText("END")).toBeInTheDocument();
    expect(within(fsmSvg).getAllByText(/r=/).length).toBeGreaterThan(0);

    expect(screen.getByText("Lossless round-trip match")).toBeInTheDocument();
  });

  it("switches to Figure 7 Column Projection preset and projects DocId & Country", async () => {
    const user = userEvent.setup();
    render(<App />);

    const presetSelect = screen.getByLabelText("Example Preset");
    await user.selectOptions(presetSelect, "paper-fig7");

    expect(screen.getByText("Column projection active")).toBeInTheDocument();
    const assembledPre = screen.getByLabelText("Assembled Records JSON output");
    expect(assembledPre.textContent).toContain('"Country": "us"');
    expect(assembledPre.textContent).not.toContain('"http://A"');
  });

  it("shows empty-selection warning when clearing projected columns and restores on Select All", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(
      screen.getByText(/Select at least one column in Projected Columns to build the FSM/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", {
        name: "Dremel Assembly Finite State Machine",
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select All" }));

    expect(
      screen.getByRole("img", {
        name: "Dremel Assembly Finite State Machine",
      }),
    ).toBeInTheDocument();
  });

  it("shows inline error banners on invalid schema or JSON without crashing and recovers when fixed", () => {
    render(<App />);

    const schemaTextarea = screen.getByLabelText("Schema (one path per line)");
    fireEvent.change(schemaTextarea, { target: { value: "a..b" } });

    expect(screen.getByText(/Schema Error:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Showing last valid state").length).toBeGreaterThan(0);

    fireEvent.change(schemaTextarea, { target: { value: "DocId\nLinks.Backward[*]\nLinks.Forward[*]\nName[*].Language[*].Code\nName[*].Language[*].Country\nName[*].Url" } });
    expect(screen.queryByText(/Schema Error:/i)).not.toBeInTheDocument();

    const recordsTextarea = screen.getByLabelText("Input Records JSON");
    fireEvent.change(recordsTextarea, { target: { value: "[{ invalid json" } });
    expect(screen.getByText(/Records Error:/i)).toBeInTheDocument();
  });

  it("steps through the Assembly Stepper and highlights FSM transitions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Assembly Stepper/i }));
    expect(screen.getByText(/Step 1 of /i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText(/Step 2 of /i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByText(/Step 1 of /i)).toBeInTheDocument();
  });

  it("toggles dark mode theme", async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggleBtn = screen.getByRole("button", {
      name: /Switch to (dark|light) mode/i,
    });
    const wasDark = document.documentElement.classList.contains("dark");
    await user.click(toggleBtn);
    expect(document.documentElement.classList.contains("dark")).toBe(!wasDark);
  });
});
