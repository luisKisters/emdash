import React from 'react';

export const WorkspaceNotice: React.FC<{ workspaceName: string }> = ({ workspaceName }) => {
  return (
    <div className="text-sm text-gray-700 dark:text-gray-200">
      You're working in workspace <span className="font-medium">{workspaceName}</span>.
    </div>
  );
};

export default WorkspaceNotice;
