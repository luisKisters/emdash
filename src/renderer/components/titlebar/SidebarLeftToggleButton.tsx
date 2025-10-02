import React from "react";
import { Button } from "../ui/button";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "../ui/sidebar";

const SidebarLeftToggleButton: React.FC = () => {
  const { toggle } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-8 w-8 text-muted-foreground hover:bg-background/80 [-webkit-app-region:no-drag]"
      aria-label="Toggle left sidebar"
      title="Toggle left sidebar"
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
};

export default SidebarLeftToggleButton;
