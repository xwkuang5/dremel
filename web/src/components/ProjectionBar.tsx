import { Check, Columns3 } from "lucide-react";
import { ColumnDescriptor } from "../dremel";

interface ProjectionBarProps {
  leaves: ColumnDescriptor[];
  selectedPaths: string[];
  onTogglePath: (path: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function ProjectionBar({
  leaves,
  selectedPaths,
  onTogglePath,
  onSelectAll,
  onClearAll,
}: ProjectionBarProps) {
  const selectedSet = new Set(selectedPaths);

  return (
    <section
      id="projection-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Columns3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Projected Columns (Assembly &amp; FSM)
          </h2>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            {selectedPaths.length}/{leaves.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-3">
        {leaves.map((leaf) => {
          const isSelected = selectedSet.has(leaf.fullPath);
          return (
            <button
              key={leaf.fullPath}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onTogglePath(leaf.fullPath)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition active:scale-[0.98] ${
                isSelected
                  ? "border-indigo-500/70 bg-indigo-50 text-indigo-800 shadow-sm dark:border-indigo-500/60 dark:bg-indigo-950/60 dark:text-indigo-200"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500"
                    : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                }`}
              >
                {isSelected && <Check className="h-2.5 w-2.5" />}
              </span>
              <span className="font-medium">{leaf.fullPath}</span>
              <span className="text-[10px] opacity-75">
                R{leaf.maxRepetitionLevel}·D{leaf.maxDefinitionLevel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
