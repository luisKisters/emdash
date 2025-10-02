import React from "react";
import SidebarLeftToggleButton from "./SidebarLeftToggleButton";
import SidebarRightToggleButton from "./SidebarRightToggleButton";

const Titlebar: React.FC = () => {
  return (
    <header className="fixed top-0 inset-x-0 h-9 border-b border-border bg-gray-50 dark:bg-gray-900 flex items-center justify-end pr-2 [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <SidebarLeftToggleButton />
        <SidebarRightToggleButton />
      </div>
    </header>
  );
};

export default Titlebar;
