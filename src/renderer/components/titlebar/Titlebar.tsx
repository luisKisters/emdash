import React from "react";
import SidebarToggleButton from "./SidebarToggleButton";

const Titlebar: React.FC = () => {
  return (
    <header className="fixed top-0 inset-x-0 h-9 border-b border-border bg-gray-50 dark:bg-gray-900 flex items-center justify-end pr-2 [-webkit-app-region:drag]">
      <div className="[-webkit-app-region:no-drag]">
        <SidebarToggleButton />
      </div>
    </header>
  );
};

export default Titlebar;
