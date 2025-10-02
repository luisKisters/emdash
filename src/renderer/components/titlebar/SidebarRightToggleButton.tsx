import React from "react";
import { Button } from "../ui/button";
import { PanelRight } from "lucide-react";
import { useRightSidebar } from "../ui/right-sidebar";

const SidebarRightToggleButton: React.FC = () => {
  const { collapsed, toggle } = useRightSidebar();

  const label = "Toggle right sidebar (⌘.)";

  const handleClick = () => {
    console.log(
      `[RightSidebar] Toggle requested via titlebar button. Current state: ${collapsed ? "collapsed" : "expanded"}`
    );
    toggle();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleClick}
      className="h-8 w-8 text-muted-foreground hover:bg-background/80 [-webkit-app-region:no-drag]"
      aria-label={label}
      title={label}
    >
      <PanelRight className="h-4 w-4" />
    </Button>
  );
};

export default SidebarRightToggleButton;
