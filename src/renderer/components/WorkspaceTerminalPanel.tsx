import React from 'react'
import { TerminalPane } from './TerminalPane'
import { Bot, Terminal } from 'lucide-react'

interface Workspace {
  id: string
  name: string
  branch: string
  path: string
  status: 'active' | 'idle' | 'running'
}

interface Props {
  workspace: Workspace | null
  className?: string
}

export const WorkspaceTerminalPanel: React.FC<Props> = ({ workspace, className }) => {
  if (!workspace) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
        <Bot className="w-8 h-8 text-gray-400 mb-2" />
        <h3 className="text-sm font-serif text-gray-600 dark:text-gray-400 mb-1">
          No Workspace Selected
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
          Select a workspace to view its terminal
        </p>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center space-x-3">
          <Terminal className="w-5 h-5 text-gray-600" />
          <div>
            <h3 className="font-serif font-medium text-gray-900 dark:text-gray-100">
              {workspace.name}
            </h3>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          workspace.status === 'active' 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : workspace.status === 'running'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
        }`}>
          {workspace.status}
        </div>
      </div>

      <div className="flex-1 bg-gray-900 overflow-hidden">
        <TerminalPane 
          id={`workspace-${workspace.id}`}
          cwd={workspace.path}
          className="h-full w-full"
          cols={40}
        />
      </div>
    </div>
  )
}

export default WorkspaceTerminalPanel
