import React from 'react';
import { Button } from '../ui/button';
import { Command, PanelRight } from 'lucide-react';
import { useRightSidebar } from '../ui/right-sidebar';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

const SidebarRightToggleButton: React.FC = () => {
  const { toggle } = useRightSidebar();

  const label = 'Toggle right sidebar';

  const handleClick = () => {
    toggle();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className="h-8 w-8 text-muted-foreground [-webkit-app-region:no-drag] hover:bg-background/80"
            aria-label={label}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          <span className="flex items-center gap-1">
            <Command className="h-3 w-3" aria-hidden="true" />
            <span>.</span>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SidebarRightToggleButton;
