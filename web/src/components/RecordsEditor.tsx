import { Braces, Wand2 } from "lucide-react";
import { KeyboardEvent } from "react";

interface RecordsEditorProps {
  recordsText: string;
  onRecordsTextChange: (next: string) => void;
  onFormatJson: () => void;
  recordsError: string | null;
  recordCount: number;
}

export function RecordsEditor({
  recordsText,
  onRecordsTextChange,
  onFormatJson,
  recordsError,
  recordCount,
}: RecordsEditorProps) {
  const lines = recordsText.split("\n");

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated =
        recordsText.slice(0, start) + "  " + recordsText.slice(end);
      onRecordsTextChange(updated);
      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <section
      id="records-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Input Records (JSON)
          </h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {recordCount} {recordCount === 1 ? "record" : "records"}
          </span>
        </div>
        <button
          type="button"
          onClick={onFormatJson}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Wand2 className="h-3 w-3 text-indigo-500" />
          Format JSON
        </button>
      </div>

      <div className="p-3">
        <div className="flex max-h-[380px] overflow-auto rounded-lg border border-slate-200 bg-slate-50/70 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950/70">
          <div
            aria-hidden="true"
            className="select-none border-r border-slate-200 bg-slate-100/80 px-2.5 py-2.5 text-right font-mono text-xs leading-5 text-slate-400 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-500"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            aria-label="Input Records JSON"
            value={recordsText}
            onChange={(e) => onRecordsTextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={Math.min(18, Math.max(10, lines.length))}
            spellCheck={false}
            className="min-h-[220px] w-full resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-600"
          />
        </div>

        {recordsError && (
          <div
            role="alert"
            className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
          >
            <span className="font-semibold">Records Error: </span>
            {recordsError}
          </div>
        )}
      </div>
    </section>
  );
}
