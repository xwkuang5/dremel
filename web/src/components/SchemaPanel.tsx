import { ChevronDown, ChevronRight, FolderTree, ListFilter, Sparkles } from "lucide-react";
import { useState } from "react";
import { ColumnDescriptor } from "../dremel";

interface SchemaPanelProps {
  schemaText: string;
  onSchemaTextChange: (next: string) => void;
  onLoadExampleSchema: () => void;
  parsedRoot: ColumnDescriptor | null;
  schemaError: string | null;
}

function SchemaTreeNode({
  node,
  depth = 0,
}: {
  node: ColumnDescriptor;
  depth?: number;
}) {
  const children = Array.from(node.children.values());
  const isRoot = node.path === "$";

  if (isRoot) {
    return (
      <div className="space-y-1 font-mono text-xs">
        {children.map((child) => (
          <SchemaTreeNode key={child.fullPath} node={child} depth={0} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        className="flex flex-wrap items-center justify-between gap-1.5 rounded-md px-2 py-1 hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
        style={{ marginLeft: `${depth * 14}px` }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              node.isLeaf
                ? "bg-indigo-500 dark:bg-indigo-400"
                : "bg-slate-400 dark:bg-slate-500"
            }`}
          />
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {node.path}
            {node.isRepeated ? "[*]" : ""}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              node.isRepeated
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {node.isRepeated ? "repeated" : "optional"}
          </span>
          {!node.isLeaf && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              group
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900">
            R={node.maxRepetitionLevel}
          </span>
          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900">
            D={node.maxDefinitionLevel}
          </span>
          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900">
            L={node.treeLevel}
          </span>
        </div>
      </div>
      {children.map((child) => (
        <SchemaTreeNode key={child.fullPath} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function SchemaPanel({
  schemaText,
  onSchemaTextChange,
  onLoadExampleSchema,
  parsedRoot,
  schemaError,
}: SchemaPanelProps) {
  const [treeExpanded, setTreeExpanded] = useState(true);
  const lines = schemaText.split("\n");

  return (
    <section
      id="schema-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Schema Paths
          </h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            [*] = repeated
          </span>
        </div>
        <button
          type="button"
          onClick={onLoadExampleSchema}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Sparkles className="h-3 w-3 text-indigo-500" />
          Load Example Schema
        </button>
      </div>

      <div className="p-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950/70">
          <div
            aria-hidden="true"
            className="select-none border-r border-slate-200 bg-slate-100/80 px-2.5 py-2.5 text-right font-mono text-xs leading-5 text-slate-400 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-500"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            aria-label="Schema (one path per line)"
            value={schemaText}
            onChange={(e) => onSchemaTextChange(e.target.value)}
            rows={Math.max(6, Math.min(10, lines.length))}
            spellCheck={false}
            placeholder="DocId&#10;Links.Forward[*]&#10;Name[*].Language[*].Code"
            className="w-full resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-600"
          />
        </div>

        {schemaError && (
          <div
            role="alert"
            className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
          >
            <span className="font-semibold">Schema Error: </span>
            {schemaError}
          </div>
        )}

        {parsedRoot && (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40">
            <button
              type="button"
              onClick={() => setTreeExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <span className="flex items-center gap-1.5">
                <FolderTree className="h-3.5 w-3.5 text-indigo-500" />
                Schema Tree Inspector (R / D / Tree Level)
              </span>
              {treeExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {treeExpanded && (
              <div className="max-h-56 overflow-y-auto border-t border-slate-200/80 p-2 dark:border-slate-800">
                <SchemaTreeNode node={parsedRoot} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
