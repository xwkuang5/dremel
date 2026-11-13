import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileJson2,
  Info,
  Pause,
  Play,
  RotateCcw,
  StepForward,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AssemblyTrace, AssemblyTraceStep, JsonObject } from "../dremel";

interface AssemblyViewProps {
  inputRecords: JsonObject[];
  assembledRecords: JsonObject[] | null;
  trace: AssemblyTrace | null;
  activeStepIndex: number | null;
  onChangeActiveStepIndex: (idx: number | null) => void;
  hasSelection: boolean;
  isProjectedSubset: boolean;
  isStale: boolean;
}

export function AssemblyView({
  inputRecords,
  assembledRecords,
  trace,
  activeStepIndex,
  onChangeActiveStepIndex,
  hasSelection,
  isProjectedSubset,
  isStale,
}: AssemblyViewProps) {
  const [viewMode, setViewMode] = useState<"compare" | "stepper">("compare");
  const [isPlaying, setIsPlaying] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"input" | "assembled" | null>(
    null,
  );

  const steps = trace?.steps ?? [];
  const activeStep: AssemblyTraceStep | null =
    activeStepIndex !== null && steps[activeStepIndex]
      ? steps[activeStepIndex]
      : null;

  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const timer = window.setInterval(() => {
      onChangeActiveStepIndex(
        activeStepIndex === null
          ? 0
          : activeStepIndex + 1 >= steps.length
            ? 0
            : activeStepIndex + 1,
      );
    }, 850);
    return () => window.clearInterval(timer);
  }, [isPlaying, activeStepIndex, steps.length, onChangeActiveStepIndex]);

  const handleEnterStepper = () => {
    setViewMode("stepper");
    if (activeStepIndex === null && steps.length > 0) {
      onChangeActiveStepIndex(0);
    }
  };

  const handleExitStepper = () => {
    setIsPlaying(false);
    setViewMode("compare");
    onChangeActiveStepIndex(null);
  };

  const handleCopy = async (which: "input" | "assembled", data: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedTarget(which);
      window.setTimeout(() => setCopiedTarget(null), 1500);
    } catch {
      // Clipboard unavailable in non-HTTPS or test environments
    }
  };

  const exactMatch =
    assembledRecords !== null &&
    JSON.stringify(inputRecords) === JSON.stringify(assembledRecords);

  return (
    <section
      id="assembly-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <FileJson2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Reconstructed Records
          </h2>
          {assembledRecords && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                exactMatch
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : isProjectedSubset
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {exactMatch
                ? "Lossless round-trip match"
                : isProjectedSubset
                  ? "Column projection active"
                  : "Normalized output"}
            </span>
          )}
          {isStale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              Showing last valid state
            </span>
          )}
        </div>

        {hasSelection && assembledRecords && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={handleExitStepper}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "compare"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              JSON Diff View
            </button>
            <button
              type="button"
              onClick={handleEnterStepper}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "stepper"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <StepForward className="h-3.5 w-3.5" />
              Assembly Stepper
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-200/80 bg-sky-50/70 px-3.5 py-2.5 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="space-y-1">
            <p className="font-medium">
              Note: Reconstructed records may differ from input records when:
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-sky-800 dark:text-sky-300">
              <li>
                Only a subset of fields is defined in the schema or selected for
                column projection.
              </li>
              <li>
                An input repeated field is an empty list{" "}
                <code className="rounded bg-sky-100 px-1 py-0.5 font-mono dark:bg-sky-900/60">
                  []
                </code>{" "}
                (which has 0 occurrences in Dremel&apos;s data model, identical
                to an omitted repeated field).
              </li>
            </ul>
          </div>
        </div>

        {!hasSelection || !assembledRecords ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select at least one column in Projected Columns to assemble records.
          </p>
        ) : viewMode === "stepper" && activeStep ? (
          <div className="space-y-3 rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-3.5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
            {/* Stepper Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous step"
                  disabled={activeStep.stepIndex === 0}
                  onClick={() => {
                    setIsPlaying(false);
                    onChangeActiveStepIndex(
                      Math.max(0, activeStep.stepIndex - 1),
                    );
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Play
                    </>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Next step"
                  disabled={activeStep.stepIndex >= steps.length - 1}
                  onClick={() => {
                    setIsPlaying(false);
                    onChangeActiveStepIndex(
                      Math.min(steps.length - 1, activeStep.stepIndex + 1),
                    );
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    onChangeActiveStepIndex(0);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>

              <div className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                Step {activeStep.stepIndex + 1} of {steps.length} · Record #
                {activeStep.recordIndex}
              </div>
            </div>

            <input
              type="range"
              aria-label="Assembly step scrubber"
              min={0}
              max={Math.max(0, steps.length - 1)}
              value={activeStep.stepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                onChangeActiveStepIndex(Number(e.target.value));
              }}
              className="w-full accent-indigo-600"
            />

            {/* Step details */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  FSM Read &amp; Transition
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200">
                    {activeStep.columnPath}
                  </span>
                  <span className="text-slate-500">
                    read (val={JSON.stringify(activeStep.triple[0])}, r=
                    {activeStep.triple[1]}, d={activeStep.triple[2]})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  <span className="text-slate-500">peek next_r=</span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                    {activeStep.nextRepetitionLevel}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200">
                    {activeStep.nextColumnPath}
                  </span>
                </div>
                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <div className="mb-1 text-[11px] font-medium text-slate-500">
                    Assembler Operations
                  </div>
                  <div className="max-h-28 space-y-0.5 overflow-y-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {activeStep.events.length === 0 ? (
                      <span className="italic text-slate-400">
                        (no structural changes)
                      </span>
                    ) : (
                      activeStep.events.map((ev, idx) => (
                        <div key={idx}>{ev}</div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Record #{activeStep.recordIndex} Buffer Snapshot
                </div>
                <pre className="max-h-48 overflow-auto font-mono text-xs text-slate-800 dark:text-slate-200">
                  {JSON.stringify(activeStep.recordSnapshot, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Input Records
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopy("input", inputRecords)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {copiedTarget === "input" ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre
                aria-label="Input Records JSON output"
                className="max-h-[420px] overflow-auto bg-white p-3 font-mono text-xs leading-5 text-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
              >
                {JSON.stringify(inputRecords, null, 2)}
              </pre>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Assembled Records
                </h3>
                <button
                  type="button"
                  onClick={() => handleCopy("assembled", assembledRecords)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {copiedTarget === "assembled" ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre
                aria-label="Assembled Records JSON output"
                className="max-h-[420px] overflow-auto bg-white p-3 font-mono text-xs leading-5 text-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
              >
                {JSON.stringify(assembledRecords, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
