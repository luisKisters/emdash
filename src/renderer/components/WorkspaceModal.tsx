import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { X, GitBranch, Bot } from 'lucide-react';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateWorkspace: (name: string) => void;
  projectName: string;
  defaultBranch: string;
}

const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreateWorkspace,
  projectName,
  defaultBranch,
}) => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    
    setIsCreating(true);
    try {
      await onCreateWorkspace(workspaceName.trim());
      setWorkspaceName('');
      onClose();
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg font-serif">New workspace</CardTitle>
            <CardDescription>
              {projectName} • Branching from origin/{defaultBranch}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="workspace-name" className="block text-sm font-medium mb-2">
                What are you working on?
              </label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Describe your task..."
                className="w-full"
                autoFocus
              />
            </div>

            <div className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <GitBranch className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {workspaceName || 'workspace-name'}
              </span>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!workspaceName.trim() || isCreating}
                className="bg-black text-white hover:bg-gray-800 font-serif"
              >
                {isCreating ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create workspace'
                )}
              </Button>
            </div>
          </form>

          {/* Additional Info */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p className="mb-2">
                <strong>Linear Integration:</strong> You can create workspaces from Linear issues.
              </p>
              <Button variant="ghost" size="sm" className="text-xs p-0 h-auto">
                Link Linear →
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Pull requests</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No open pull requests found
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              orcbench runs a <strong>setup script</strong> each time you create a new workspace.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkspaceModal;
