import React, { useState } from 'react'
import { Repo } from '../types'

interface SidebarProps {
  repos: Repo[]
  selectedRepo: Repo | null
  onRepoSelect: (repo: Repo) => void
  onAddRepo: () => void
}

const Sidebar: React.FC<SidebarProps> = ({
  repos,
  selectedRepo,
  onRepoSelect,
  onAddRepo,
}) => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set(['default']))

  const toggleWorkspace = (workspaceId: string) => {
    const newExpanded = new Set(expandedWorkspaces)
    if (newExpanded.has(workspaceId)) {
      newExpanded.delete(workspaceId)
    } else {
      newExpanded.add(workspaceId)
    }
    setExpandedWorkspaces(newExpanded)
  }

  const formatLastActivity = (activity?: string) => {
    if (!activity) return ''
    const date = new Date(activity)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          <span className="font-semibold text-white">emdash</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div
            className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors"
            onClick={() => toggleWorkspace('default')}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-400">
                {expandedWorkspaces.has('default') ? '▼' : '▶'}
              </span>
              <span className="text-sm font-medium text-gray-300">Repositories</span>
            </div>
            <button
              className="text-gray-400 hover:text-white text-lg"
              onClick={(e) => {
                e.stopPropagation()
                onAddRepo()
              }}
            >
              +
            </button>
          </div>

          {expandedWorkspaces.has('default') && (
            <div className="ml-4 mt-1">
              {repos.length === 0 ? (
                <div className="p-3 text-gray-500 text-sm">
                  No repositories found
                </div>
              ) : (
                repos.map((repo) => (
                  <div
                    key={repo.id}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      selectedRepo?.id === repo.id
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-700 text-gray-300'
                    }`}
                    onClick={() => onRepoSelect(repo)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">📁</span>
                        <span className="text-sm font-medium truncate">
                          {repo.path.split('/').pop()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {repo.changes && (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-green-400">+{repo.changes.added}</span>
                            <span className="text-red-400">-{repo.changes.removed}</span>
                          </div>
                        )}
                        <span className="text-xs text-gray-500">
                          {formatLastActivity(repo.lastActivity)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      {repo.origin}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Sidebar
