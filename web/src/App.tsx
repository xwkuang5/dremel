import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssemblyView } from "./components/AssemblyView";
import { FsmDiagram } from "./components/FsmDiagram";
import { Header } from "./components/Header";
import { ProjectionBar } from "./components/ProjectionBar";
import { RecordsEditor } from "./components/RecordsEditor";
import { SchemaPanel } from "./components/SchemaPanel";
import { ShreddedColumnsView } from "./components/ShreddedColumnsView";
import {
  assembleRecords,
  AssemblyTrace,
  ColumnDescriptor,
  DEFAULT_SCHEMA_TEXT,
  DremelPreset,
  FsmGraph,
  getLeaves,
  JsonObject,
  makeFsm,
  parseSchema,
  PRESETS,
  ShreddedColumnMap,
  shredRecords,
  traceAssembly,
} from "./dremel";

interface SharePayload {
  schemaText: string;
  recordsText: string;
  selectedPaths?: string[];
}

interface ValidEngineSnapshot {
  root: ColumnDescriptor;
  leaves: ColumnDescriptor[];
  records: JsonObject[];
  shreddedData: ShreddedColumnMap;
  selectedDescriptors: ColumnDescriptor[];
  fsm: FsmGraph | null;
  assembledRecords: JsonObject[] | null;
  trace: AssemblyTrace | null;
}

function encodeShareState(payload: SharePayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeShareState(hash: string): SharePayload | null {
  try {
    if (!hash.startsWith("#state=")) return null;
    const raw = hash.slice("#state=".length);
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (
      parsed &&
      typeof parsed.schemaText === "string" &&
      typeof parsed.recordsText === "string"
    ) {
      return parsed as SharePayload;
    }
    return null;
  } catch {
    return null;
  }
}

function getInitialTheme(): boolean {
  try {
    const saved = window.localStorage.getItem("dremel-theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  } catch {
    return false;
  }
}

function getInitialWorkspace(): {
  presetId: string;
  schemaText: string;
  recordsText: string;
  selectedPaths: string[] | null;
} {
  const fromHash =
    typeof window !== "undefined" ? decodeShareState(window.location.hash) : null;
  if (fromHash) {
    return {
      presetId: "custom",
      schemaText: fromHash.schemaText,
      recordsText: fromHash.recordsText,
      selectedPaths: Array.isArray(fromHash.selectedPaths)
        ? fromHash.selectedPaths
        : null,
    };
  }

  const defaultPreset = PRESETS[0];
  return {
    presetId: defaultPreset.id,
    schemaText: defaultPreset.schemaPaths.join("\n"),
    recordsText: JSON.stringify(defaultPreset.records, null, 2),
    selectedPaths: defaultPreset.selectedPaths ?? null,
  };
}

export default function App() {
  const initial = useMemo(() => getInitialWorkspace(), []);
  const [isDark, setIsDark] = useState<boolean>(() => getInitialTheme());
  const [activePresetId, setActivePresetId] = useState<string>(initial.presetId);
  const [schemaText, setSchemaText] = useState<string>(initial.schemaText);
  const [recordsText, setRecordsText] = useState<string>(initial.recordsText);
  const [selectedPathsState, setSelectedPathsState] = useState<string[] | null>(
    initial.selectedPaths,
  );
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const lastValidRef = useRef<ValidEngineSnapshot | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      window.localStorage.setItem("dremel-theme", isDark ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  const engineResult = useMemo(() => {
    const start = performance.now();

    let parsedRoot: ColumnDescriptor | null = null;
    let schemaError: string | null = null;
    try {
      const paths = schemaText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      parsedRoot = parseSchema(paths);
    } catch (err) {
      schemaError = err instanceof Error ? err.message : String(err);
    }

    let parsedJson: unknown = null;
    let recordsError: string | null = null;
    try {
      parsedJson = JSON.parse(recordsText);
    } catch (err) {
      recordsError =
        err instanceof Error ? `Invalid JSON: ${err.message}` : "Invalid JSON";
    }

    let shreddedData: ShreddedColumnMap | null = null;
    let records: JsonObject[] | null = null;
    if (parsedRoot && !recordsError) {
      try {
        shreddedData = shredRecords(parsedRoot, parsedJson);
        records = parsedJson as JsonObject[];
      } catch (err) {
        recordsError = err instanceof Error ? err.message : String(err);
      }
    }

    if (parsedRoot && shreddedData && records) {
      const leaves = getLeaves(parsedRoot);
      const allPaths = leaves.map((l) => l.fullPath);
      const effectiveSelectedPaths =
        selectedPathsState === null
          ? allPaths
          : selectedPathsState.filter((p) => allPaths.includes(p));
      const selectedSet = new Set(effectiveSelectedPaths);
      const selectedDescriptors = leaves.filter((l) =>
        selectedSet.has(l.fullPath),
      );

      let fsm: FsmGraph | null = null;
      let assembledRecords: JsonObject[] | null = null;
      let trace: AssemblyTrace | null = null;

      if (selectedDescriptors.length > 0) {
        const selectionArg =
          selectedDescriptors.length < leaves.length
            ? selectedDescriptors
            : null;
        fsm = makeFsm(parsedRoot, selectionArg);
        assembledRecords = assembleRecords(parsedRoot, shreddedData, {
          selection: selectionArg,
        });
        trace = traceAssembly(parsedRoot, shreddedData, selectionArg);
      }

      const snapshot: ValidEngineSnapshot = {
        root: parsedRoot,
        leaves,
        records,
        shreddedData,
        selectedDescriptors,
        fsm,
        assembledRecords,
        trace,
      };
      lastValidRef.current = snapshot;

      return {
        snapshot,
        parsedRoot,
        schemaError,
        recordsError,
        isStale: false,
        computeMs: performance.now() - start,
      };
    }

    return {
      snapshot: lastValidRef.current,
      parsedRoot,
      schemaError,
      recordsError,
      isStale: true,
      computeMs: performance.now() - start,
    };
  }, [schemaText, recordsText, selectedPathsState]);

  const snapshot = engineResult.snapshot;
  const leaves = snapshot?.leaves ?? [];
  const allLeafPaths = useMemo(() => leaves.map((l) => l.fullPath), [leaves]);

  const effectiveSelectedPaths = useMemo(() => {
    if (selectedPathsState === null) return allLeafPaths;
    const validSet = new Set(allLeafPaths);
    return selectedPathsState.filter((p) => validSet.has(p));
  }, [selectedPathsState, allLeafPaths]);

  const activeStep = useMemo(() => {
    if (activeStepIndex === null || !snapshot?.trace) return null;
    return snapshot.trace.steps[activeStepIndex] ?? null;
  }, [activeStepIndex, snapshot]);

  const applyPreset = useCallback((preset: DremelPreset) => {
    setActivePresetId(preset.id);
    setSchemaText(preset.schemaPaths.join("\n"));
    setRecordsText(JSON.stringify(preset.records, null, 2));
    setSelectedPathsState(preset.selectedPaths ?? null);
    setActiveStepIndex(null);
  }, []);

  const handleSelectPreset = useCallback(
    (presetId: string) => {
      const found = PRESETS.find((p) => p.id === presetId);
      if (found) {
        applyPreset(found);
      }
    },
    [applyPreset],
  );

  const handleResetDefault = useCallback(() => {
    applyPreset(PRESETS[0]);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [applyPreset]);

  const handleLoadExampleSchema = useCallback(() => {
    setActivePresetId("custom");
    setSchemaText(DEFAULT_SCHEMA_TEXT);
    setSelectedPathsState(null);
    setActiveStepIndex(null);
  }, []);

  const handleSchemaChange = useCallback((next: string) => {
    setActivePresetId("custom");
    setSchemaText(next);
    setActiveStepIndex(null);
  }, []);

  const handleRecordsChange = useCallback((next: string) => {
    setActivePresetId("custom");
    setRecordsText(next);
    setActiveStepIndex(null);
  }, []);

  const handleFormatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(recordsText);
      setRecordsText(JSON.stringify(parsed, null, 2));
    } catch {
      // Leave text as-is when JSON is currently invalid
    }
  }, [recordsText]);

  const handleTogglePath = useCallback(
    (path: string) => {
      setActiveStepIndex(null);
      setSelectedPathsState((prev) => {
        const current = prev === null ? allLeafPaths : prev;
        const set = new Set(current);
        if (set.has(path)) {
          set.delete(path);
        } else {
          set.add(path);
        }
        const ordered = allLeafPaths.filter((p) => set.has(p));
        return ordered.length === allLeafPaths.length ? null : ordered;
      });
    },
    [allLeafPaths],
  );

  const handleSelectAll = useCallback(() => {
    setActiveStepIndex(null);
    setSelectedPathsState(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setActiveStepIndex(null);
    setSelectedPathsState([]);
  }, []);

  const handleShareLink = useCallback(async () => {
    const encoded = encodeShareState({
      schemaText,
      recordsText,
      selectedPaths: selectedPathsState ?? undefined,
    });
    const nextUrl = `${window.location.origin}${window.location.pathname}#state=${encoded}`;
    window.history.replaceState(null, "", `#state=${encoded}`);
    try {
      await navigator.clipboard.writeText(nextUrl);
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1800);
    } catch {
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 1800);
    }
  }, [schemaText, recordsText, selectedPathsState]);

  const isProjectedSubset =
    effectiveSelectedPaths.length > 0 &&
    effectiveSelectedPaths.length < allLeafPaths.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header
        presets={PRESETS}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onResetDefault={handleResetDefault}
        onShareLink={handleShareLink}
        copiedShare={copiedShare}
        recordCount={snapshot?.records.length ?? 0}
        selectedColumnCount={effectiveSelectedPaths.length}
        totalColumnCount={allLeafPaths.length}
        computeMs={engineResult.computeMs}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left Studio Column */}
          <div className="space-y-5 lg:col-span-4">
            <SchemaPanel
              schemaText={schemaText}
              onSchemaTextChange={handleSchemaChange}
              onLoadExampleSchema={handleLoadExampleSchema}
              parsedRoot={engineResult.parsedRoot}
              schemaError={engineResult.schemaError}
            />

            {leaves.length > 0 && (
              <ProjectionBar
                leaves={leaves}
                selectedPaths={effectiveSelectedPaths}
                onTogglePath={handleTogglePath}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
              />
            )}

            <RecordsEditor
              recordsText={recordsText}
              onRecordsTextChange={handleRecordsChange}
              onFormatJson={handleFormatJson}
              recordsError={engineResult.recordsError}
              recordCount={snapshot?.records.length ?? 0}
            />
          </div>

          {/* Right Visualization Canvas */}
          <div className="space-y-5 lg:col-span-8">
            {snapshot && (
              <>
                <ShreddedColumnsView
                  shreddedData={snapshot.shreddedData}
                  selectedPaths={effectiveSelectedPaths}
                  activeStep={activeStep}
                  isStale={engineResult.isStale}
                />

                <FsmDiagram
                  fsm={snapshot.fsm}
                  selectedDescriptors={snapshot.selectedDescriptors}
                  activeStep={activeStep}
                  isStale={engineResult.isStale}
                />

                <AssemblyView
                  inputRecords={snapshot.records}
                  assembledRecords={snapshot.assembledRecords}
                  trace={snapshot.trace}
                  activeStepIndex={activeStepIndex}
                  onChangeActiveStepIndex={setActiveStepIndex}
                  hasSelection={snapshot.selectedDescriptors.length > 0}
                  isProjectedSubset={isProjectedSubset}
                  isStale={engineResult.isStale}
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
