import React, { useState } from 'react';
import { GitBranch, Plus, Minus, FileText, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useFileChanges, type FileChange } from '../hooks/useFileChanges';

interface FileChangesPanelProps {
  workspaceId: string; // Actually the workspace path
  className?: string;
}

export const FileChangesPanel: React.FC<FileChangesPanelProps> = ({
  workspaceId,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { fileChanges, isLoading, error, refreshChanges } = useFileChanges(workspaceId);

  const getStatusIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return <Plus className="w-3 h-3 text-gray-600" />;
      case 'modified':
        return <FileText className="w-3 h-3 text-gray-600" />;
      case 'deleted':
        return <Minus className="w-3 h-3 text-gray-600" />;
      case 'renamed':
        return <GitBranch className="w-3 h-3 text-gray-600" />;
    }
  };

  const getStatusColor = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'modified':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'deleted':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'renamed':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  };

  const totalChanges = fileChanges.reduce((acc, change) => ({
    additions: acc.additions + change.additions,
    deletions: acc.deletions + change.deletions,
  }), { additions: 0, deletions: 0 });

  if (isLoading) {
    return (
      <div className={`bg-white border-b border-gray-200 ${className}`}>
        <div className="p-4">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
            <span className="ml-2 text-sm text-gray-600">Loading changes...</span>
          </div>
        </div>
      </div>
    );
  }

  if (fileChanges.length === 0 && !isLoading) {
    return (
      <div className={`bg-white border-b border-gray-200 ${className}`}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GitBranch className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">No changes</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshChanges}
              disabled={isLoading}
              className="p-1 h-auto"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border-b border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 h-auto"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </Button>
            <GitBranch className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              {fileChanges.length} files changed
            </span>
            <div className="flex items-center space-x-1 text-xs">
              <span className="text-green-600 font-medium">+{totalChanges.additions}</span>
              <span className="text-gray-400">•</span>
              <span className="text-red-600 font-medium">-{totalChanges.deletions}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshChanges}
              disabled={isLoading}
              className="p-1 h-auto"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" className="text-xs">
              Create PR
            </Button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-64 overflow-y-auto">
          {fileChanges.map((change, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className={`p-1 rounded border ${getStatusColor(change.status)}`}>
                  {getStatusIcon(change.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {change.path}
                  </div>
                  <div className="text-xs text-gray-500 capitalize">
                    {change.status}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                {change.additions > 0 && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                    +{change.additions}
                  </span>
                )}
                {change.deletions > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                    -{change.deletions}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileChangesPanel;
