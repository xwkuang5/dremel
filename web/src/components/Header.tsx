import {
  Check,
  Database,
  Moon,
  RotateCcw,
  Share2,
  Sun,
  Zap,
} from "lucide-react";
import { DremelPreset } from "../dremel";

interface HeaderProps {
  presets: DremelPreset[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onResetDefault: () => void;
  onShareLink: () => void;
  copiedShare: boolean;
  recordCount: number;
  selectedColumnCount: number;
  totalColumnCount: number;
  computeMs: number;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Header({
  presets,
  activePresetId,
  onSelectPreset,
  onResetDefault,
  onShareLink,
  copiedShare,
  recordCount,
  selectedColumnCount,
  totalColumnCount,
  computeMs,
  isDark,
  onToggleTheme,
}: HeaderProps) {
  const formattedTime = computeMs < 1 ? "<1ms" : `${computeMs.toFixed(1)}ms`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20">
            <Database className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg">
                Dremel Explorer
              </h1>
              <span className="hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300 sm:inline-flex">
                <Zap className="h-3 w-3" />
                {recordCount} {recordCount === 1 ? "record" : "records"} ·{" "}
                {selectedColumnCount}/{totalColumnCount} cols · {formattedTime}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Columnar Record Shredding &amp; Finite State Machine Assembly
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="preset-select"
              className="hidden text-xs font-medium text-slate-500 dark:text-slate-400 md:inline"
            >
              Preset
            </label>
            <select
              id="preset-select"
              aria-label="Example Preset"
              value={activePresetId}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
              {activePresetId === "custom" && (
                <option value="custom">Custom Workspace</option>
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={onResetDefault}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Reset to default Dremel Paper example"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset Default</span>
          </button>

          <button
            type="button"
            onClick={onShareLink}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Copy shareable URL with current schema, records, and projection"
          >
            {copiedShare ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">
                  Copied!
                </span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile jump pills */}
      <nav
        aria-label="Quick sections"
        className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 px-4 py-1.5 text-xs dark:border-slate-800/80 lg:hidden"
      >
        {[
          ["#schema-section", "Schema"],
          ["#records-section", "Records"],
          ["#shredded-section", "Columns"],
          ["#fsm-section", "FSM"],
          ["#assembly-section", "Assembly"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
