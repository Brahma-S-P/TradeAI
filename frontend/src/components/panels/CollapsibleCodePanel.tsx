import { useRef, useState } from "react";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { Code2, PanelLeftOpen, PanelLeftClose, Check, Eye, Braces } from "lucide-react";
import { Panel, ResizeHandle } from "./ResizablePanel";
import { SectionLabel } from "./SectionLabel";
import { RunControls } from "./RunControls";
import { SaveStrategyButton } from "./SaveStrategyButton";
import { VisualStrategyBuilder, type ConditionTree } from "./VisualStrategyBuilder";
import { StrategyTemplateLibrary } from "./StrategyTemplateLibrary";
import { cn } from "@/lib/cn";

export type BuilderMode = "code" | "visual";

interface CollapsibleCodePanelProps {
  code: string;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  onSave: () => void;
  onUpdate: () => void;
  canUpdate: boolean;
  runStatus: "idle" | "running" | "completed" | "error";
  defaultSize?: number;
  minSize?: number;
  builderMode: BuilderMode;
  onBuilderModeChange: (mode: BuilderMode) => void;
  conditions: ConditionTree;
  onConditionsChange: (c: ConditionTree) => void;
  onRunVisual: () => void;
  visualRunning?: boolean;
}

export function CollapsibleCodePanel({
  code,
  onCodeChange,
  onRun,
  onSave,
  onUpdate,
  canUpdate,
  runStatus,
  defaultSize = 35,
  minSize = 10,
  builderMode,
  onBuilderModeChange,
  conditions,
  onConditionsChange,
  onRunVisual,
  visualRunning,
}: CollapsibleCodePanelProps) {
  const panelRef = useRef<ImperativePanelHandle>(null);
  const [collapsed, setCollapsed] = useState(false);

  function handleToggle() {
    if (collapsed) {
      panelRef.current?.expand();
    } else {
      panelRef.current?.collapse();
    }
  }

  return (
    <>
      <ResizeHandle />
      <Panel
        ref={panelRef}
        defaultSize={defaultSize}
        minSize={minSize}
        collapsible
        collapsedSize={4}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
        {collapsed ? (
          <div className="flex h-full items-center justify-center border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
            <button
              onClick={handleToggle}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              title="Expand code editor"
            >
              <Code2 size={13} />
              <span>Code</span>
              <PanelLeftOpen size={13} />
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col border-y border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggle}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  title="Collapse code editor"
                >
                  <PanelLeftClose size={13} />
                </button>
                <div className="flex rounded-md border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => onBuilderModeChange("code")}
                    className={cn(
                      "flex items-center gap-1 rounded-l-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      builderMode === "code"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <Braces size={10} /> Code
                  </button>
                  <button
                    onClick={() => onBuilderModeChange("visual")}
                    className={cn(
                      "flex items-center gap-1 rounded-r-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                      builderMode === "visual"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <Eye size={10} /> Visual
                  </button>
                </div>
              </div>
              {builderMode === "code" && (
                <div className="flex items-center gap-1.5">
                  {canUpdate && (
                    <button
                      onClick={onUpdate}
                      disabled={!code}
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
                        "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50",
                        "dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      )}
                    >
                      <Check size={11} />
                      Update
                    </button>
                  )}
                  <SaveStrategyButton disabled={!code} onSave={onSave} label="Save" />
                </div>
              )}
            </div>

            {builderMode === "code" ? (
              <>
                <div className="flex-1 overflow-hidden px-2.5">
                  <textarea
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value)}
                    placeholder={"# Write your strategy here.\n# Or use the AI chat to generate one.\n\ndef analyze_stocks(sdk, symbols):\n    ..."}
                    spellCheck={false}
                    className="h-full w-full resize-none rounded-md border border-slate-200 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-400 outline-none placeholder:text-slate-600 dark:border-slate-800"
                  />
                </div>
                <div className="flex items-center px-2.5 py-1.5">
                  <RunControls status={runStatus} onRun={onRun} onStop={() => {}} onRerun={onRun} />
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-auto">
                <VisualStrategyBuilder
                  conditions={conditions}
                  onChange={onConditionsChange}
                  onRun={onRunVisual}
                  running={visualRunning}
                />
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <StrategyTemplateLibrary onLoad={onConditionsChange} />
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
