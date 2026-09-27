import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type PanelGroupProps,
} from "react-resizable-panels";
import { cn } from "@/lib/cn";

export function ResizableGroup(props: PanelGroupProps) {
  return <PanelGroup {...props} />;
}

export { Panel };

export function ResizeHandle({ className }: { className?: string }) {
  return (
    <PanelResizeHandle
      className={cn(
        "group relative flex items-center justify-center bg-transparent",
        "data-[panel-group-direction=horizontal]:w-2 data-[panel-group-direction=horizontal]:cursor-col-resize",
        "data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:cursor-row-resize",
        className
      )}
    >
      <div
        className={cn(
          "bg-slate-300 transition-colors group-hover:bg-indigo-400 dark:bg-slate-600 dark:group-hover:bg-indigo-500",
          "group-data-[panel-group-direction=horizontal]:h-8 group-data-[panel-group-direction=horizontal]:w-1 group-data-[panel-group-direction=horizontal]:rounded-full",
          "group-data-[panel-group-direction=vertical]:h-[2px] group-data-[panel-group-direction=vertical]:w-full"
        )}
      />
    </PanelResizeHandle>
  );
}
