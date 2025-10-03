import React from 'react';
import SidebarLeftToggleButton from './SidebarLeftToggleButton';
import SidebarRightToggleButton from './SidebarRightToggleButton';

const Titlebar: React.FC = () => {
  return (
    <header className="fixed top-0 inset-x-0 h-[var(--tb,36px)] bg-gray-50 dark:bg-gray-900 flex items-center justify-end pr-2 shadow-[inset_0_-1px_0_hsl(var(--border))] [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <SidebarLeftToggleButton />
        <SidebarRightToggleButton />
      </div>
    </header>
  );
};

export default Titlebar;
