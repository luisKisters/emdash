import React from "react";
import { cn } from "@/lib/utils";
import FileChangesPanel from "./FileChangesPanel";
import WorkspaceTerminalPanel from "./WorkspaceTerminalPanel";
import { useRightSidebar } from "./ui/right-sidebar";

export interface RightSidebarWorkspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: "active" | "idle" | "running";
  agentId?: string;
}

interface RightSidebarProps {
  workspace: RightSidebarWorkspace | null;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ workspace }) => {
  const { collapsed, width } = useRightSidebar();
  const resolvedWidth = Math.max(width, 0);
  const style = {
    "--right-sidebar-width": `${resolvedWidth}px`,
  } as React.CSSProperties;

  return (
    <aside
      data-state={collapsed ? "collapsed" : "open"}
      className={cn(
        "group/right-sidebar relative z-30 flex h-full flex-col border-l border-border bg-muted/10 transition-all duration-200 ease-linear overflow-hidden flex-shrink-0",
        "w-[var(--right-sidebar-width,20rem)] min-w-[var(--right-sidebar-width,20rem)]",
        "data-[state=collapsed]:w-0 data-[state=collapsed]:min-w-0 data-[state=collapsed]:border-l-0 data-[state=collapsed]:pointer-events-none"
      )}
      style={style}
      aria-hidden={collapsed}
    >
      <div className="flex h-full w-[var(--right-sidebar-width,20rem)] min-w-[var(--right-sidebar-width,20rem)] flex-shrink-0 flex-col">
        {workspace ? (
          <div className="flex h-full flex-col">
            <FileChangesPanel
              workspaceId={workspace.path}
              className="flex-1 min-h-0 border-b border-border"
            />
            <WorkspaceTerminalPanel
              workspace={workspace}
              className="flex-1 min-h-0"
            />
          </div>
        ) : (
          <div className="flex h-full flex-col text-sm text-muted-foreground">
            <div className="flex flex-1 flex-col border-b border-border bg-background">
              <div className="px-3 py-2 border-b border-border bg-gray-50 dark:bg-gray-900 text-foreground text-sm font-medium">
                Changes
              </div>
              <div className="flex flex-1 items-center justify-center px-4 text-center">
                Select a workspace to review file changes.
              </div>
            </div>
            <div className="flex flex-1 flex-col bg-background border-t border-border">
              <div className="px-3 py-2 border-b border-border bg-gray-50 dark:bg-gray-900 text-foreground text-sm font-medium">
                Terminal
              </div>
              <div className="flex flex-1 items-center justify-center px-4 text-center">
                Select a workspace to open its terminal.
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default RightSidebar;
