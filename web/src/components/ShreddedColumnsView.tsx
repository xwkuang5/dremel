import { LayoutGrid, PanelTop, Table2 } from "lucide-react";
import { useState } from "react";
import {
  AssemblyTraceStep,
  ColumnDescriptor,
  findDescriptorInMap,
  ShreddedColumnMap,
  ShreddedTriple,
} from "../dremel";

interface ShreddedColumnsViewProps {
  shreddedData: ShreddedColumnMap;
  selectedPaths: string[];
  activeStep: AssemblyTraceStep | null;
  isStale: boolean;
}

function formatTripleValue(val: ShreddedTriple[0]): string {
  if (val === null) return "NULL";
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function getRecordNumbers(rows: ShreddedTriple[]): number[] {
  let recIdx = -1;
  return rows.map(([, r]) => {
    if (r === 0) recIdx += 1;
    return Math.max(0, recIdx);
  });
}

export function ShreddedColumnsView({
  shreddedData,
  selectedPaths,
  activeStep,
  isStale,
}: ShreddedColumnsViewProps) {
  const [viewMode, setViewMode] = useState<"grid" | "tabs">("grid");
  const [activeTabPath, setActiveTabPath] = useState<string>("");

  const sortedDescriptors: ColumnDescriptor[] = Array.from(
    shreddedData.keys(),
  ).sort((a, b) => a.fullPath.localeCompare(b.fullPath));

  const selectedSet = new Set(selectedPaths);

  const effectiveTabPath = sortedDescriptors.some(
    (d) => d.fullPath === activeTabPath,
  )
    ? activeTabPath
    : (sortedDescriptors[0]?.fullPath ?? "");

  const activeTabDescriptor = sortedDescriptors.find(
    (d) => d.fullPath === effectiveTabPath,
  );

  return (
    <section
      id="shredded-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Shredded Columns
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {sortedDescriptors.length}{" "}
            {sortedDescriptors.length === 1 ? "column" : "columns"}
          </span>
          {isStale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              Showing last valid state
            </span>
          )}
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "grid"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Paper Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode("tabs")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === "tabs"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <PanelTop className="h-3.5 w-3.5" />
            Column Tabs
          </button>
        </div>
      </div>

      <div className="p-4">
        {sortedDescriptors.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No columns shredded.
          </p>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sortedDescriptors.map((desc) => {
              const rows = findDescriptorInMap(shreddedData, desc) ?? [];
              const recNums = getRecordNumbers(rows);
              const isProjected = selectedSet.has(desc.fullPath);

              return (
                <div
                  key={desc.fullPath}
                  className={`overflow-hidden rounded-lg border transition ${
                    isProjected
                      ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60"
                      : "border-slate-200/70 bg-slate-50/60 opacity-65 dark:border-slate-800/60 dark:bg-slate-950/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {desc.fullPath}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span>Max R={desc.maxRepetitionLevel}</span>
                        <span>·</span>
                        <span>Max D={desc.maxDefinitionLevel}</span>
                      </div>
                    </div>
                    {!isProjected && (
                      <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        excluded
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800/80 dark:text-slate-500">
                          <th className="w-8 px-2 py-1.5 font-medium">Rec</th>
                          <th className="px-2 py-1.5 font-medium">Value</th>
                          <th className="w-10 px-2 py-1.5 text-center font-medium">
                            R
                          </th>
                          <th className="w-10 px-2 py-1.5 text-center font-medium">
                            D
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([val, r, d], rowIdx) => {
                          const isActiveRow =
                            activeStep !== null &&
                            activeStep.columnPath === desc.fullPath &&
                            activeStep.rowIndexInColumn === rowIdx;
                          const isNewRecord = r === 0 && rowIdx > 0;

                          return (
                            <tr
                              key={rowIdx}
                              className={`transition-colors ${
                                isNewRecord
                                  ? "border-t-2 border-indigo-200/80 dark:border-indigo-900/70"
                                  : "border-t border-slate-100 dark:border-slate-800/60"
                              } ${
                                isActiveRow
                                  ? "bg-indigo-100/90 dark:bg-indigo-900/50"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                              }`}
                            >
                              <td className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500">
                                {r === 0 ? `#${recNums[rowIdx]}` : ""}
                              </td>
                              <td className="max-w-[160px] truncate px-2 py-1">
                                {val === null ? (
                                  <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] italic text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    NULL
                                  </span>
                                ) : (
                                  <span className="text-slate-800 dark:text-slate-100">
                                    {formatTripleValue(val)}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <span
                                  className={`inline-block min-w-[20px] rounded px-1 py-0.5 text-[11px] font-medium ${
                                    r === 0
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                  }`}
                                >
                                  {r}
                                </span>
                              </td>
                              <td className="px-2 py-1 text-center">
                                <span className="inline-block min-w-[20px] rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {d}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div
              role="tablist"
              aria-label="Shredded columns"
              className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3 dark:border-slate-800"
            >
              {sortedDescriptors.map((desc) => {
                const isActive = desc.fullPath === effectiveTabPath;
                return (
                  <button
                    key={desc.fullPath}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTabPath(desc.fullPath)}
                    className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    }`}
                  >
                    {desc.fullPath}
                  </button>
                );
              })}
            </div>

            {activeTabDescriptor && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Column: {activeTabDescriptor.fullPath}
                  </h3>
                  <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    Max R={activeTabDescriptor.maxRepetitionLevel} · Max D=
                    {activeTabDescriptor.maxDefinitionLevel}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full border-collapse text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                        <th className="w-16 px-3 py-2">Row</th>
                        <th className="w-20 px-3 py-2">Record</th>
                        <th className="px-3 py-2">Value</th>
                        <th className="w-20 px-3 py-2 text-center">R</th>
                        <th className="w-20 px-3 py-2 text-center">D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rows =
                          findDescriptorInMap(
                            shreddedData,
                            activeTabDescriptor,
                          ) ?? [];
                        const recNums = getRecordNumbers(rows);
                        return rows.map(([val, r, d], rowIdx) => {
                          const isActiveRow =
                            activeStep !== null &&
                            activeStep.columnPath ===
                              activeTabDescriptor.fullPath &&
                            activeStep.rowIndexInColumn === rowIdx;

                          return (
                            <tr
                              key={rowIdx}
                              className={`border-t border-slate-100 dark:border-slate-800/70 ${
                                isActiveRow
                                  ? "bg-indigo-100/90 dark:bg-indigo-900/50"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-900/60"
                              }`}
                            >
                              <td className="px-3 py-2 text-slate-400">
                                {rowIdx}
                              </td>
                              <td className="px-3 py-2 text-slate-500">
                                #{recNums[rowIdx]}
                              </td>
                              <td className="px-3 py-2">
                                {val === null ? (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] italic text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    NULL
                                  </span>
                                ) : (
                                  <span className="text-slate-900 dark:text-slate-100">
                                    {formatTripleValue(val)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">{r}</td>
                              <td className="px-3 py-2 text-center">{d}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
