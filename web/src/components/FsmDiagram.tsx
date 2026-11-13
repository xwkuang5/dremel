import { AlertTriangle, GitBranch, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AssemblyTraceStep,
  ColumnDescriptor,
  END,
  findDescriptorInMap,
  FsmGraph,
} from "../dremel";

interface FsmDiagramProps {
  fsm: FsmGraph | null;
  selectedDescriptors: ColumnDescriptor[];
  activeStep: AssemblyTraceStep | null;
  isStale: boolean;
}

interface GroupedEdge {
  fromIdx: number;
  toIdx: number; // selectedDescriptors.length represents END
  fromPath: string;
  toPath: string;
  levels: number[];
  kind: "forward" | "self" | "back";
}

const NODE_W = 164;
const NODE_H = 58;
const GAP_X = 64;
const END_R = 26;
const PADDING_X = 36;

export function FsmDiagram({
  fsm,
  selectedDescriptors,
  activeStep,
  isStale,
}: FsmDiagramProps) {
  const [zoom, setZoom] = useState(1);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!fsm || selectedDescriptors.length === 0) {
      return null;
    }

    const n = selectedDescriptors.length;
    const endIdx = n;
    const pathToIdx = new Map<string, number>();
    selectedDescriptors.forEach((d, idx) => pathToIdx.set(d.fullPath, idx));

    const edges: GroupedEdge[] = [];
    for (let i = 0; i < n; i++) {
      const desc = selectedDescriptors[i];
      const transitions = findDescriptorInMap(fsm, desc);
      if (!transitions) continue;

      const byTarget = new Map<number, number[]>();
      for (const [level, target] of transitions.entries()) {
        const targetIdx =
          target === END ? endIdx : (pathToIdx.get(target.fullPath) ?? endIdx);
        const list = byTarget.get(targetIdx) ?? [];
        list.push(level);
        byTarget.set(targetIdx, list);
      }

      for (const [toIdx, levels] of byTarget.entries()) {
        levels.sort((a, b) => a - b);
        const kind: GroupedEdge["kind"] =
          toIdx === i ? "self" : toIdx > i ? "forward" : "back";
        edges.push({
          fromIdx: i,
          toIdx,
          fromPath: desc.fullPath,
          toPath:
            toIdx === endIdx ? "END" : selectedDescriptors[toIdx].fullPath,
          levels,
          kind,
        });
      }
    }

    const hasSelfLoops = edges.some((e) => e.kind === "self");
    const maxBackSpan = edges.reduce(
      (max, e) => (e.kind === "back" ? Math.max(max, e.fromIdx - e.toIdx) : max),
      0,
    );

    const topSpace = hasSelfLoops ? 74 : 28;
    const bottomSpace = maxBackSpan > 0 ? 44 + maxBackSpan * 36 : 32;
    const nodeY = topSpace;
    const spineY = nodeY + NODE_H / 2;

    const nodeCentersX: number[] = [];
    for (let i = 0; i < n; i++) {
      nodeCentersX.push(PADDING_X + i * (NODE_W + GAP_X) + NODE_W / 2);
    }
    const endCenterX =
      PADDING_X + n * (NODE_W + GAP_X) + END_R;
    nodeCentersX.push(endCenterX);

    const svgWidth = endCenterX + END_R + PADDING_X;
    const svgHeight = nodeY + NODE_H + bottomSpace;

    return {
      n,
      endIdx,
      edges,
      nodeY,
      spineY,
      nodeCentersX,
      svgWidth,
      svgHeight,
    };
  }, [fsm, selectedDescriptors]);

  return (
    <section
      id="fsm-section"
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Assembly FSM
          </h2>
          {isStale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              Showing last valid state
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 sm:flex">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              barrier / next
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              self-loop
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              repeat jump
            </span>
          </div>

          {layout && (
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
                aria-label="Zoom out FSM"
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[40px] text-center font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                aria-label="Zoom in FSM"
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset FSM zoom"
                className="rounded p-1 text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {!layout ? (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            Select at least one column in Projected Columns to build the FSM and
            assemble records.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/60">
            <svg
              role="img"
              aria-label="Dremel Assembly Finite State Machine"
              width={layout.svgWidth * zoom}
              height={layout.svgHeight * zoom}
              viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
              className="mx-auto block select-none"
            >
              <defs>
                <marker
                  id="arrow-forward"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>
                <marker
                  id="arrow-self"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" />
                </marker>
                <marker
                  id="arrow-back"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                </marker>
                <marker
                  id="arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#4f46e5" />
                </marker>
              </defs>

              {/* Edges */}
              {layout.edges.map((edge) => {
                const isStepperEdge =
                  activeStep !== null &&
                  activeStep.columnPath === edge.fromPath &&
                  activeStep.nextColumnPath === edge.toPath &&
                  edge.levels.includes(activeStep.nextRepetitionLevel);

                const isHoveredEdge =
                  hoveredPath !== null &&
                  (edge.fromPath === hoveredPath || edge.toPath === hoveredPath);

                const dimmed =
                  (hoveredPath !== null && !isHoveredEdge && !isStepperEdge) ||
                  (activeStep !== null &&
                    hoveredPath === null &&
                    !isStepperEdge);

                const strokeColor = isStepperEdge
                  ? "#4f46e5"
                  : edge.kind === "forward"
                    ? "#10b981"
                    : edge.kind === "self"
                      ? "#8b5cf6"
                      : "#f59e0b";

                const markerId = isStepperEdge
                  ? "url(#arrow-active)"
                  : edge.kind === "forward"
                    ? "url(#arrow-forward)"
                    : edge.kind === "self"
                      ? "url(#arrow-self)"
                      : "url(#arrow-back)";

                const labelText = `r=${edge.levels.join(",")}`;
                const pillWidth = Math.max(36, labelText.length * 7 + 12);

                if (edge.kind === "forward") {
                  const startX =
                    layout.nodeCentersX[edge.fromIdx] + NODE_W / 2;
                  const endX =
                    edge.toIdx === layout.endIdx
                      ? layout.nodeCentersX[edge.toIdx] - END_R - 4
                      : layout.nodeCentersX[edge.toIdx] - NODE_W / 2 - 4;
                  const midX = (startX + endX) / 2;
                  const y = layout.spineY;

                  return (
                    <g
                      key={`${edge.fromIdx}-${edge.toIdx}`}
                      opacity={dimmed ? 0.28 : 1}
                    >
                      <line
                        x1={startX}
                        y1={y}
                        x2={endX}
                        y2={y}
                        stroke={strokeColor}
                        strokeWidth={isStepperEdge ? 3 : 2}
                        markerEnd={markerId}
                      />
                      <rect
                        x={midX - pillWidth / 2}
                        y={y - 21}
                        width={pillWidth}
                        height={16}
                        rx={8}
                        className="fill-white stroke-emerald-300 dark:fill-slate-900 dark:stroke-emerald-700"
                        strokeWidth={1}
                      />
                      <text
                        x={midX}
                        y={y - 10}
                        textAnchor="middle"
                        className="fill-emerald-700 font-mono text-[10px] font-semibold dark:fill-emerald-300"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                }

                if (edge.kind === "self") {
                  const cx = layout.nodeCentersX[edge.fromIdx];
                  const topY = layout.nodeY;
                  const x1 = cx - 24;
                  const x2 = cx + 24;
                  const ctrlY = topY - 48;
                  const labelY = topY - 42;

                  return (
                    <g
                      key={`${edge.fromIdx}-self`}
                      opacity={dimmed ? 0.28 : 1}
                    >
                      <path
                        d={`M ${x1} ${topY} C ${x1 - 12} ${ctrlY}, ${x2 + 12} ${ctrlY}, ${x2} ${topY - 4}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isStepperEdge ? 3 : 2}
                        markerEnd={markerId}
                      />
                      <rect
                        x={cx - pillWidth / 2}
                        y={labelY - 12}
                        width={pillWidth}
                        height={16}
                        rx={8}
                        className="fill-white stroke-violet-300 dark:fill-slate-900 dark:stroke-violet-700"
                        strokeWidth={1}
                      />
                      <text
                        x={cx}
                        y={labelY - 1}
                        textAnchor="middle"
                        className="fill-violet-700 font-mono text-[10px] font-semibold dark:fill-violet-300"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                }

                // Back edge below spine
                const span = edge.fromIdx - edge.toIdx;
                const fromX = layout.nodeCentersX[edge.fromIdx] - 16;
                const toX = layout.nodeCentersX[edge.toIdx] + 16;
                const bottomY = layout.nodeY + NODE_H;
                const depth = 26 + span * 32;
                const midX = (fromX + toX) / 2;
                const peakY = bottomY + depth * 0.78;

                return (
                  <g
                    key={`${edge.fromIdx}-back-${edge.toIdx}`}
                    opacity={dimmed ? 0.28 : 1}
                  >
                    <path
                      d={`M ${fromX} ${bottomY} C ${fromX} ${bottomY + depth}, ${toX} ${bottomY + depth}, ${toX} ${bottomY + 4}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isStepperEdge ? 3 : 2}
                      markerEnd={markerId}
                    />
                    <rect
                      x={midX - pillWidth / 2}
                      y={peakY - 8}
                      width={pillWidth}
                      height={16}
                      rx={8}
                      className="fill-white stroke-amber-300 dark:fill-slate-900 dark:stroke-amber-700"
                      strokeWidth={1}
                    />
                    <text
                      x={midX}
                      y={peakY + 3}
                      textAnchor="middle"
                      className="fill-amber-700 font-mono text-[10px] font-semibold dark:fill-amber-300"
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}

              {/* Field Nodes */}
              {selectedDescriptors.map((desc, i) => {
                const cx = layout.nodeCentersX[i];
                const x = cx - NODE_W / 2;
                const y = layout.nodeY;
                const isActiveNode =
                  activeStep !== null &&
                  activeStep.columnPath === desc.fullPath;
                const isTargetNode =
                  activeStep !== null &&
                  activeStep.nextColumnPath === desc.fullPath;
                const isHovered = hoveredPath === desc.fullPath;

                const shortLabel =
                  desc.fullPath.length > 20
                    ? `…${desc.fullPath.slice(-19)}`
                    : desc.fullPath;

                return (
                  <g
                    key={desc.fullPath}
                    onMouseEnter={() => setHoveredPath(desc.fullPath)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className="cursor-pointer"
                  >
                    <title>{`${desc.fullPath} (Max R=${desc.maxRepetitionLevel}, Max D=${desc.maxDefinitionLevel})`}</title>
                    <rect
                      x={x}
                      y={y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      className={
                        isActiveNode
                          ? "fill-indigo-50 stroke-indigo-600 dark:fill-indigo-950/90 dark:stroke-indigo-400"
                          : isTargetNode
                            ? "fill-emerald-50 stroke-emerald-500 dark:fill-emerald-950/70 dark:stroke-emerald-400"
                            : isHovered
                              ? "fill-slate-50 stroke-indigo-400 dark:fill-slate-800 dark:stroke-indigo-400"
                              : "fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-700"
                      }
                      strokeWidth={isActiveNode || isHovered ? 2.5 : 1.5}
                    />
                    <text
                      x={cx}
                      y={y + 24}
                      textAnchor="middle"
                      className="fill-slate-900 font-mono text-[11px] font-semibold dark:fill-slate-100"
                    >
                      {shortLabel}
                    </text>
                    <text
                      x={cx}
                      y={y + 42}
                      textAnchor="middle"
                      className="fill-slate-500 font-mono text-[10px] dark:fill-slate-400"
                    >
                      Max R={desc.maxRepetitionLevel} · Max D=
                      {desc.maxDefinitionLevel}
                    </text>
                  </g>
                );
              })}

              {/* END node (double circle) */}
              {(() => {
                const endCx = layout.nodeCentersX[layout.endIdx];
                const isEndActive =
                  activeStep !== null && activeStep.nextColumnPath === "END";
                return (
                  <g
                    onMouseEnter={() => setHoveredPath("END")}
                    onMouseLeave={() => setHoveredPath(null)}
                  >
                    <circle
                      cx={endCx}
                      cy={layout.spineY}
                      r={END_R}
                      className={
                        isEndActive
                          ? "fill-indigo-50 stroke-indigo-600 dark:fill-indigo-950 dark:stroke-indigo-400"
                          : "fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500"
                      }
                      strokeWidth={2}
                    />
                    <circle
                      cx={endCx}
                      cy={layout.spineY}
                      r={END_R - 5}
                      fill="none"
                      className={
                        isEndActive
                          ? "stroke-indigo-600 dark:stroke-indigo-400"
                          : "stroke-slate-400 dark:stroke-slate-500"
                      }
                      strokeWidth={1.5}
                    />
                    <text
                      x={endCx}
                      y={layout.spineY + 4}
                      textAnchor="middle"
                      className="fill-slate-800 font-mono text-[11px] font-bold dark:fill-slate-100"
                    >
                      END
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}
