import React from 'react';
import { Button } from '../ui/button';
import { Command, PanelLeft } from 'lucide-react';
import { useSidebar } from '../ui/sidebar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

const SidebarLeftToggleButton: React.FC = () => {
  const { toggle } = useSidebar();

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-8 w-8 text-muted-foreground hover:bg-background/80 [-webkit-app-region:no-drag]"
            aria-label="Toggle left sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          <span className="flex items-center gap-1">
            <Command className="h-3 w-3" aria-hidden="true" />B
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SidebarLeftToggleButton;
