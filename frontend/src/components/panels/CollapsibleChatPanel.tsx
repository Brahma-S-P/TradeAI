import { useRef, useState } from "react";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { Panel, ResizeHandle, ResizableGroup } from "./ResizablePanel";
import { AIChatPanel, type AIChatPanelProps } from "./AIChatPanel";
import { LogPanel } from "./LogPanel";

interface CollapsibleChatPanelProps extends AIChatPanelProps {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

export function CollapsibleChatPanel({
  defaultSize = 30,
  minSize = 15,
  maxSize = 50,
  ...chatProps
}: CollapsibleChatPanelProps) {
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
        maxSize={maxSize}
        collapsible
        collapsedSize={3}
        onCollapse={() => setCollapsed(true)}
        onExpand={() => setCollapsed(false)}
      >
        {collapsed ? (
          <AIChatPanel {...chatProps} collapsed={collapsed} onToggleCollapse={handleToggle} />
        ) : (
          <ResizableGroup direction="vertical" className="h-full">
            <Panel defaultSize={65} minSize={25}>
              <AIChatPanel {...chatProps} collapsed={collapsed} onToggleCollapse={handleToggle} />
            </Panel>
            <ResizeHandle />
            <Panel defaultSize={35} minSize={10}>
              <LogPanel />
            </Panel>
          </ResizableGroup>
        )}
      </Panel>
    </>
  );
}
